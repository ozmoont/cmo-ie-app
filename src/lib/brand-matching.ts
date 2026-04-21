/**
 * Brand matching engine.
 *
 * Decides whether a given brand name was mentioned in a response text,
 * where it appears, and which brands rank in what order. Takes the
 * upgraded competitor / project brand schema (tracked_name + aliases +
 * regex_pattern) from migration 006 and converts it into a single
 * matching pass over the response.
 *
 * Kept as pure functions — no DB, no IO — so it's trivially testable
 * and reusable in any analysis context (run engine, backfills, tests).
 */

export interface MatchableBrand {
  /** Which row this matcher is for. "project" = the tracked brand itself. */
  id: string | "project";
  /** Display name returned by match() — what we show in the UI. */
  display_name: string;
  /** Canonical tracked name. Case-insensitive. Never empty. */
  tracked_name: string;
  /** Additional names that should also count as a match for this brand. */
  aliases: string[];
  /** Optional case-sensitive regex override. Takes precedence over name/alias. */
  regex_pattern?: string | null;
  /** True when this is the project's own tracked brand (vs a competitor). */
  is_tracked_brand?: boolean;
}

export interface BrandMatch {
  brand: MatchableBrand;
  /** 1-indexed position among all matched brands in the response. */
  position: number;
  /** The string that matched (useful for highlighting / debugging). */
  matched_text: string;
  /** Character offset of the match — used to sort mentions. */
  start: number;
}

/**
 * Escape a user-supplied string so it's safe to embed in a regex.
 */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a case-insensitive regex with smart word-boundary anchors:
 * only apply \b on sides that begin/end with a word character. This
 * avoids broken matching on candidates ending in punctuation
 * (e.g. "HubSpot, Inc.") where a trailing \b would fail because `.`
 * is not a word character.
 */
function boundaryRegex(candidate: string): RegExp {
  const escaped = escapeForRegex(candidate);
  const leftAnchor = /^\w/.test(candidate) ? "\\b" : "";
  const rightAnchor = /\w$/.test(candidate) ? "\\b" : "";
  return new RegExp(`${leftAnchor}${escaped}${rightAnchor}`, "i");
}

/**
 * Given a brand's matching rules, return the earliest character index at
 * which the brand is mentioned in `text`, or -1 if not mentioned.
 *
 * Matching precedence:
 *   1. If `regex_pattern` is present, that takes absolute precedence
 *      (case-sensitive, as per the Peec convention).
 *   2. Otherwise, name + aliases are matched case-insensitively with
 *      word-boundary guards to avoid "Apple" matching "pineapple".
 */
export function firstMatchIndex(
  brand: MatchableBrand,
  text: string
): { index: number; matched: string } {
  if (brand.regex_pattern && brand.regex_pattern.trim()) {
    try {
      // Case-sensitive by convention. Users wanting insensitive can use
      // standard regex flags like `(?i)` is NOT supported in JS regex —
      // instead they should add the /i flag via pattern convention or
      // enumerate aliases. Simpler UX: pattern is always applied CS.
      const re = new RegExp(brand.regex_pattern);
      const m = re.exec(text);
      if (m) return { index: m.index, matched: m[0] };
      return { index: -1, matched: "" };
    } catch {
      // Fall through to name+alias matching if the pattern is malformed.
      // A broken regex should never prevent the tracked-name fallback.
    }
  }

  const candidates = [brand.tracked_name, ...brand.aliases].filter(
    (s) => s && s.trim().length > 0
  );
  if (candidates.length === 0) return { index: -1, matched: "" };

  // Word-boundary guarded, case-insensitive. We use the earliest-start
  // match across all candidates so aliases that appear before the
  // canonical name still produce the right `index` for ordering. On
  // ties (multiple candidates match at the same position — common when
  // one candidate is a prefix of another, e.g. "HubSpot" ⊂ "HubSpot Inc.")
  // we pick the longer match for a more faithful `matched_text`.
  let best: { index: number; matched: string } = { index: -1, matched: "" };
  for (const candidate of candidates) {
    const re = boundaryRegex(candidate);
    const m = re.exec(text);
    if (!m) continue;
    const isEarlier = best.index === -1 || m.index < best.index;
    const isLongerTie = m.index === best.index && m[0].length > best.matched.length;
    if (isEarlier || isLongerTie) {
      best = { index: m.index, matched: m[0] };
    }
  }
  return best;
}

/**
 * Run every brand's matcher against `text` and return the brands that
 * appeared, ordered by their first mention position, with 1-indexed
 * `position`. Brands not mentioned are omitted.
 *
 * Intended for the run engine's analysis step — feed in the tracked
 * brand plus every competitor, get back an ordered list suitable for
 * persisting to `result_brand_mentions`.
 */
export function matchBrands(
  brands: MatchableBrand[],
  text: string
): BrandMatch[] {
  const hits: Array<{ brand: MatchableBrand; index: number; matched: string }> =
    [];
  for (const brand of brands) {
    const m = firstMatchIndex(brand, text);
    if (m.index >= 0) {
      hits.push({ brand, index: m.index, matched: m.matched });
    }
  }

  hits.sort((a, b) => a.index - b.index);
  return hits.map((h, i) => ({
    brand: h.brand,
    position: i + 1,
    matched_text: h.matched,
    start: h.index,
  }));
}

/**
 * Convenience: extract the tracked-brand match from a matchBrands result.
 * Returns null if our brand wasn't mentioned.
 */
export function findTrackedBrandMatch(
  matches: BrandMatch[]
): BrandMatch | null {
  return matches.find((m) => m.brand.is_tracked_brand === true) ?? null;
}
