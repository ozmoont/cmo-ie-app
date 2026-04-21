/**
 * Prompt-quality lint.
 *
 * Detects "brand bias" — prompts where the user has accidentally
 * included their own brand name in the prompt text. These prompts
 * inflate visibility and position metrics because AI models will
 * always echo a brand that's named in the question, regardless of
 * genuine market knowledge.
 *
 * Peec calls this out in their docs:
 * https://docs.peec.ai/setting-up-your-prompts — "Prompts should be
 * conversational, full questions — not keyword strings." Implicit is:
 * should be the question a customer would ask BEFORE knowing your brand.
 *
 * Pure functions only; no IO. Safe to run client-side as a live
 * validator on the prompt add form.
 */

import { firstMatchIndex, type MatchableBrand } from "./brand-matching";

export type PromptQualityIssue = {
  /** Which field of the prompt failed which check. */
  kind:
    | "contains_brand_name"
    | "contains_brand_alias"
    | "too_short"
    | "not_conversational";
  /** One-line human message explaining what's wrong. */
  message: string;
  /** The exact substring that matched, when relevant. */
  matched_text?: string;
  /** Character offset of the match, when relevant. Useful for UI highlighting. */
  start?: number;
};

export interface PromptQualityResult {
  ok: boolean;
  /** True only when there's at least one `kind: "contains_*"` issue. */
  has_brand_bias: boolean;
  issues: PromptQualityIssue[];
}

/**
 * Check a single prompt against a brand-matcher configuration and a
 * handful of general prompt-quality heuristics.
 *
 * @param promptText Raw text of the prompt.
 * @param brand Same shape as the matcher used in the run engine — this
 *   way "HubSpot Inc." as an alias will trigger the bias check for
 *   prompts mentioning "HubSpot Inc." too.
 */
export function checkPromptQuality(
  promptText: string,
  brand: Pick<MatchableBrand, "tracked_name" | "aliases" | "regex_pattern">
): PromptQualityResult {
  const issues: PromptQualityIssue[] = [];
  const trimmed = promptText.trim();

  // ── Brand-name appearance (the big one) ────────────────────────────
  // Runs the same matcher the run engine uses. If this fires, visibility
  // metrics on this prompt are effectively guaranteed to be 100% and
  // position 1 — which is noise, not signal.
  const trackedMatch = firstMatchIndex(
    {
      id: "project",
      display_name: brand.tracked_name ?? "",
      tracked_name: brand.tracked_name ?? "",
      aliases: [],
      regex_pattern: brand.regex_pattern ?? null,
    },
    trimmed
  );
  if (trackedMatch.index >= 0) {
    issues.push({
      kind: "contains_brand_name",
      message: `The prompt contains your brand name ("${trackedMatch.matched}"). Real customers ask these questions before they know your brand exists — phrase it as they would, not as you would.`,
      matched_text: trackedMatch.matched,
      start: trackedMatch.index,
    });
  } else if (brand.aliases && brand.aliases.length > 0) {
    // Check each alias separately so we can report which variant fired.
    for (const alias of brand.aliases) {
      if (!alias || !alias.trim()) continue;
      const aliasMatch = firstMatchIndex(
        {
          id: "project",
          display_name: alias,
          tracked_name: alias,
          aliases: [],
          regex_pattern: null,
        },
        trimmed
      );
      if (aliasMatch.index >= 0) {
        issues.push({
          kind: "contains_brand_alias",
          message: `The prompt contains an alias of your brand ("${aliasMatch.matched}"). This distorts visibility and position metrics — rewrite so the prompt is market-phrased, not brand-phrased.`,
          matched_text: aliasMatch.matched,
          start: aliasMatch.index,
        });
        break;
      }
    }
  }

  // ── Length check ──────────────────────────────────────────────────
  // Peec recommends 6+ words and a full question rather than a keyword
  // string. We bar "too short" at < 4 words; the common failure mode
  // is keyword-style entries like "best law firm Dublin".
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  if (wordCount > 0 && wordCount < 4) {
    issues.push({
      kind: "too_short",
      message: `Prompt is only ${wordCount} words. AI models give very different answers to keyword-style queries — write it as a full question a customer would ask.`,
    });
  }

  // ── Conversational check ──────────────────────────────────────────
  // Heuristic: a good prompt ends with a question mark OR begins with
  // a question stem (what / how / which / where / who / is / are /
  // should / can / does / do). If neither, flag as "not conversational".
  // Intentionally lenient — we'd rather miss some than false-positive.
  const looksConversational =
    /[?]\s*$/.test(trimmed) ||
    /^\s*(what|how|which|where|who|why|is|are|should|can|does|do|will|would|could)\b/i.test(
      trimmed
    );
  if (trimmed.length > 0 && !looksConversational) {
    issues.push({
      kind: "not_conversational",
      message: `Prompt isn't phrased as a question. AI search queries tend to be full questions ("What is…", "How do I…", "Which…"). Keyword-style input produces thin results.`,
    });
  }

  const has_brand_bias = issues.some(
    (i) => i.kind === "contains_brand_name" || i.kind === "contains_brand_alias"
  );

  return {
    ok: issues.length === 0,
    has_brand_bias,
    issues,
  };
}

/**
 * Batch helper: check every prompt in a list. Returns an array aligned
 * by index with the input, so callers can merge results back into
 * their prompt list for display.
 */
export function checkPromptsQuality(
  prompts: { id: string; text: string }[],
  brand: Pick<MatchableBrand, "tracked_name" | "aliases" | "regex_pattern">
): { id: string; result: PromptQualityResult }[] {
  return prompts.map((p) => ({
    id: p.id,
    result: checkPromptQuality(p.text, brand),
  }));
}
