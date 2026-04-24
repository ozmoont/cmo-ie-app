// Shared display / copy helpers used across dashboard surfaces.
// Keep this file small and side-effect-free; it ships to both server and
// client bundles via component imports.

/**
 * Relative time from an ISO timestamp. Returns "2h ago", "3d ago",
 * "Just now" for < 1min, or "Never scanned" if null/undefined.
 *
 * Rounds down. Does not attempt to be locale-aware; Irish marketers
 * read English time strings natively.
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never scanned";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const MIN = 60 * 1000;
  const HR = 60 * MIN;
  const DAY = 24 * HR;
  if (diff < MIN) return "Just now";
  if (diff < HR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return `${Math.floor(diff / (7 * DAY))}w ago`;
}

/**
 * Classifies a 7-day percentage-point delta into a state + next-action
 * hint. Thresholds are deliberate: ≤ -5% is a real drop worth
 * investigating; ≥ +5% is a meaningful gain worth understanding;
 * in-between is noise.
 *
 * Used in both the dashboard projects list and the project detail
 * hero metric so every "what do I do about this number?" prompt
 * reads identically across surfaces.
 */
export type ProjectState =
  | {
      kind: "declining";
      label: string;
      cta: string;
      href: (id: string) => string;
    }
  | {
      kind: "growing";
      label: string;
      cta: string;
      href: (id: string) => string;
    }
  | { kind: "steady"; label: string };

export function classifyDelta(delta: number): ProjectState {
  if (delta <= -5) {
    return {
      kind: "declining",
      label: `Down ${Math.abs(delta)}%`,
      cta: "Review gaps",
      href: (id) => `/projects/${id}/actions`,
    };
  }
  if (delta >= 5) {
    return {
      kind: "growing",
      label: `Up ${delta}%`,
      cta: "Review wins",
      href: (id) => `/projects/${id}`,
    };
  }
  return { kind: "steady", label: "Steady" };
}

/**
 * Summarises a visibility score with the same tiered copy used on
 * the dashboard ("Strong / Moderate / Low / Not visible").
 *
 * Passing the optional `ctx` object injects the actual numbers into
 * the body copy — the difference between "AI models mention you
 * sometimes" (generic) and "Mentioned in 4 of 15 checks — Claude
 * saw you, ChatGPT and Perplexity didn't" (specific, actionable).
 * Callers that don't have those numbers handy still get the
 * generic phrasing.
 */
export function summariseScore(
  score: number,
  brandName: string,
  ctx?: {
    total?: number;
    mentioned?: number;
    /** Models that mentioned the brand at least once in the window. Used for the "Claude saw you, X didn't" line. */
    mentionedModels?: string[];
    /** Models that returned results but never mentioned the brand. */
    missedModels?: string[];
  }
): { label: string; body: string } {
  const stats = buildStatsPhrase(brandName, ctx);
  const models = buildModelSplitPhrase(ctx?.mentionedModels, ctx?.missedModels);
  if (score >= 60) {
    return {
      label: "Strong",
      body: joinSentences(
        stats,
        models,
        `Focus on holding ${brandName}'s lead — improve sentiment and capture more prompt surface area.`
      ),
    };
  }
  if (score >= 30) {
    return {
      label: "Moderate",
      body: joinSentences(
        stats,
        models,
        `Target the prompts that are missing ${brandName} next — those gaps are your fastest path up.`
      ),
    };
  }
  if (score > 0) {
    return {
      label: "Low",
      body: joinSentences(
        stats,
        models,
        `Head to Actions for specific content briefs that get AI to cite ${brandName}.`
      ),
    };
  }
  return {
    label: "Not visible",
    body: joinSentences(
      stats,
      models,
      `AI has no signal for ${brandName} in your category. Start with the Action Plan.`
    ),
  };
}

/**
 * Same shape as summariseScore, applied to average mention position.
 * `position` is an already-rounded decimal as a string ("1.6") or "-".
 *
 * Passing `ctx.mentionedCount` + `ctx.totalModels` rewrites the body
 * to name the number of mentions directly instead of the bland
 * "you're mentioned but not first".
 */
export function summarisePosition(
  position: string,
  brandName: string,
  ctx?: { mentionedCount?: number; totalModels?: number }
): { label: string; body: string } {
  if (position === "-") {
    return {
      label: "No data yet",
      body: `When AI models start mentioning ${brandName}, this shows whether you're recommended first or buried below competitors.`,
    };
  }
  const n = parseFloat(position);
  const positionClause = `Average position #${n.toFixed(1)}${
    ctx?.mentionedCount !== undefined
      ? ` across ${ctx.mentionedCount} mention${ctx.mentionedCount === 1 ? "" : "s"}`
      : ""
  }.`;
  if (n <= 2) {
    return {
      label: "Top of the list",
      body: joinSentences(
        positionClause,
        `AI models treat ${brandName} as a top recommendation — defend this by publishing category-defining content.`
      ),
    };
  }
  if (n <= 4) {
    return {
      label: "Mid-pack",
      body: joinSentences(
        positionClause,
        `You're mentioned but not first. Clearer, structured content answering customer questions directly moves the needle fastest.`
      ),
    };
  }
  return {
    label: "Buried",
    body: joinSentences(
      positionClause,
      `AI knows ${brandName} exists but prefers competitors. Check Sources to see who it cites instead.`
    ),
  };
}

/**
 * Computes Share of Voice from raw mention counts.
 *
 * SoV answers the question "when AI talks about brands in this space,
 * how often is it talking about you vs competitors?". It is distinct
 * from Visibility (which answers "how often does AI mention you at all
 * when asked about this topic"). See
 * docs/peec-ai-competitive-review.md § Core metrics comparison.
 *
 * Formula:
 *   SoV = (tracked_brand_mentions / total_brand_mentions) × 100
 *
 * Returns 0 when there are no mentions — callers should usually branch
 * on `totalMentions === 0` before displaying the score so they can
 * render a "no data yet" state instead of "0%".
 */
export function computeShareOfVoice(
  trackedBrandMentions: number,
  totalMentions: number
): number {
  if (totalMentions <= 0) return 0;
  return Math.round((trackedBrandMentions / totalMentions) * 100);
}

/**
 * Prose interpretation of an SoV score, mirroring the tiered copy used
 * for visibility/position/sentiment so every dashboard summary has the
 * same voice.
 *
 * Thresholds:
 *   - No data: totalMentions === 0
 *   - Dominant (≥ 40%): you're the primary voice in AI answers
 *   - Competitive (20–40%): you show up, but share airtime
 *   - Trailing (< 20%): competitors dominate the conversation
 */
export function summariseShareOfVoice(
  trackedBrandMentions: number,
  totalMentions: number,
  brandName: string
): { label: string; body: string; score: number } {
  const score = computeShareOfVoice(trackedBrandMentions, totalMentions);

  if (totalMentions === 0) {
    return {
      label: "No data yet",
      body: `${brandName} hasn't been weighed against competitors yet. As AI answers accumulate, this will show how much of the conversation you own.`,
      score: 0,
    };
  }

  if (score >= 40) {
    return {
      label: "Dominant",
      body: `${brandName} is the primary brand AI recommends in your category. Focus on holding this position — capture more prompt surface area rather than chasing incremental mentions.`,
      score,
    };
  }

  if (score >= 20) {
    return {
      label: "Competitive",
      body: `${brandName} shows up but shares the conversation with competitors. Target the prompts where rivals consistently outpace you — that's the fastest path to a larger share.`,
      score,
    };
  }

  return {
    label: "Trailing",
    body: `Competitors dominate the AI conversation. Go to Gap Analysis to see which sources AI trusts that don't yet mention ${brandName}, and start there.`,
    score,
  };
}

/**
 * Sentiment score summary — parallels the two above.
 *
 * When `distribution` is passed (positive/neutral/negative counts),
 * the body calls out the split explicitly — "9 positive · 2 neutral
 * · 1 negative" — which is materially more useful than "AI speaks
 * well of you".
 */
export function summariseSentiment(
  score: number | null,
  totalMentions: number,
  brandName: string,
  distribution?: { positive: number; neutral: number; negative: number }
): { label: string; body: string } {
  if (totalMentions === 0 || score === null) {
    return {
      label: "No mentions yet",
      body: `Once AI models mention ${brandName}, we'll track whether they recommend you positively, neutrally, or critically.`,
    };
  }
  const split = distribution
    ? `${distribution.positive} positive · ${distribution.neutral} neutral · ${distribution.negative} negative across ${totalMentions} mention${totalMentions === 1 ? "" : "s"}.`
    : null;
  if (score >= 60) {
    return {
      label: "Positive",
      body: joinSentences(
        split,
        `AI speaks well of ${brandName}. Keep publishing case studies, reviews, and independent proof to hold this.`
      ),
    };
  }
  if (score >= 40) {
    return {
      label: "Mixed",
      body: joinSentences(
        split,
        `Some mentions land positive, others neutral. Testimonials, awards, and sharper proof points strengthen the signal.`
      ),
    };
  }
  return {
    label: "Needs attention",
    body: joinSentences(
      split,
      `AI describes ${brandName} critically. Open Recent AI Responses to see exactly what's being said — and address the specific claims.`
    ),
  };
}

// ── Helpers (used by the summarisers above) ─────────────────────────

function buildStatsPhrase(
  brandName: string,
  ctx?: { total?: number; mentioned?: number }
): string | null {
  if (!ctx || ctx.total === undefined || ctx.total === 0) return null;
  const mentioned = ctx.mentioned ?? 0;
  const pct = Math.round((mentioned / ctx.total) * 100);
  return `${brandName} was mentioned in ${mentioned} of ${ctx.total} checks (${pct}%).`;
}

function buildModelSplitPhrase(
  mentionedModels?: string[],
  missedModels?: string[]
): string | null {
  const mentioned = (mentionedModels ?? []).filter(Boolean);
  const missed = (missedModels ?? []).filter(Boolean);
  if (mentioned.length === 0 && missed.length === 0) return null;
  if (mentioned.length > 0 && missed.length === 0) {
    return `${joinList(mentioned)} saw you.`;
  }
  if (mentioned.length === 0 && missed.length > 0) {
    return `${joinList(missed)} didn't mention you.`;
  }
  return `${joinList(mentioned)} saw you, ${joinList(missed)} didn't.`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function joinSentences(
  ...parts: Array<string | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
