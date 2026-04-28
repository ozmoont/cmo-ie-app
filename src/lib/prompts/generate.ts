/**
 * Phase 6 — batch prompt generator.
 *
 * Pure function. Takes a brand profile, asks Sonnet for 30-50 prompts
 * spread across the funnel, returns the parsed list. The caller owns
 * persistence (so this same function works from the API route, a
 * future cron job, and unit tests).
 *
 * Why a separate function from /api/prompts/suggest?
 *   - suggest is single-shot, ~10 prompts, sized for onboarding.
 *   - generate is bulk-mode, 30-50 prompts, sized for the AdWords-style
 *     coverage workflow on the Prompts tab.
 * They use the same brand profile but different system prompts, output
 * sizes, and funnel-mix targets, so one shared function would have
 * carried more conditional branches than two clear functions.
 *
 * Source-of-truth design doc: docs/phase-6-prompt-coverage.md
 */

import Anthropic from "@anthropic-ai/sdk";
import type { BrandProfile } from "@/lib/brand-profile";
import type { PromptCategory } from "@/lib/types";
import { stripJsonFences } from "@/lib/anthropic-errors";

const SONNET_MODEL = "claude-sonnet-4-6";
const DEFAULT_COUNT = 40;
const MIN_COUNT = 20;
const MAX_COUNT = 60;

export interface GeneratedPrompt {
  text: string;
  category: PromptCategory;
}

export interface GenerateUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
}

export interface GeneratePromptsResult {
  prompts: GeneratedPrompt[];
  usage: GenerateUsage;
}

const SYSTEM_PROMPT = `You are a GEO (Generative Engine Optimisation) expert helping Irish brands understand the full landscape of questions a real customer would ask AI search engines (ChatGPT, Perplexity, Gemini, Claude) when researching their category.

Your job: given a brand profile, generate a comprehensive batch of conversational prompts spanning the customer journey.

Hard rules — breaking any one of these is a failure:

1. INDUSTRY LOCK. Every prompt must be a question from the tracked brand's stated market segment. If the segment is "digital transformation agency", every prompt is about digital/AI/marketing agencies — NEVER about banks, concert tickets, music festivals, tourism, hospitality, restaurants, or any adjacent-but-unrelated business. If you can't generate enough on-industry prompts, generate fewer.

2. CUSTOMER VIEWPOINT. Every prompt is phrased as the customer-who-doesn't-know-this-brand-exists would ask it. NEVER include the brand's name or any of its aliases in the prompt — doing so invalidates the entire tracking exercise.

3. FUNNEL MIX (for the requested count, target this distribution):
   • Awareness ~40%: broad category, problem-level, "what is", "why does X matter", learning-mode questions.
   • Consideration ~35%: comparing options, features, trust signals, "how to choose", "best X for Y", differentiator questions.
   • Decision ~25%: pricing, shortlists, named-competitor comparisons, "is X worth it", "alternatives to X", buying-mode questions.

4. NATURAL LANGUAGE. Full questions or natural-language fragments, not keyword strings. Average 10-25 words per prompt. Mix question types — "what", "how", "best", "compare", "alternatives to", "is X worth it".

5. GEO RELEVANCE. Favour Irish phrasing ("in Ireland", "Dublin", ".ie") where natural for the segment. Don't force it where it isn't — some prompts should be globally phrased so we capture how AI compares Irish brands to international ones.

6. DIVERSITY. Avoid near-duplicate prompts. Each prompt should add a distinct angle the others don't cover. Different question stems, different aspects of the category, different intent levels.

7. COMPARATIVE PROMPTS. Where relevant, name real competitor categories or leaders the customer would realistically compare against — this is how real users search ("vs Accenture", "compared to Deloitte alternatives").

Output contract: return ONLY valid JSON. No markdown fences, no preamble, no explanation. Shape:

[{"text": string, "category": "awareness"|"consideration"|"decision"}]

If the profile is empty or uncertain, return FEWER prompts (≤ 10) rather than inventing industry context.`;

function renderProfileForPrompt(
  brandName: string,
  websiteUrl: string | null,
  profile: BrandProfile | null,
  count: number
): string {
  const parts: string[] = [
    `Brand: ${brandName}`,
    `Target count: ${count} prompts`,
  ];
  if (websiteUrl) parts.push(`Website: ${websiteUrl}`);

  if (!profile || !profile.short_description) {
    parts.push(
      "",
      "(No structured profile available — do NOT guess the industry. Emit a conservative set of ≤ 10 prompts scoped to what can be inferred from the brand name alone.)"
    );
    return parts.join("\n");
  }

  parts.push(
    "",
    "Brand profile (USE THIS AS GROUND TRUTH — do not contradict):"
  );
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

function clampCount(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_COUNT;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(raw)));
}

function isValidGenerated(item: unknown): item is GeneratedPrompt {
  if (!item || typeof item !== "object") return false;
  const x = item as { text?: unknown; category?: unknown };
  return (
    typeof x.text === "string" &&
    x.text.trim().length > 0 &&
    typeof x.category === "string" &&
    (x.category === "awareness" ||
      x.category === "consideration" ||
      x.category === "decision")
  );
}

/**
 * Sonnet call that returns a batch of brand-profile-aware prompts.
 * Throws on Anthropic error (caller maps via mapAnthropicError) and on
 * malformed JSON. Returns parsed prompts + token usage for telemetry.
 */
export async function generatePrompts(input: {
  brandName: string;
  websiteUrl: string | null;
  profile: BrandProfile | null;
  count?: number;
}): Promise<GeneratePromptsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-...")) {
    // Surfaces upstream as a 503; the route handler will translate
    // this into a JSON error rather than a 500 stack trace.
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const targetCount = clampCount(input.count);
  const anthropic = new Anthropic({ apiKey });
  const startedAt = Date.now();

  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    // 50 prompts at ~25 words each ≈ 1500 output tokens; allow headroom.
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: renderProfileForPrompt(
          input.brandName,
          input.websiteUrl,
          input.profile,
          targetCount
        ),
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Sonnet returned no text content for prompt generation");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(textBlock.text));
  } catch {
    throw new Error(
      `Sonnet returned malformed JSON: ${textBlock.text.slice(0, 200)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Sonnet returned a non-array response for prompt batch");
  }

  // Filter to well-shaped items. We don't error on a few drops — the
  // model occasionally emits a stray null at the end of the array.
  const prompts = parsed.filter(isValidGenerated);

  return {
    prompts,
    usage: {
      model: response.model ?? SONNET_MODEL,
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      duration_ms: Date.now() - startedAt,
    },
  };
}
