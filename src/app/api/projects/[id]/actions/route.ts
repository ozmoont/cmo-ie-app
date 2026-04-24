import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAiUsage } from "@/lib/ai-usage-logger";
import {
  PLAN_LIMITS,
  type ActionPlan,
  type ActionItem,
  type ActionStep,
} from "@/lib/types";
import {
  getProject,
  getPrompts,
  getCompetitors,
  getDailyRuns,
  getResultsForRuns,
  getCitationsForResults,
  computeVisibilityGaps,
} from "@/lib/queries";

// ── Three Claude Teams ──
// 1. Gap Analyst - interprets the data and identifies root causes
// 2. Strategist - creates prioritised actions with effort/impact
// 3. Brief Writer - (called separately via /brief endpoint)

const GAP_ANALYST_SYSTEM = `You are a senior AI Search Visibility Analyst specialising in GEO (Generative Engine Optimisation).
You analyse visibility gaps — prompts where a brand is NOT being mentioned by AI models while competitors ARE.

HARD RULE — INDUSTRY LOCK:
You will be given a structured BRAND PROFILE with the brand's real market segment, target audience, and products. Every root-cause and competitor-advantage you emit must be scoped to THAT industry, not a generic agency / legal / B2B category. If the profile says the brand is a "digital / AI transformation agency", never frame the analysis as if the brand is a law firm, recruitment agency, or generic service business. Treat the profile as ground truth.

Given gap data, identify the root cause for each gap. Consider:
- What content competitors have that the brand lacks
- Why AI models prefer citing competitors for this query
- Content gaps, authority gaps, structured data gaps

Return JSON only, no markdown fences:
[{
  "promptText": string,
  "rootCause": string (2-3 sentences explaining WHY the brand is invisible, scoped to its actual industry per the brand profile),
  "competitorAdvantage": string (what competitors are doing right, in the brand's actual industry),
  "opportunityType": "content_gap" | "authority_gap" | "technical_gap" | "brand_gap"
}]`;

const STRATEGIST_SYSTEM = `You are a senior GEO (Generative Engine Optimisation) Strategist for the Irish market.
Given visibility gap analyses with root causes, create specific, actionable recommendations.

HARD RULE — INDUSTRY LOCK:
You will be given a structured BRAND PROFILE. Every action must be realistic for that brand's actual industry. A "digital / AI transformation agency" doesn't get law-firm content tactics; a legal firm doesn't get SaaS growth tactics. When recommending outreach targets, publications, communities, or content formats, pick ones that are credible for the specific segment in the profile. Generic "write a blog post" advice is a failure — be industry-specific.

Rules:
- Each gap should have 2-4 actions
- Actions must be specific and practical, not generic
- Consider the Irish market context
- Effort: "low" (< 1 week), "medium" (1-4 weeks), "high" (1+ months)
- Impact: "low" (marginal improvement), "medium" (noticeable improvement), "high" (significant visibility gain)
- Prioritise low-effort, high-impact actions first
- Keep each description to max 2 sentences — we surface more detail in a follow-up brief.

Return JSON only, no markdown fences:
[{
  "promptText": string,
  "rootCause": string,
  "actions": [{
    "title": string,
    "description": string (max 2 sentences, specific and industry-correct),
    "effort": "low" | "medium" | "high",
    "impact": "low" | "medium" | "high",
    "category": "content" | "technical" | "outreach" | "brand"
  }]
}]`;

/**
 * Render the stored brand profile into prompt-friendly prose so Claude
 * has explicit ground truth about what the brand does. Pulled out as a
 * helper so analyst + strategist calls use the same framing.
 */
function renderBrandProfile(project: {
  brand_name: string;
  brand_tracked_name?: string | null;
  website_url?: string | null;
  profile_short_description?: string | null;
  profile_market_segment?: string | null;
  profile_brand_identity?: string | null;
  profile_target_audience?: string | null;
  profile_products_services?: { name: string; description: string }[] | null;
}): string {
  const trackedName = project.brand_tracked_name || project.brand_name;
  const lines = [
    `Brand: ${trackedName}`,
    project.website_url ? `Website: ${project.website_url}` : null,
  ].filter(Boolean) as string[];

  const p = project;
  const hasProfile =
    Boolean(p.profile_short_description?.trim()) ||
    Boolean(p.profile_market_segment?.trim());

  if (hasProfile) {
    lines.push("", "BRAND PROFILE (use as ground truth — do not contradict):");
    if (p.profile_short_description)
      lines.push(`• What they do: ${p.profile_short_description}`);
    if (p.profile_market_segment)
      lines.push(`• Market segment: ${p.profile_market_segment}`);
    if (p.profile_brand_identity)
      lines.push(`• Brand identity: ${p.profile_brand_identity}`);
    if (p.profile_target_audience)
      lines.push(`• Target audience: ${p.profile_target_audience}`);
    if (p.profile_products_services && p.profile_products_services.length > 0) {
      lines.push("• Products / services:");
      for (const ps of p.profile_products_services) {
        lines.push(`    - ${ps.name}: ${ps.description}`);
      }
    }
  }

  return lines.join("\n");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Hoisted so the outer catch can mark the shell row as failed if we
  // errored after creating it. Initialised inside the try.
  let planIdInFlight: string | null = null;
  try {
    const { id: projectId } = await params;

    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data: org } = await supabase
      .from("organisations")
      .select("plan")
      .eq("id", profile.org_id)
      .single();

    if (!org) {
      return NextResponse.json(
        { error: "Organisation not found" },
        { status: 404 }
      );
    }

    const userPlan = org.plan as "trial" | "starter" | "pro" | "advanced";
    const actionTier = PLAN_LIMITS[userPlan].actionTier;

    // Check Anthropic key
    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-...")
    ) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 503 }
      );
    }

    // Load the project first so we can create the shell row ASAP —
    // everything else (prompts, competitors, runs, results, citations,
    // gap computation) gets deferred until AFTER the shell exists.
    // Rationale: if the user navigates away 3s after clicking Generate,
    // the fetch is aborted. Anything before shell-row insert never
    // persists, and hydrate-on-return shows empty state instead of
    // "still working". Moving this insert early means the row exists
    // by ~1s of wall time.
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Hard gate BEFORE shell creation — we don't want to pollute the
    // plan history with rows that failed validation. The gate is
    // cheap (column check, no network).
    if (
      !project.profile_short_description ||
      !project.profile_short_description.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Complete your brand profile before generating an action plan. Go to the Prompts tab and fill in the Brand Profile card at the top — every action we generate is scoped to what you enter there. Without it, actions default to generic advice that won't fit your industry.",
        },
        { status: 400 }
      );
    }

    // Shell row — earliest possible so the "navigate away" UX works.
    // Archive the previous current plan first to keep the
    // one-current-plan-per-project invariant happy.
    const admin = createAdminClient();
    await admin
      .from("action_plans")
      .update({ superseded_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .is("superseded_at", null);

    const { data: shellPlan, error: shellError } = await admin
      .from("action_plans")
      .insert({
        project_id: projectId,
        created_by: user.id,
        tier: actionTier,
        model_version: "claude-sonnet-4-6",
        status: "generating",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (shellError || !shellPlan) {
      console.error("Shell plan insert failed:", shellError);
      return NextResponse.json(
        {
          error: `Failed to create action plan row: ${shellError?.message ?? "unknown"}. If this keeps happening, check that migration 013 has been applied (adds status / status_message / started_at columns to action_plans).`,
        },
        { status: 500 }
      );
    }
    const planId = shellPlan.id as string;
    planIdInFlight = planId;
    console.info(
      `Action plan ${planId} shell created for project ${projectId} (tier=${actionTier}) — Claude calls starting`
    );

    // ── Kick off the Claude work as a detached background task ──
    // Deliberately NOT awaited. The POST handler returns the shell row
    // immediately so the browser fetch completes in ~1s regardless of
    // how long Claude takes. If the user navigates away, the browser
    // has already received its response — Node keeps running the
    // background promise until it resolves and updates the DB.
    //
    // Error handling lives inside runGenerationInBackground; any throw
    // there is caught, written to action_plans.status_message, and
    // logged. The UI picks up completion/failure via its polling loop.
    void runGenerationInBackground({
      planId,
      projectId,
      actionTier,
      project,
      apiKey: process.env.ANTHROPIC_API_KEY!,
      orgId: project.org_id,
      userId: user.id,
    });

    return NextResponse.json({
      plan: {
        ...shellPlan,
        items: [],
      },
      status: "generating",
      started_at: shellPlan.started_at,
      tier: actionTier,
    });
  } catch (error) {
    // Persist the failure on the shell row (if we got that far) so the
    // UI can show a specific error message rather than "plan vanished".
    // Deliberately isolated — an error here must NOT shadow the
    // original error below.
    const errMessage =
      error instanceof Error ? error.message : "Failed to generate actions";
    if (planIdInFlight) {
      try {
        const admin = createAdminClient();
        await admin
          .from("action_plans")
          .update({
            status: "failed",
            status_message: errMessage.slice(0, 2000),
          })
          .eq("id", planIdInFlight);
      } catch (markErr) {
        console.error("Failed to mark plan as failed:", markErr);
      }
    }
    console.error("Action generation error:", error);
    return NextResponse.json(
      // Surface the real error so users can see what went wrong in the UI
      // (was: silently returned "Failed to generate actions" for every
      // failure mode — unhelpful when a specific fix is available).
      { error: errMessage, planId: planIdInFlight },
      { status: 500 }
    );
  }
}

/**
 * Parse JSON that Claude returned, tolerant of markdown code fences.
 * Sonnet reliably follows "no fences" instructions in the system prompt
 * but occasionally slips one in, especially on very long outputs. When
 * that happens, plain JSON.parse blows up — this helper strips the
 * fences first and re-throws a caller-friendly error with a preview of
 * the offending text so debugging is obvious in the UI.
 */
// ─── Background generation ──────────────────────────────────────────
// Runs Claude analyst + strategist detached from the HTTP request.
// Reasons:
//   - Generation takes 45–75s. If awaited inside the POST handler, a
//     user who navigates away aborts the fetch, and Next.js in dev
//     mode appears to terminate the handler too — leaving the shell
//     row stuck at 'generating' forever.
//   - Fire-and-forget sidesteps the whole problem. The handler returns
//     in ~1s with the shell row, the client hydrates + polls, and the
//     Claude work completes in the background regardless of what the
//     user does with the browser.
//
// Self-contained error handling: any throw inside is caught, written
// to action_plans.status_message, and logged. The caller (POST) never
// awaits the result, so unhandled rejections aren't a concern.

async function runGenerationInBackground(args: {
  planId: string;
  projectId: string;
  actionTier: "gaps" | "strategy" | "full";
  project: {
    brand_name: string;
    brand_tracked_name?: string | null;
    website_url?: string | null;
    profile_short_description?: string | null;
    profile_market_segment?: string | null;
    profile_brand_identity?: string | null;
    profile_target_audience?: string | null;
    profile_products_services?: { name: string; description: string }[] | null;
  };
  apiKey: string;
  /** Ops-logging attribution. Safe to omit (falls back to null). */
  orgId?: string | null;
  userId?: string | null;
}): Promise<void> {
  const { planId, projectId, actionTier, project, apiKey, orgId, userId } = args;
  const admin = createAdminClient();

  try {
    console.info(`[plan ${planId}] background generation starting`);

    const [prompts, competitors, runs] = await Promise.all([
      getPrompts(projectId),
      getCompetitors(projectId),
      getDailyRuns(projectId, 7),
    ]);
    const results = await getResultsForRuns(runs.map((r) => r.id));
    const citations = await getCitationsForResults(results.map((r) => r.id));

    const gaps = computeVisibilityGaps(
      prompts,
      results,
      citations,
      competitors
    );

    // Zero-gaps is a legit success outcome — mark the plan complete
    // with an empty raw_output so the UI renders "no gaps found" rather
    // than spinning forever.
    if (gaps.length === 0) {
      await admin
        .from("action_plans")
        .update({
          status: "complete",
          status_message:
            "No visibility gaps found. Your brand is visible across every prompt.",
          raw_output: [],
        })
        .eq("id", planId);
      console.info(`[plan ${planId}] no gaps — marked complete`);
      return;
    }

    const anthropic = new Anthropic({ apiKey });

    const gapData = gaps.map((g) => ({
      prompt: g.promptText,
      category: g.category,
      visibilityScore: g.score,
      competitorsCited: g.competitorsCited,
      topCitedDomains: g.topCitedDomains,
      snippets: g.snippets,
    }));

    const brandBlock = renderBrandProfile(project);
    const competitorBlock = competitors.length
      ? `Tracked competitors: ${competitors.map((c) => c.display_name || c.name).join(", ")}`
      : "No competitors tracked.";

    // ── Team 1: Gap Analyst ──
    const analystStartedAt = Date.now();
    const analystResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: GAP_ANALYST_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${brandBlock}\n\n${competitorBlock}\n\nVisibility gaps:\n${JSON.stringify(gapData, null, 2)}`,
        },
      ],
    });
    logAiUsage({
      provider: "anthropic",
      model: analystResponse.model ?? "claude-sonnet-4-6",
      feature: "action_plan",
      input_tokens: analystResponse.usage?.input_tokens ?? 0,
      output_tokens: analystResponse.usage?.output_tokens ?? 0,
      org_id: orgId ?? null,
      project_id: projectId,
      user_id: userId ?? null,
      duration_ms: Date.now() - analystStartedAt,
      success: true,
    });
    if (analystResponse.stop_reason === "max_tokens") {
      throw new Error(
        `Analyst output hit the max_tokens cap (${analystResponse.usage?.output_tokens ?? "?"} tokens) — truncated. Reduce prompt count or raise cap.`
      );
    }
    const analystText = analystResponse.content.find((b) => b.type === "text");
    if (!analystText || analystText.type !== "text") {
      throw new Error("No analyst response");
    }
    const analyses = parseJsonFromClaude(analystText.text, "analyst");
    let actionPlan = analyses;

    // ── Team 2: Strategist ── (only for Pro+ users)
    if (actionTier !== "gaps") {
      const strategistStartedAt = Date.now();
      const strategistResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 12000,
        system: STRATEGIST_SYSTEM,
        messages: [
          {
            role: "user",
            content: `${brandBlock}\n\nIndustry context: Irish market\n${competitorBlock}\n\nGap analyses from our analyst team:\n${JSON.stringify(analyses, null, 2)}\n\nKeep the output tight. Trim descriptions to what's needed to act on — exhaustive prose inflates token counts without improving the plan. Target max 2 sentences per action description.`,
          },
        ],
      });
      logAiUsage({
        provider: "anthropic",
        model: strategistResponse.model ?? "claude-sonnet-4-6",
        feature: "action_plan",
        input_tokens: strategistResponse.usage?.input_tokens ?? 0,
        output_tokens: strategistResponse.usage?.output_tokens ?? 0,
        org_id: orgId ?? null,
        project_id: projectId,
        user_id: userId ?? null,
        duration_ms: Date.now() - strategistStartedAt,
        success: true,
      });
      if (strategistResponse.stop_reason === "max_tokens") {
        throw new Error(
          `Strategist output hit the max_tokens cap (${strategistResponse.usage?.output_tokens ?? "?"} tokens) — truncated. Reduce gaps per request or paginate.`
        );
      }
      const strategistText = strategistResponse.content.find(
        (b) => b.type === "text"
      );
      if (!strategistText || strategistText.type !== "text") {
        throw new Error("No strategist response");
      }
      actionPlan = parseJsonFromClaude(strategistText.text, "strategist");
    }

    await fillActionPlan({ planId, rawOutput: actionPlan });
    console.info(`[plan ${planId}] background generation complete`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Background generation failed";
    console.error(`[plan ${planId}] background generation failed:`, err);
    try {
      await admin
        .from("action_plans")
        .update({
          status: "failed",
          status_message: msg.slice(0, 2000),
        })
        .eq("id", planId);
    } catch (markErr) {
      console.error(
        `[plan ${planId}] failed to mark plan as failed:`,
        markErr
      );
    }
  }
}

function parseJsonFromClaude(raw: string, label: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Couldn't parse ${label} response as JSON: ${
        err instanceof Error ? err.message : "unknown parser error"
      }. First 200 chars: ${cleaned.slice(0, 200)}`
    );
  }
}

// ─── Persistence ─────────────────────────────────────────────────────

/**
 * Shape Claude returns — same for analyst-only ("gaps" tier) and
 * strategist ("strategy" / "full"). Both return an array of items.
 * Only strategist populates `actions` per item; gaps-tier items have
 * just the analyst fields.
 */
interface ClaudeGap {
  promptText?: string;
  rootCause?: string;
  competitorAdvantage?: string;
  opportunityType?: string;
  actions?: Array<{
    title?: string;
    description?: string;
    effort?: string;
    impact?: string;
    category?: string;
  }>;
}

/**
 * Shape returned by GET/POST — nested for UI convenience.
 */
interface ActionPlanWithItems extends ActionPlan {
  items: (ActionItem & { steps: ActionStep[] })[];
}

const VALID_EFFORT = ["low", "medium", "high"] as const;
const VALID_IMPACT = ["low", "medium", "high"] as const;
const VALID_CATEGORY = ["content", "technical", "outreach", "brand"] as const;

function coerceEnum<T extends string>(
  value: unknown,
  valid: readonly T[],
  fallback: T
): T {
  return typeof value === "string" && (valid as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

async function fillActionPlan(args: {
  planId: string;
  rawOutput: unknown;
}): Promise<ActionPlanWithItems> {
  const { planId, rawOutput } = args;
  const admin = createAdminClient();

  // Mark the existing shell row as complete + attach the raw output.
  // The shell was created at POST start (migration 013) so navigation
  // during generation showed "in progress" instead of emptiness.
  const { data: planRow, error: planError } = await admin
    .from("action_plans")
    .update({
      status: "complete",
      raw_output: rawOutput,
    })
    .eq("id", planId)
    .select()
    .single<ActionPlan>();
  if (planError || !planRow) {
    throw new Error(
      `Failed to finalise action_plan: ${planError?.message}`
    );
  }

  const gaps = Array.isArray(rawOutput) ? (rawOutput as ClaudeGap[]) : [];
  const itemsWithSteps: (ActionItem & { steps: ActionStep[] })[] = [];

  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i];
    const { data: itemRow, error: itemError } = await admin
      .from("action_items")
      .insert({
        plan_id: planId,
        prompt_text: gap.promptText ?? null,
        root_cause: gap.rootCause ?? null,
        competitor_advantage: gap.competitorAdvantage ?? null,
        opportunity_type: gap.opportunityType ?? null,
        position: i,
      })
      .select()
      .single<ActionItem>();
    if (itemError || !itemRow) {
      console.error("Failed to persist action_item:", itemError);
      continue;
    }

    const steps: ActionStep[] = [];
    const gapActions = Array.isArray(gap.actions) ? gap.actions : [];
    for (let j = 0; j < gapActions.length; j++) {
      const step = gapActions[j];
      if (!step.title) continue;
      const { data: stepRow, error: stepError } = await admin
        .from("action_steps")
        .insert({
          item_id: itemRow.id,
          title: step.title,
          description: step.description ?? null,
          effort: coerceEnum(step.effort, VALID_EFFORT, "medium"),
          impact: coerceEnum(step.impact, VALID_IMPACT, "medium"),
          category: coerceEnum(step.category, VALID_CATEGORY, "content"),
          position: j,
        })
        .select()
        .single<ActionStep>();
      if (stepError || !stepRow) {
        console.error("Failed to persist action_step:", stepError);
        continue;
      }
      steps.push(stepRow);
    }

    itemsWithSteps.push({ ...itemRow, steps });
  }

  return { ...planRow, items: itemsWithSteps };
}

// ─── GET handler — return the current persisted plan ─────────────────
// Added by migration 012 persistence. The old route had no GET so the
// UI re-ran the expensive Claude pipeline every time the user loaded
// the Actions page.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the current plan (non-superseded) for this project.
  const { data: plan } = await supabase
    .from("action_plans")
    .select("*")
    .eq("project_id", projectId)
    .is("superseded_at", null)
    .maybeSingle<ActionPlan>();

  if (!plan) {
    return NextResponse.json({ plan: null });
  }

  // Pull items + steps in two batches (small N per project).
  const { data: items } = await supabase
    .from("action_items")
    .select("*")
    .eq("plan_id", plan.id)
    .order("position", { ascending: true });

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: steps } = itemIds.length
    ? await supabase
        .from("action_steps")
        .select("*")
        .in("item_id", itemIds)
        .order("position", { ascending: true })
    : { data: [] as ActionStep[] };

  const stepsByItem = new Map<string, ActionStep[]>();
  for (const s of (steps ?? []) as ActionStep[]) {
    const list = stepsByItem.get(s.item_id) ?? [];
    list.push(s);
    stepsByItem.set(s.item_id, list);
  }

  const nested: ActionPlanWithItems = {
    ...plan,
    items: ((items ?? []) as ActionItem[]).map((i) => ({
      ...i,
      steps: stepsByItem.get(i.id) ?? [],
    })),
  };

  return NextResponse.json({ plan: nested });
}
