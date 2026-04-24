/**
 * Source-type-tailored content for the gap-aware brief generator.
 *
 * When a user clicks "Act on this" on a Gap Analysis row we know the
 * source type (editorial / ugc / reference / …). That completely
 * changes what a good response looks like:
 *
 *   editorial  → pitch the editor, draft an op-ed or expert commentary
 *   corporate  → partnership angle, case study, or directory listing
 *   ugc        → authentic community reply (Reddit, HN, Quora-style)
 *   reference  → directory submission or entry correction
 *   your_own   → self-audit (already yours — fix structured data)
 *   social     → engagement plan (posts, reshares, peer commentary)
 *   other      → generic brief
 *
 * The brief prompt is composed of:
 *   BRIEF_WRITER_BASE + playbookInstruction(gap) + renderGapContext(gap)
 *
 * Keeping the per-type playbook isolated here means the brief route
 * stays dumb and `gap-brief-templates.test.ts` can cover the string
 * shaping without pulling in Anthropic.
 */

import type { SourceGap } from "@/lib/types";

export const BRIEF_WRITER_BASE = `You are a senior Content Strategist and Brief Writer specialising in GEO (Generative Engine Optimisation) for the Irish market.

Your job is to turn a *specific AI-visibility gap* into a brief that a marketing team or agency can execute immediately — not a generic content plan.

Every brief you write must include:
1. **Objective** — exactly what winning on this gap looks like. Tie it to the AI query it affects.
2. **Target prompts** — the specific AI search queries this gap relates to.
3. **Recommended format** — one format only (editorial pitch / community reply / directory submission / etc.) based on the source type. Name it in the heading.
4. **Angle / hook** — what's going to get this accepted. Be specific, not generic.
5. **Outline or copy** — structured content the executor can use as-is or with light editing.
6. **Distribution plan** — where to send it, who to contact, how to follow up.
7. **Measurement** — how we'll know this worked (what metric, over what window).

Write in a professional but practical tone. Name competitors by their actual names when relevant. Return clean markdown with no code fences wrapping it.`;

/**
 * Source-type-specific instruction inserted into the system prompt
 * after BRIEF_WRITER_BASE. Empty string when no playbook applies
 * (shouldn't happen for a well-shaped SourceGap, but the brief still
 * works without it).
 */
export function playbookInstruction(gap: SourceGap | null | undefined): string {
  if (!gap) return "";
  switch (gap.source_type) {
    case "editorial":
      return `
---

This is an **editorial gap** — competitors are being cited in a publication and you aren't.
Produce: a digital PR / journalist pitch or an expert commentary / op-ed angle.
Name the likely contact (editor / features desk / newsroom alias) when the domain suggests one.
Include a draft subject line and a 120-180-word pitch body the user can paste into an email.
Call out what the angle adds vs. the competitor coverage the AI already sees.`;
    case "corporate":
      return `
---

This is a **corporate gap** — another company's owned marketing site is being cited.
Produce: a partnership / case-study / mutual-content angle, a guest-contributor angle, or a directory-listing check.
Be honest when the source is a competitor's own site and straight imitation won't work — name the angle that actually plays (partnership, co-marketing, joint case study).`;
    case "ugc":
      return `
---

This is a **community / UGC gap** — Reddit / Quora / HN / forum-type content is being cited.
Produce: an authentic reply or thread-participation plan, NOT a marketing post.
Give the user a paste-able draft reply (200-350 words) that's helpful first and branded second. Include a light disclosure line.
Flag which subreddits / threads / communities to post or answer in. Do not invent usernames.`;
    case "reference":
      return `
---

This is a **reference-site gap** — a directory, glossary, encyclopaedia, or comparison site is being cited.
Produce: a directory submission / entry-correction plan.
List the exact page to submit or correct, the required fields (description, logo, URL, category), and draft copy for each field in the right tone for that site.`;
    case "your_own":
      return `
---

This is **your own domain** — the source is already under the brand's control but isn't being picked up.
Produce: an on-page / structured-data audit for this exact URL.
Focus on schema.org markup, content depth vs. the query, heading hierarchy, entity naming, and internal links.`;
    case "social":
      return `
---

This is a **social platform gap** — LinkedIn / X / Facebook / similar.
Produce: a 2-4-post mini-campaign that's credible for the platform (not recycled blog copy).
Give post drafts with platform-appropriate length and voice, plus a suggested posting cadence and one piece of first-party data to anchor the series.`;
    case "other":
    case null:
    case undefined:
      return `
---

Source type unclear — default to a generic content plan with a clear path to the specific AI query being missed.`;
  }
}

/** Renders the gap metadata as a user-message preamble for the model. */
export function renderGapContext(gap: SourceGap): string {
  const lines: string[] = [];
  lines.push(`Scope: ${gap.scope}`);
  lines.push(`Domain: ${gap.domain}`);
  if (gap.url) lines.push(`URL: ${gap.url}`);
  if (gap.source_type) lines.push(`Source type: ${gap.source_type}`);
  if (gap.page_type) lines.push(`Page type: ${gap.page_type}`);
  if (gap.competitors && gap.competitors.length > 0) {
    lines.push(`Competitors present here: ${gap.competitors.join(", ")}`);
  }
  if (typeof gap.gap_score === "number") {
    lines.push(`Gap score: ${gap.gap_score.toFixed(3)}`);
  }
  return lines.join("\n");
}

/**
 * A short, scannable action title we can persist on polish_requests
 * when none is supplied by the UI. Keeps the "my recent actions"
 * list readable.
 */
export function deriveActionTitle(gap: SourceGap): string {
  if (gap.scope === "url" && gap.url) {
    const host = safeHost(gap.url);
    if (gap.source_type === "editorial") return `Pitch to ${host}`;
    if (gap.source_type === "ugc") return `Community reply on ${host}`;
    if (gap.source_type === "reference") return `Submit/correct on ${host}`;
    return `Act on ${host}`;
  }
  if (gap.source_type === "editorial") return `Earn coverage on ${gap.domain}`;
  if (gap.source_type === "ugc") return `Engage community on ${gap.domain}`;
  if (gap.source_type === "reference") return `Get listed on ${gap.domain}`;
  if (gap.source_type === "your_own") return `Optimise ${gap.domain}`;
  return `Act on ${gap.domain}`;
}

function safeHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).host.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}
