import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAiUsage } from "@/lib/ai-usage-logger";
import {
  extractBrandProfile,
  type BrandProfile,
} from "@/lib/brand-profile";

/**
 * POST /api/prompts/suggest
 *
 * Given a projectId (preferred) or brandName/websiteUrl (legacy pitch
 * flow), generate ~10 conversational prompts a real potential customer
 * might type into an AI search engine when researching this brand's
 * category.
 *
 * Flow:
 *   1. Resolve the project (or a pitch-mode partial).
 *   2. Use the stored BrandProfile (migration 009). If missing and a
 *      websiteUrl is available, run extractBrandProfile and persist the
 *      result so subsequent calls skip the web fetch.
 *   3. Call Claude with a structured profile — industry, audience,
 *      products — rather than raw HTML. This removes the failure mode
 *      where a JS-heavy site returns empty content and Claude falls
 *      back to hallucinating from the brand name alone.
 *   4. Return ~10 prompts split across awareness / consideration /
 *      decision.
 *
 * System prompt uses a hard industry lock: if the inferred segment is
 * "digital agency", every prompt must be what a digital-agency customer
 * would ask, not a music-festival or bank customer.
 */

interface SuggestionBody {
  projectId?: string;
  brandName?: string;
  websiteUrl?: string;
}

interface ProjectProfileRow {
  id: string;
  brand_name: string;
  website_url: string | null;
  brand_tracked_name: string | null;
  brand_aliases: string[] | null;
  profile_short_description: string | null;
  profile_market_segment: string | null;
  profile_brand_identity: string | null;
  profile_target_audience: string | null;
  profile_products_services:
    | { name: string; description: string }[]
    | null;
  profile_updated_at: string | null;
}

function profileIsPopulated(p: ProjectProfileRow): boolean {
  return Boolean(
    p.profile_short_description &&
      p.profile_short_description.trim().length > 0 &&
      p.profile_market_segment &&
      p.profile_market_segment.trim().length > 0
  );
}

function profileToBrandProfile(p: ProjectProfileRow): BrandProfile {
  return {
    short_description: p.profile_short_description ?? "",
    market_segment: p.profile_market_segment ?? "",
    brand_identity: p.profile_brand_identity ?? "",
    target_audience: p.profile_target_audience ?? "",
    products_services: p.profile_products_services ?? [],
  };
}

/**
 * Builds the user-message prose we send to Claude. Uses a structured
 * profile — explicitly not the raw HTML — so the industry context is
 * compact, authoritative, and editable by the user.
 */
function renderProfileForPrompt(
  brandName: string,
  websiteUrl: string | null,
  profile: BrandProfile | null
): string {
  const parts: string[] = [`Brand: ${brandName}`];
  if (websiteUrl) parts.push(`Website: ${websiteUrl}`);

  if (!profile || !profile.short_description) {
    parts.push(
      "\n(No structured profile available — do NOT guess the industry. Instead, emit a conservative set of ≤ 5 prompts scoped to what can be inferred from the brand name alone, and flag the first prompt's text with a short note in square brackets if industry is uncertain.)"
    );
    return parts.join("\n");
  }

  parts.push("", "Brand profile (USE THIS AS GROUND TRUTH — do not contradict):");
  if (profile.short_description)
    parts.push(`• What they do: ${profile.short_description}`);
  if (profile.market_segment)
    parts.push(`• Market segment: ${profile.market_segment}`);
  if (profile.brand_identity)
    parts.push(`• Brand identity: ${profile.brand_identity}`);
  if (profile.target_audience)
    parts.push(`• Target audience: ${profile.target_audience}`);
  if (profile.products_services && profile.products_services.length > 0) {
    parts.push("• Products / services:");
    for (const ps of profile.products_services) {
      parts.push(`    - ${ps.name}: ${ps.description}`);
    }
  }

  return parts.join("\n");
}

const SYSTEM_PROMPT = `You are a GEO (Generative Engine Optimisation) expert helping Irish brands understand how AI search engines represent them.

Your job: given a brand profile, generate 10 conversational prompts that a real potential customer of THIS SPECIFIC BRAND would type into ChatGPT, Perplexity, or Gemini when researching their category.

Hard rules — breaking any one of these is a failure:
1. INDUSTRY LOCK. Every prompt must be a question from the tracked brand's stated market segment. If the segment is "digital transformation agency", every prompt is about digital/AI/marketing agencies — NEVER about banks, concert tickets, music festivals, tourism, hospitality, restaurants, or any adjacent-but-unrelated Irish business. If you can't generate 10 on-industry prompts, generate fewer.
2. CUSTOMER VIEWPOINT. Every prompt is phrased as the customer-who-doesn't-know-this-brand-exists would ask it. NEVER include the brand's name or any of its aliases in the prompt — doing so invalidates the entire tracking exercise.
3. FUNNEL MIX. Roughly 3 awareness (broad category / problem-level), ~4 consideration (comparing options, features, trust signals), ~3 decision (pricing, shortlists, specific named-competitor comparisons).
4. NATURAL LANGUAGE. Full questions, not keyword strings. Average 12–25 words per prompt.
5. GEO RELEVANCE. Favour Irish phrasing ("in Ireland", "Dublin", ".ie") where natural for the segment. Don't force it where it isn't — some prompts should be globally phrased.
6. COMPARATIVE PROMPTS. Where relevant, name real competitor categories or leaders the customer would realistically compare against — this is how real users search ("vs Accenture", "compared to Deloitte").

Output contract: return ONLY valid JSON. No markdown fences, no preamble, no explanation. Shape:
[{"text": string, "category": "awareness"|"consideration"|"decision"}]

If the profile is empty or uncertain, return FEWER prompts (≤ 5) rather than inventing industry context.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SuggestionBody;
    const { projectId } = body;
    let { brandName, websiteUrl } = body;

    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-...")
    ) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 503 }
      );
    }

    let profile: BrandProfile | null = null;
    // Captured for ai_usage_events attribution when the project lookup succeeds.
    let orgIdForLog: string | null = null;
    let projectIdForLog: string | null = null;

    // ── Path A: projectId supplied — use stored profile, extract if missing ──
    if (projectId) {
      const supabase = await createClient();
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select(
          "id, org_id, brand_name, website_url, brand_tracked_name, brand_aliases, profile_short_description, profile_market_segment, profile_brand_identity, profile_target_audience, profile_products_services, profile_updated_at"
        )
        .eq("id", projectId)
        .maybeSingle<ProjectProfileRow>();

      if (projectError || !project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      brandName = project.brand_tracked_name || project.brand_name;
      websiteUrl = project.website_url ?? undefined;
      orgIdForLog = (project as ProjectProfileRow & { org_id?: string }).org_id ?? null;
      projectIdForLog = project.id ?? projectId;

      if (profileIsPopulated(project)) {
        profile = profileToBrandProfile(project);
      } else if (project.website_url) {
        // First call for this project — extract and persist so the
        // next call is instant and consistent.
        const extracted = await extractBrandProfile(
          brandName,
          project.website_url
        );
        if (extracted && extracted.short_description) {
          profile = extracted;
          // Persist via admin so RLS doesn't block the background save.
          const admin = createAdminClient();
          const { error: updateError } = await admin
            .from("projects")
            .update({
              profile_short_description: extracted.short_description,
              profile_market_segment: extracted.market_segment,
              profile_brand_identity: extracted.brand_identity,
              profile_target_audience: extracted.target_audience,
              profile_products_services: extracted.products_services,
              profile_updated_at: new Date().toISOString(),
            })
            .eq("id", projectId);
          if (updateError) {
            console.error(
              "Failed to persist extracted brand profile:",
              updateError
            );
          }
        }
      }
    } else {
      // ── Path B: legacy pitch-mode call with raw fields ──
      if (!brandName) {
        return NextResponse.json(
          {
            error:
              "brandName is required or projectId must be provided",
          },
          { status: 400 }
        );
      }
      if (websiteUrl) {
        profile = await extractBrandProfile(brandName, websiteUrl);
      }
    }

    if (!brandName) {
      return NextResponse.json(
        { error: "brandName is required or projectId must be provided" },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const suggestStartedAt = Date.now();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: renderProfileForPrompt(brandName, websiteUrl ?? null, profile),
        },
      ],
    });
    logAiUsage({
      provider: "anthropic",
      model: response.model ?? "claude-sonnet-4-6",
      feature: "prompt_suggest",
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      org_id: orgIdForLog,
      project_id: projectIdForLog,
      duration_ms: Date.now() - suggestStartedAt,
      success: true,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text response from Claude" },
        { status: 500 }
      );
    }

    let raw = textBlock.text.trim();
    if (raw.startsWith("```")) {
      raw = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
    }

    let suggestions: unknown;
    try {
      suggestions = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error: "Could not parse suggestions from model response",
          raw: raw.slice(0, 500),
        },
        { status: 502 }
      );
    }

    // Surface the profile alongside suggestions so the UI can show
    // "We think you are: X" — and give the user an obvious path to
    // correct it when it's wrong.
    return NextResponse.json({
      suggestions,
      profile,
      profile_populated: profile !== null,
    });
  } catch (error) {
    console.error("Prompt suggestion error:", error);
    const mapped = mapAnthropicError(error);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status }
    );
  }
}

/**
 * Translate an Anthropic SDK error into a user-facing shape the UI
 * can render without a stack trace. The SDK surfaces the underlying
 * HTTP response as `error.error?.message`; we sniff for the
 * well-known billing / rate-limit / auth phrases so the operator
 * sees "Top up credits" instead of a generic 500.
 */
function mapAnthropicError(err: unknown): {
  status: number;
  code: string;
  message: string;
} {
  // The SDK's APIError shape: { status, error: { error: { type, message } } }
  const anyErr = err as {
    status?: number;
    error?: { error?: { type?: string; message?: string } };
    message?: string;
  };
  const inner = anyErr.error?.error;
  const text = (inner?.message ?? anyErr.message ?? "").toLowerCase();
  const status = anyErr.status ?? 500;

  if (text.includes("credit balance is too low")) {
    return {
      status: 402,
      code: "anthropic_credits_exhausted",
      message:
        "Your Anthropic account is out of credits. Top up at console.anthropic.com/settings/billing and retry.",
    };
  }
  if (status === 401 || text.includes("authentication")) {
    return {
      status: 401,
      code: "anthropic_auth_failed",
      message:
        "Anthropic API key is missing or invalid. Check ANTHROPIC_API_KEY in your env or the org's BYOK key.",
    };
  }
  if (status === 429 || text.includes("rate limit")) {
    return {
      status: 429,
      code: "anthropic_rate_limited",
      message:
        "Anthropic rate limit hit. Retry in 30-60s; if it keeps happening, you're on a plan with low concurrent limits.",
    };
  }
  return {
    status: 500,
    code: "suggestion_failed",
    message: "Failed to generate suggestions. Check the server log.",
  };
}
