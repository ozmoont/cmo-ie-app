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
 * the dashboard ("Strong / Moderate / Low / Not visible"). Returns
 * a one-line interpretation suitable for the hero metric.
 *
 * The interpretation is intentionally second-person and prescriptive
 * so the user always knows what to do next.
 */
export function summariseScore(
  score: number,
  brandName: string
): { label: string; body: string } {
  if (score >= 60) {
    return {
      label: "Strong",
      body: `${brandName} appears in most AI conversations. Focus on maintaining position and improving sentiment.`,
    };
  }
  if (score >= 30) {
    return {
      label: "Moderate",
      body: `AI models mention ${brandName} sometimes, but not consistently. Check which prompts are missing you and target those gaps.`,
    };
  }
  if (score > 0) {
    return {
      label: "Low",
      body: `Most AI models aren't recommending ${brandName}. Go to Actions to see what content to create to get cited.`,
    };
  }
  return {
    label: "Not visible",
    body: `AI models don't mention ${brandName} yet. There isn't enough online content about your brand for AI to reference. Start with the Action Plan.`,
  };
}

/**
 * Same shape as summariseScore, applied to average mention position.
 * `position` is an already-rounded decimal as a string ("1.6") or "-".
 */
export function summarisePosition(
  position: string,
  brandName: string
): { label: string; body: string } {
  if (position === "-") {
    return {
      label: "No data yet",
      body: `When AI models start mentioning ${brandName}, this shows whether you're recommended first or buried below competitors.`,
    };
  }
  const n = parseFloat(position);
  if (n <= 2) {
    return {
      label: "Top of the list",
      body: `You're one of the first brands mentioned. AI models see ${brandName} as a top recommendation.`,
    };
  }
  if (n <= 4) {
    return {
      label: "Mid-pack",
      body: `You're mentioned but not first. To move up, ensure your site has clear, structured content that directly answers customer questions.`,
    };
  }
  return {
    label: "Buried",
    body: `You're mentioned late in responses. AI models know you exist but prefer competitors. Check Sources to see who they cite instead.`,
  };
}

/**
 * Sentiment score summary - parallels the two above.
 */
export function summariseSentiment(
  score: number | null,
  totalMentions: number,
  brandName: string
): { label: string; body: string } {
  if (totalMentions === 0 || score === null) {
    return {
      label: "No mentions yet",
      body: `Once AI models mention ${brandName}, we'll track whether they recommend you positively, neutrally, or critically.`,
    };
  }
  if (score >= 60) {
    return {
      label: "Positive",
      body: `AI models speak well of ${brandName}. Keep publishing case studies, reviews, and success stories to maintain this.`,
    };
  }
  if (score >= 40) {
    return {
      label: "Mixed",
      body: `Some mentions are positive, others neutral. Add testimonials, awards, and proof points to strengthen your brand signal.`,
    };
  }
  return {
    label: "Needs attention",
    body: `AI models are describing ${brandName} critically. Check the Recent AI Responses below to see exactly what's being said and address it.`,
  };
}
