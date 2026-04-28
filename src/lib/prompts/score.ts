/**
 * Phase 6 — prompt importance scorer.
 *
 * Pure function. Takes a batch of prompts + brand context, asks Haiku
 * to assign each one an importance score (1-5) with an optional
 * one-line rationale. Returns the parsed scores keyed by prompt id.
 *
 * Why Haiku: this is a fast, cheap classification task. We send up to
 * 60 prompts in one call and get 60 small judgments back. Sonnet would
 * be overkill at ~10x the cost.
 *
 * Score scale (mirrored in the system prompt and the doc):
 *   5 — High-volume, high-intent question any customer would ask.
 *   4 — Common question with clear commercial intent.
 *   3 — Medium relevance — would be asked by some customers.
 *   2 — Niche or long-tail; specific use case.
 *   1 — Edge case, unlikely to drive meaningful volume.
 *
 * Source-of-truth design doc: docs/phase-6-prompt-coverage.md
 */

import Anthropic from "@anthropic-ai/sdk";
import type { BrandProfile } from "@/lib/brand-profile";
import type { PromptCategory } from "@/lib/types";
import { stripJsonFences } from "@/lib/anthropic-errors";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export type ImportanceScore = 1 | 2 | 3 | 4 | 5;

export interface PromptForScoring {
  id: string;
  text: string;
  category: PromptCategory;
}

export interface ScoredPrompt {
  id: string;
  importance_score: ImportanceScore;
  /**
   * Optional ≤120-char rationale. We keep these short so the UI can
   * render them as a tooltip without overflowing.
   */
  rationale?: string;
}

export interface ScoreUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
}

export interface ScorePromptsResult {
  scored: ScoredPrompt[];
  usage: ScoreUsage;
}

const SYSTEM_PROMPT = `You are scoring AI-search prompts by importance for a brand-tracking product.

For each prompt you receive, output an importance score 1-5 reflecting how representative the prompt is of real customer demand for this brand's category.

Score scale:
• 5 — High-volume, high-intent question that any potential customer in this category would ask. Bread-and-butter top-of-funnel or shortlist queries.
• 4 — Common question with clear commercial intent. Many customers would ask this; the answer influences purchase decisions.
• 3 — Medium relevance. A meaningful subset of customers would ask this, but it's not universal.
• 2 — Niche or long-tail; addresses a specific use case or sub-segment.
• 1 — Edge case. Unlikely to drive meaningful volume for this brand.

Calibration anchors:
• "best [category] in Ireland" should score 5 — this is exactly how customers search.
• A pricing-comparison prompt naming a real category leader should score 4-5 (commercial intent is high).
• A question about a regulatory or compliance edge case relevant to a small subset of buyers should score 2.
• A question about a hypothetical or speculative scenario should score 1.

Hard rules:
1. Score every prompt you receive. The output array length MUST equal the input array length, in the same order.
2. Use the prompt's id verbatim in your output.
3. importance_score MUST be an integer 1, 2, 3, 4, or 5. No 0, no decimals, no strings.
4. rationale is optional (omit the field entirely if not useful). When present, ≤120 chars. No markdown.

Output contract: return ONLY valid JSON. No markdown fences, no preamble, no explanation. Shape:

[{"id": string, "importance_score": 1|2|3|4|5, "rationale"?: string}]`;

function renderBrandContext(
  brandName: string,
  profile: BrandProfile | null
): string {
  const parts: string[] = [`Brand: ${brandName}`];
  if (profile?.market_segment) {
    parts.push(`Market segment: ${profile.market_segment}`);
  }
  if (profile?.short_description) {
    parts.push(`What they do: ${profile.short_description}`);
  }
  if (profile?.target_audience) {
    parts.push(`Target audience: ${profile.target_audience}`);
  }
  return parts.join("\n");
}

function isValidScored(item: unknown): item is ScoredPrompt {
  if (!item || typeof item !== "object") return false;
  const x = item as {
    id?: unknown;
    importance_score?: unknown;
    rationale?: unknown;
  };
  if (typeof x.id !== "string" || x.id.length === 0) return false;
  if (
    typeof x.importance_score !== "number" ||
    !Number.isInteger(x.importance_score) ||
    x.importance_score < 1 ||
    x.importance_score > 5
  ) {
    return false;
  }
  if (x.rationale !== undefined && typeof x.rationale !== "string") {
    return false;
  }
  return true;
}

/**
 * Send a batch of prompts to Haiku for importance scoring. Returns
 * the scored array (same order as input where possible) plus token
 * usage for telemetry.
 *
 * Drops malformed entries silently rather than throwing — partial
 * scoring is more useful than a hard failure on a single bad row.
 */
export async function scorePrompts(input: {
  brandName: string;
  profile: BrandProfile | null;
  prompts: PromptForScoring[];
}): Promise<ScorePromptsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-...")) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  if (input.prompts.length === 0) {
    return {
      scored: [],
      usage: {
        model: HAIKU_MODEL,
        input_tokens: 0,
        output_tokens: 0,
        duration_ms: 0,
      },
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const startedAt = Date.now();

  const userMessage = [
    renderBrandContext(input.brandName, input.profile),
    "",
    "Score the following prompts:",
    JSON.stringify(
      input.prompts.map((p) => ({
        id: p.id,
        text: p.text,
        category: p.category,
      }))
    ),
  ].join("\n");

  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Haiku returned no text content for prompt scoring");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(textBlock.text));
  } catch {
    throw new Error(
      `Haiku returned malformed JSON for scoring: ${textBlock.text.slice(0, 200)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Haiku returned a non-array response for scoring batch");
  }

  // Filter malformed rows. Confine importance_score to the union type.
  const scored: ScoredPrompt[] = parsed.filter(isValidScored).map((row) => ({
    id: row.id,
    importance_score: row.importance_score as ImportanceScore,
    ...(row.rationale && row.rationale.trim().length > 0
      ? { rationale: row.rationale.slice(0, 200) }
      : {}),
  }));

  return {
    scored,
    usage: {
      model: response.model ?? HAIKU_MODEL,
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      duration_ms: Date.now() - startedAt,
    },
  };
}
