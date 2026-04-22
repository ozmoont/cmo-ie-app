import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/lib/types";
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
You analyse visibility gaps - prompts where a brand is NOT being mentioned by AI models while competitors ARE.

Given gap data, identify the root cause for each gap. Consider:
- What content competitors have that the brand lacks
- Why AI models prefer citing competitors for this query
- Content gaps, authority gaps, structured data gaps

Return JSON only, no markdown fences:
[{
  "promptText": string,
  "rootCause": string (2-3 sentences explaining WHY the brand is invisible),
  "competitorAdvantage": string (what competitors are doing right),
  "opportunityType": "content_gap" | "authority_gap" | "technical_gap" | "brand_gap"
}]`;

const STRATEGIST_SYSTEM = `You are a senior GEO (Generative Engine Optimisation) Strategist for the Irish market.
Given visibility gap analyses with root causes, create specific, actionable recommendations.

Rules:
- Each gap should have 2-4 actions
- Actions must be specific and practical, not generic
- Consider the Irish market context
- Effort: "low" (< 1 week), "medium" (1-4 weeks), "high" (1+ months)
- Impact: "low" (marginal improvement), "medium" (noticeable improvement), "high" (significant visibility gain)
- Prioritise low-effort, high-impact actions first

Return JSON only, no markdown fences:
[{
  "promptText": string,
  "rootCause": string,
  "actions": [{
    "title": string,
    "description": string (2-3 sentences, specific and actionable),
    "effort": "low" | "medium" | "high",
    "impact": "low" | "medium" | "high",
    "category": "content" | "technical" | "outreach" | "brand"
  }]
}]`;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Fetch all data needed for gap analysis
    const [project, prompts, competitors, runs] = await Promise.all([
      getProject(projectId),
      getPrompts(projectId),
      getCompetitors(projectId),
      getDailyRuns(projectId, 7),
    ]);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const results = await getResultsForRuns(runs.map((r) => r.id));
    const citations = await getCitationsForResults(results.map((r) => r.id));

    // Compute visibility gaps
    const gaps = computeVisibilityGaps(prompts, results, citations, competitors);

    if (gaps.length === 0) {
      return NextResponse.json({
        actions: [],
        message:
          "No visibility gaps found. Your brand is visible across every prompt.",
      });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // ── Team 1: Gap Analyst ──
    const gapData = gaps.map((g) => ({
      prompt: g.promptText,
      category: g.category,
      visibilityScore: g.score,
      competitorsCited: g.competitorsCited,
      topCitedDomains: g.topCitedDomains,
      snippets: g.snippets,
    }));

    const analystResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: GAP_ANALYST_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Brand: ${project.brand_name}
Website: ${project.website_url ?? "not provided"}
Competitors: ${competitors.map((c) => c.name).join(", ") || "none tracked"}

Visibility gaps:\n${JSON.stringify(gapData, null, 2)}`,
        },
      ],
    });

    const analystText = analystResponse.content.find(
      (b) => b.type === "text"
    );
    if (!analystText || analystText.type !== "text") {
      throw new Error("No analyst response");
    }
    const analyses = parseJsonFromClaude(
      analystText.text,
      "analyst"
    );

    let actionPlan = analyses;

    // ── Team 2: Strategist ── (only for Pro+ users)
    if (actionTier !== "gaps") {
      const strategistResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: STRATEGIST_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Brand: ${project.brand_name}
Website: ${project.website_url ?? "not provided"}
Industry context: Irish market
Competitors: ${competitors.map((c) => c.name).join(", ") || "none tracked"}

Gap analyses from our analyst team:\n${JSON.stringify(analyses, null, 2)}`,
          },
        ],
      });

      const strategistText = strategistResponse.content.find(
        (b) => b.type === "text"
      );
      if (!strategistText || strategistText.type !== "text") {
        throw new Error("No strategist response");
      }
      actionPlan = parseJsonFromClaude(strategistText.text, "strategist");
    }

    return NextResponse.json({
      actions: actionPlan,
      tier: actionTier,
      gapCount: gaps.length,
    });
  } catch (error) {
    console.error("Action generation error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate actions";
    return NextResponse.json(
      // Surface the real error so users can see what went wrong in the UI
      // (was: silently returned "Failed to generate actions" for every
      // failure mode — unhelpful when a specific fix is available).
      { error: message },
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
