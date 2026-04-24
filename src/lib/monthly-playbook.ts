/**
 * Monthly playbook email generator.
 *
 * Usage:
 *   await generateMonthlyPlaybook(projectId, monthStart)
 *
 * Responsibilities:
 *   1. Pull the project + last-30-days metrics + top 5 gap rows.
 *   2. Render an "input bundle" the Claude prompt can consume.
 *   3. Ask Claude to write a tight 3-move playbook in CMO.ie house
 *      voice (practical, Dublin-inflected, no corporate filler).
 *   4. Upsert the result into monthly_playbooks with status='draft'.
 *      Idempotent per (project, month).
 *
 * Not responsible for sending — that's the dispatcher's job (email
 * provider + list construction). Keeping generation + delivery
 * separate means re-generation (prompt tweaks) doesn't force a
 * redelivery, and vice versa.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDomainGaps } from "@/lib/queries/gap-analysis";
import { computeShareOfVoice } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MonthlyPlaybookResult {
  id: string;
  project_id: string;
  month: string;
  subject: string;
  body_markdown: string;
  status: "draft" | "ready" | "sent" | "failed";
  generated_at: string;
}

export interface GenerateOptions {
  /** Force re-generation even if a row already exists for this month. */
  force?: boolean;
  /** Claude model override (tests). Defaults to claude-sonnet-4-6. */
  model?: string;
  /** Explicit recipients list — when omitted, looked up from org profiles. */
  recipients?: string[];
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a senior marketing strategist writing a short, punchy monthly playbook email for a marketing director. House voice: Dublin-direct, practical, no corporate filler, no emoji, no hype. Prefer short sentences. Name specific sources and competitors when the data supports it.

Output format — markdown, strictly this structure:

# [Subject-line equivalent headline, max 60 chars]

[1-2 sentence read-out of the visibility number over the last 30 days: where we are, whether it's improved, the single most important reason.]

## Move 1 — [imperative verb + object, max 8 words]
[2-3 sentences explaining the specific action, why it matters, and the source or competitor involved.]

## Move 2 — [imperative verb + object, max 8 words]
[2-3 sentences.]

## Move 3 — [imperative verb + object, max 8 words]
[2-3 sentences.]

## Next month
[One sentence on what to track to confirm the moves worked.]

Rules:
- Every move must be concrete and specific — name a domain, a competitor, or a type of content. No "create great content".
- Don't invent data. Use only what's in the input bundle.
- If the gap list is empty or the project has no runs yet, write a setup-focused playbook instead of fabricating moves.
- Don't wrap the output in a code fence. Return plain markdown.`;

interface InputBundle {
  brand_name: string;
  website_url: string | null;
  country_codes: string[];
  window: { from: string; to: string };
  visibility_pct: number;
  share_of_voice_pct: number;
  totals: {
    results: number;
    mentioned: number;
    tracked_brand_mentions: number;
    total_brand_mentions: number;
  };
  top_gaps: Array<{
    domain: string;
    source_type: string | null;
    gap_score: number;
    competitors_present: string[];
    is_irish_publisher: boolean;
  }>;
}

export async function generateMonthlyPlaybook(
  projectId: string,
  monthStart: Date,
  opts: GenerateOptions = {}
): Promise<MonthlyPlaybookResult> {
  const admin = createAdminClient();
  const monthIso = monthStart.toISOString().slice(0, 10); // yyyy-mm-dd

  // 1. Idempotency check.
  if (!opts.force) {
    const { data: existing } = await admin
      .from("monthly_playbooks")
      .select("*")
      .eq("project_id", projectId)
      .eq("month", monthIso)
      .maybeSingle<MonthlyPlaybookResult>();
    if (existing) return existing;
  }

  // 2. Pull the bundle.
  const bundle = await buildInputBundle(admin, projectId, monthStart);

  // 3. Ask Claude.
  if (
    !process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-...")
  ) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Monthly data bundle for ${bundle.brand_name}:
${JSON.stringify(bundle, null, 2)}

Write this month's playbook.`,
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  const markdown =
    textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
  if (!markdown) {
    throw new Error("Claude returned empty playbook body");
  }

  // 4. Derive subject from the first `# ...` line; fall back to a
  //    deterministic string so the email doesn't go out blank.
  const subject =
    extractFirstHeading(markdown) ??
    `${bundle.brand_name} — AI visibility playbook, ${formatMonthLabel(monthStart)}`;

  // 5. Resolve recipients if not passed.
  const recipients =
    opts.recipients ?? (await resolveOrgRecipients(admin, projectId));

  // 6. Upsert.
  const { data, error } = await admin
    .from("monthly_playbooks")
    .upsert(
      {
        project_id: projectId,
        month: monthIso,
        subject,
        body_markdown: markdown,
        recipients,
        status: "draft",
        generated_at: new Date().toISOString(),
        raw_input: bundle,
      },
      { onConflict: "project_id,month" }
    )
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to persist playbook: ${error?.message ?? "unknown"}`);
  }
  return data as MonthlyPlaybookResult;
}

// ── Helpers ────────────────────────────────────────────────────────

async function buildInputBundle(
  admin: SupabaseClient,
  projectId: string,
  monthStart: Date
): Promise<InputBundle> {
  // Window: the 30 days ending at monthStart. For a playbook generated
  // on 1st May, that covers 1st-30th April — which is what a recipient
  // expects ("here's what last month looked like").
  const windowEnd = monthStart;
  const windowStart = new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  const { data: project } = await admin
    .from("projects")
    .select("brand_name, website_url, country_codes")
    .eq("id", projectId)
    .maybeSingle<{
      brand_name: string;
      website_url: string | null;
      country_codes: string[] | null;
    }>();
  if (!project) throw new Error("Project not found");

  const { data: results } = await admin
    .from("results")
    .select("id, brand_mentioned, prompts!inner(project_id)")
    .eq("prompts.project_id", projectId)
    .gte("created_at", windowStart.toISOString())
    .lte("created_at", windowEnd.toISOString());
  const rows = (results ?? []) as Array<{
    id: string;
    brand_mentioned: boolean;
  }>;
  const total = rows.length;
  const mentioned = rows.filter((r) => r.brand_mentioned).length;
  const visibility = total > 0 ? Math.round((mentioned / total) * 100) : 0;

  // SoV
  let trackedMentions = 0;
  let totalMentions = 0;
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data } = await admin
        .from("result_brand_mentions")
        .select("is_tracked_brand")
        .in("result_id", slice);
      for (const m of data ?? []) {
        totalMentions += 1;
        if (m.is_tracked_brand) trackedMentions += 1;
      }
    }
  }

  // Gaps
  const gaps = await getDomainGaps(admin, projectId, {
    from: windowStart,
    to: windowEnd,
    limit: 5,
  });

  return {
    brand_name: project.brand_name,
    website_url: project.website_url,
    country_codes: project.country_codes ?? [],
    window: {
      from: windowStart.toISOString(),
      to: windowEnd.toISOString(),
    },
    visibility_pct: visibility,
    share_of_voice_pct: computeShareOfVoice(trackedMentions, totalMentions),
    totals: {
      results: total,
      mentioned,
      tracked_brand_mentions: trackedMentions,
      total_brand_mentions: totalMentions,
    },
    top_gaps: gaps.rows.map((g) => ({
      domain: g.domain,
      source_type: g.source_type,
      gap_score: g.gap_score,
      competitors_present: g.competitors_present,
      is_irish_publisher: g.is_irish_publisher,
    })),
  };
}

async function resolveOrgRecipients(
  admin: SupabaseClient,
  projectId: string
): Promise<string[]> {
  const { data: project } = await admin
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle<{ org_id: string }>();
  if (!project?.org_id) return [];
  // profiles.id references auth.users.id — we need to resolve the
  // email via auth.users. Using the admin API for this keeps RLS /
  // schema concerns out of our path.
  const { data: profileRows } = await admin
    .from("profiles")
    .select("id")
    .eq("org_id", project.org_id);
  const ids = (profileRows ?? []).map((p) => p.id as string);
  const emails: string[] = [];
  for (const id of ids) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return emails;
}

/**
 * Extract the first Markdown h1 heading (excluding the `# `) and clip
 * to 120 characters. Exported for tests.
 */
export function extractFirstHeading(md: string): string | null {
  const match = md.match(/^#\s+(.+)$/m);
  if (!match) return null;
  return match[1].trim().slice(0, 120);
}

/** "April 2026" formatter. Exported for tests + preview UI. */
export function formatMonthLabel(d: Date): string {
  try {
    return d.toLocaleDateString("en-IE", { month: "long", year: "numeric" });
  } catch {
    return d.toISOString().slice(0, 7);
  }
}
