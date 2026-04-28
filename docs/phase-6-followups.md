# Phase 6 follow-ups — work that comes after the initial ship

_Status as of 28 April 2026: Phase 6 v1 (`/api/prompts/generate` + `/score` + `/mirror` + UI) shipped. This doc captures the next layer of work — testing, UX gaps, the keyword-volume adapter, and the onboarding integration question — sized so each item can be picked up as its own ticket._

## Context

Phase 6 v1 deliberately drew a tight box:
- API + lib + UI, but only on the Prompts tab.
- Mirror is LLM-inferred; no real keyword volume.
- Score is informational; nothing is filtered or auto-prioritised based on it.
- The single-shot `/api/prompts/suggest` keeps running for onboarding.
- No tests yet.

These follow-ups are the natural extensions once the v1 is in customer hands and we've watched a real org run a few batches.

---

## 6.1 — Tests for the three new lib functions

**Why:** Vitest is wired into CI (`vitest.config.mts`, `vitest.setup.ts`); existing modules like `prompt-quality.ts` and `competitor-suggestions.ts` already have `__tests__/` dirs. Phase 6 shipped without coverage, which is fine for a prototype but not for a feature behind a public API.

**What to test:**

`src/lib/prompts/__tests__/generate.test.ts`:
- Clamps `count` to 20-60 (passes `count: 5` and asserts the prompt asks for 20 anyway; passes `count: 200` and asserts 60).
- Drops malformed array entries (mocks Anthropic returning a mix of valid + null + missing-category items; asserts only valid ones come back).
- Throws a clear error when `ANTHROPIC_API_KEY` is unset.
- Strips ```json fences from a fenced response (cover the `stripJsonFences` path).

`src/lib/prompts/__tests__/score.test.ts`:
- Returns empty result for an empty input array without calling Anthropic.
- Drops scores outside the 1-5 integer range (mock returns `0`, `6`, `3.5`, `"4"` mixed with valid; assert only valid ones land).
- Honours optional `rationale` (truncates to 200 chars).
- Preserves order where possible.

`src/lib/prompts/__tests__/mirror.test.ts`:
- `normaliseMirror` clips to 8 words, lowercases, strips punctuation.
- Empty mirrors after normalisation are dropped (don't return rows with empty strings).
- Brand context is included in the user message (snapshot the input the function builds).

**Mocking strategy:** these are unit tests, so stub the Anthropic client. Existing tests (e.g. `__tests__/run-engine.test.ts`) show the pattern — inject a fake client or use `vi.mock("@anthropic-ai/sdk", …)`.

**Sizing:** half a day. ~20 test cases across the three files.

---

## 6.2 — Per-row Score / Mirror buttons for legacy prompts

**Why:** v1 only scores + mirrors the freshly generated batch. Legacy prompts (Phase 1-5 vintage) stay forever scored=NULL unless the user runs a new batch — which would dump 30-50 new prompts on top of the existing ones, not what they want.

**What to build:**

In `src/app/(dashboard)/projects/[id]/prompts/page.tsx`, on the active-prompts list:

- Add a small icon button per row that's visible on hover (matches the existing trash button pattern):
  - `BarChart3` icon → "Score this prompt" → `POST /api/prompts/score` with `promptIds: [thisPromptId]`.
  - `Search` icon → "Mirror this prompt" → `POST /api/prompts/mirror` with `promptIds: [thisPromptId]`.
- Optimistically update the row when the response lands.
- A subtle spinner during the call.

Bonus: a "Score all unscored" / "Mirror all unmirrored" pair of buttons in the section header for bulk migration of older projects.

**Sizing:** 2-3 hours. UI plumbing only — the API routes already accept `promptIds`.

---

## 6.3 — Pluggable keyword-volume adapter

**Why:** `mirror.ts` returns LLM-inferred keyword phrases. That's enough to give SEO professionals a mental hook, but it can't tell the user which mirrors actually have search demand. Real volume turns the score+mirror columns from "interesting" into "actionable".

**What to build:**

Refactor `mirror.ts` to use an adapter pattern:

```ts
// src/lib/prompts/mirror-adapters/types.ts
export interface MirrorAdapter {
  name: string;
  mirrorBatch(input: { brandName: string; prompts: PromptForMirroring[] }): Promise<{
    mirrored: (MirroredPrompt & { volume?: number; cpc?: number; difficulty?: number })[];
    usage: MirrorUsage;
  }>;
}
```

Keep the existing LLM path as `llm-adapter.ts`. Add `dataforseo-adapter.ts` (or Serper, depending on procurement). The route picks the adapter based on env: if `DATAFORSEO_*` is set, use that; otherwise fall back to LLM.

Schema additions (migration 025): nullable `mirror_volume`, `mirror_cpc`, `mirror_difficulty` on `prompts`.

UI: the mirror cell renders volume + CPC when present, otherwise just the keyword phrase. Sortable by volume.

**Sizing:** 2-3 days, gated by the procurement decision (which API, which plan). Don't start until a customer asks for volume data — premature otherwise.

---

## 6.4 — Re-score / re-mirror when the brand profile changes

**Why:** importance scores are fixed at write time. If the user substantially edits the brand profile (e.g. they were tracked as "fintech" and re-extract surfaces them as "B2B SaaS"), the existing scores are stale but we don't surface that.

**What to build:**

- On `projects` table: bump `profile_updated_at` whenever a profile field changes (already happens).
- On the Prompts tab: if `profile_updated_at` is more recent than the most recent `prompts.updated_at` for any scored prompt, render a thin warning banner: "Your brand profile changed — scores may be stale. Re-score?" with a button that runs `POST /api/prompts/score` with no promptIds (re-score everything).

We deliberately don't auto-re-score — silently changing 50 prompts' scores is more confusing than helpful.

**Sizing:** half a day. UI + a small SQL freshness check on the GET endpoint.

---

## 6.5 — Dedup new generations against existing prompts

**Why:** running a second batch on a project that already has prompts produces near-duplicates. The user has to manually delete dupes — a tax on power users.

**What to build:**

Two options:

1. **Cheap:** in `/api/prompts/generate`, before insert, compute a normalised text key (`lowercase + strip punctuation + sort tokens`) for each new prompt and existing prompt, drop any new one whose key collides. Catches exact and near-exact duplicates.

2. **Expensive:** embed each new + existing prompt with `text-embedding-3-small`, drop any new prompt whose cosine similarity to any existing prompt is > 0.85. Catches semantic duplicates (`"how much does X cost"` vs `"X pricing"`).

v1: ship option 1. Cheap, deterministic, no embedding API call. Revisit option 2 if users complain about semantic dupes still slipping through.

**Sizing:** 2 hours for option 1. A day for option 2 (needs embedding adapter + similarity calc + store-or-recompute decision for existing prompts).

---

## 6.6 — Admin AI-usage view filter

**Why:** the admin dashboard at `/admin/ai-usage` aggregates by feature, so the three new labels (`prompt_generate` / `prompt_score` / `prompt_mirror`) show up automatically. But there's no filter on the page — operators have to eyeball the whole list to find Phase 6 spend.

**What to build:**

- A multi-select on the admin page filtering by `feature`. Pre-selected: all features. Saved in URL search params so the link is shareable.
- A "Phase 6 (prompts)" preset button that sets the filter to `prompt_generate / prompt_score / prompt_mirror` in one click.

**Sizing:** half a day. Pure UI on an existing page.

---

## 6.7 — Onboarding integration question

**Why:** the doc currently says onboarding keeps using single-shot `/api/prompts/suggest`. That decision was deliberate (don't grow onboarding before we trust the batch quality). But once we have a few weeks of telemetry showing the batch is solid, the natural next move is to make it the default — new projects start with 40 prompts, scored and mirrored, ready to run.

**Open questions before flipping:**

- Does the user actually want 40 prompts on day one, or is 10 less overwhelming?
- Onboarding currently completes in ~30s. Phase 6 batch is ~30-45s for generate alone, ~60s for the full pipeline. Is the slower onboarding worth the richer output, or do we run the score+mirror in the background after the user lands on the dashboard?

**Recommended path:**

Run an A/B for two weeks once Phase 6 has shipped to one or two friendly accounts. Half the new orgs get the existing single-shot; half get the batch with background score+mirror. Compare:

- Activation rate (do they finish onboarding?)
- Day-7 retention (do they come back?)
- "Prompts kept" rate (how many prompts they delete vs keep — proxy for prompt quality)

If batch wins on all three, switch the default. If not, dig into why.

**Sizing:** 1-2 days for the A/B harness, 2 weeks of data, then 1-2 hours to flip the default.

---

## Sequencing

I'd run these in this order, gated by what we learn from each:

1. **6.1 — Tests** (half day, immediate). Required before anyone else touches `prompts/{generate,score,mirror}.ts`.
2. **6.2 — Per-row buttons** (half day, immediate). Closes the v1 UX gap on legacy prompts.
3. **6.6 — Admin filter** (half day, immediate). Makes operating Phase 6 less painful on day one.
4. **6.5 — Dedup option 1** (2 hours, after first power user complains about duplicates).
5. **6.4 — Stale-score banner** (half day, after first profile edit reveals the gap).
6. **6.3 — Real keyword adapter** (gated on customer demand + procurement).
7. **6.7 — Onboarding A/B** (gated on 2 weeks of Phase 6 telemetry from real users).

Total v1.5 (items 1-5): ~2-3 dev days.
