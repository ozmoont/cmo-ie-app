# Phase 6 scope — AdWords-style prompt coverage

_Target window: week 27, kicking off after Phase 5 launch settles._
_Status as of 28 April 2026: telemetry hooks reserved (`prompt_generate`, `prompt_score`, `prompt_mirror` in `ai-usage-logger.ts`). Implementation not yet started._

## Why Phase 6 matters

The current prompt set comes from `/api/prompts/suggest` — a single Sonnet call that returns ~10 prompts split across awareness / consideration / decision. It's good for getting going, but it has three weaknesses:

1. **Coverage is shallow.** Ten prompts can't cover a brand's whole question landscape. Customers in real life ask 30-50 distinct questions across the funnel; we only sample a fraction.
2. **No prioritisation.** Every prompt is treated equally. A user can't tell which of their tracked prompts is "the big one" worth fixing first vs a long-tail edge case.
3. **No volume context.** The product tracks AI visibility but the user has no idea whether a given prompt corresponds to real-world Google search demand. An agency selling AI visibility to a client needs to point at the keyword volume behind a prompt — that's the bridge between traditional SEO mental models and GEO.

Phase 6 borrows the AdWords / Keyword Planner mental model — bulk ideation, importance ranking, mapping back to the closest "real" search query — and applies it to AI prompts. The output is a richer prompt set the user can prioritise like a keyword strategy.

## Success criteria

- Users can generate **30-50 prompts** in one click on the Prompts tab, covering a fuller funnel than the current 10.
- Each prompt carries an **importance score (1-5)** based on how representative it is of real customer demand for the brand's category.
- Each prompt carries a **mirrored Google query** — the closest plain-English keyword a customer would type into Google for the same intent. This is LLM-inferred for v1; a real keyword API can be slotted in later behind the same UI.
- The Prompts tab **renders importance + mirror columns** so users can sort by what matters and see the AdWords-style mapping at a glance.
- The single-shot `/api/prompts/suggest` keeps working — Phase 6 augments, doesn't replace.
- Telemetry is wired so we can compare cost / quality between Phase 6 batches and the legacy single-shot suggester.

---

## Out of scope (deferred)

- **Real keyword volume data** (DataForSEO / Serper / SemRush). The architecture leaves room for it, but the v1 mirror is purely LLM-inferred. Real volume comes when we have a customer asking and a budget for it.
- **Auto-running** — Phase 6 is on-demand. We don't auto-batch on project creation. (The onboarding flow keeps using the old single-shot suggester.)
- **CSV export of the batch.** Reuses the existing prompts table, so the eventual CSV export ticket covers it for free.
- **Auto-rejection of low-importance prompts.** Score is informational; we don't filter or hide anything based on it. The user decides.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  /projects/[id]/prompts                                             │
│  Generate batch button                                              │
└─────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  POST /api/prompts/generate                                         │
│  • Reads brand profile from project                                 │
│  • Calls generatePrompts() → Sonnet → 30-50 prompts                 │
│  • Inserts each as a row in `prompts` (status='inactive')           │
│  • Returns { prompts: Prompt[], batch_id, count }                   │
└─────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  POST /api/prompts/score    (one call, returns 30-50 scores)        │
│  • Calls scorePrompts() → Haiku → importance 1-5 each               │
│  • UPDATE prompts SET importance_score = $score                     │
└─────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  POST /api/prompts/mirror   (one call, returns 30-50 mirrors)       │
│  • Calls mirrorPrompts() → Haiku → "closest Google query"           │
│  • UPDATE prompts SET google_query_mirror = $query                  │
└─────────────────────────────────────────────────────────────────────┘
```

The three endpoints are separate so the UI can show progressive enrichment — prompts appear first, then importance, then mirror — instead of waiting for all three model calls before anything renders.

---

## Schema impact

New migration: `024_phase6_prompt_metadata.sql`. Adds three columns to `prompts`:

```sql
ALTER TABLE public.prompts
  ADD COLUMN importance_score SMALLINT
    CHECK (importance_score IS NULL OR (importance_score BETWEEN 1 AND 5)),
  ADD COLUMN google_query_mirror TEXT,
  ADD COLUMN generated_batch_id UUID;

CREATE INDEX idx_prompts_generated_batch ON public.prompts(generated_batch_id)
  WHERE generated_batch_id IS NOT NULL;
COMMENT ON COLUMN public.prompts.importance_score IS
  '1-5 importance ranking from Phase 6 prompt_score pass. NULL = unscored.';
COMMENT ON COLUMN public.prompts.google_query_mirror IS
  'Closest plain-English Google query for the same intent. LLM-inferred in v1; a real keyword-volume API can replace the source later.';
COMMENT ON COLUMN public.prompts.generated_batch_id IS
  'Set when the prompt came from a Phase 6 /api/prompts/generate batch. Lets us roll back / regenerate / analyse a batch as a unit.';
```

All three columns are nullable. Legacy prompts (created before Phase 6) keep working, just rendered without the score / mirror columns.

---

## Lib contracts

### `src/lib/prompts/generate.ts`

```ts
generatePrompts(input: {
  brandName: string;
  websiteUrl: string | null;
  profile: BrandProfile | null;
  count?: number; // default 40, clamped 20-60
}): Promise<{
  prompts: { text: string; category: PromptCategory }[];
  usage: { input_tokens: number; output_tokens: number; model: string; duration_ms: number };
}>
```

- Sonnet call. Same brand-profile-aware system prompt as `/api/prompts/suggest`, but asks for 30-50 prompts spread evenly across awareness / consideration / decision (target: 40% awareness, 35% consideration, 25% decision).
- Returns the parsed JSON; the caller persists. Pure function — no DB writes.

### `src/lib/prompts/score.ts`

```ts
scorePrompts(input: {
  brandName: string;
  profile: BrandProfile | null;
  prompts: { id: string; text: string; category: PromptCategory }[];
}): Promise<{
  scored: { id: string; importance_score: 1 | 2 | 3 | 4 | 5; rationale?: string }[];
  usage: { /* same shape */ };
}>
```

- Haiku call (one prompt, one response, batch of 30-50 scores). Cheap.
- Importance scale (defined in the system prompt, mirrored here for the doc):
  - **5** — High-volume, high-intent question that any customer in this category would ask.
  - **4** — Common question with clear commercial intent.
  - **3** — Medium relevance — would be asked by some customers.
  - **2** — Niche or long-tail; specific use case.
  - **1** — Edge case, unlikely to drive volume.
- Rationale optional — short string, surfaced as a tooltip in the UI when present.

### `src/lib/prompts/mirror.ts`

```ts
mirrorPrompts(input: {
  brandName: string;
  prompts: { id: string; text: string }[];
}): Promise<{
  mirrored: { id: string; google_query_mirror: string }[];
  usage: { /* same shape */ };
}>
```

- Haiku call. Asks for the closest plain-English Google search query for each AI prompt.
- Rules baked into the system prompt:
  - Mirror must be ≤ 8 words.
  - Mirror is a search-style keyword phrase, not a question.
  - Mirror preserves the AI prompt's intent (e.g. "best digital agencies in Dublin" mirrors to `digital agencies dublin`, not `marketing agency`).
  - Mirror must NOT contain the brand name or its aliases (parity with the AI prompt rule).

The function is shaped so the future v2 can swap the LLM call for a `DataForSeoAdapter.findClosestKeyword(text)` without touching anything outside `mirror.ts`.

---

## API contracts

All three routes:

- `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- Auth-gated (`createClient().auth.getUser()`).
- Project-bound (`projectId` in body).
- Telemetry via `logAiUsage` with the matching feature label.
- Map Anthropic errors via the `mapAnthropicError` helper from `prompts/suggest` (will be lifted into a shared `lib/anthropic-errors.ts` so all four routes share one).

### `POST /api/prompts/generate`

```ts
body: { projectId: string; count?: number }
response: {
  ok: true;
  batch_id: string;        // UUID, the same generated_batch_id stamped on every row
  count: number;           // how many prompts ended up inserted
  prompts: Prompt[];       // newly inserted rows, full shape
}
```

`maxDuration = 60`. Sonnet call typically lands in 15-30s. Inserts are batched.

### `POST /api/prompts/score`

```ts
body: { projectId: string; promptIds?: string[] }  // omit promptIds = score all unscored
response: {
  ok: true;
  scored_count: number;
  prompts: Prompt[];       // returns the updated rows
}
```

`maxDuration = 30`. Haiku call lands in 5-15s for 50 prompts.

### `POST /api/prompts/mirror`

```ts
body: { projectId: string; promptIds?: string[] }  // omit = mirror all without a mirror yet
response: {
  ok: true;
  mirrored_count: number;
  prompts: Prompt[];
}
```

`maxDuration = 30`.

---

## UI

All Phase 6 UI lives on `/projects/[id]/prompts`:

1. **Generate batch button** — a second button next to the existing "Generate suggestions". Labelled "Generate full set". Clicking it:
   - Calls `/api/prompts/generate` → shows progress ("Generating 40 prompts…").
   - On success, immediately calls `/api/prompts/score` for the new batch.
   - On success, immediately calls `/api/prompts/mirror`.
   - At each step, the active prompts list re-renders with the new metadata.

2. **Importance column** — a compact 1-5 dot rating (●●●●○ at score 4). Hovering shows the rationale if present. Sortable column.

3. **Mirror column** — small monospace `~ digital agency dublin` line under the prompt. Subtle, doesn't dominate.

4. **Empty states** — legacy prompts without score / mirror render with an em-dash in those columns. We don't backfill on view; user opts in by clicking "Score" / "Mirror" individually.

5. **Per-prompt re-score / re-mirror buttons** — small icon buttons in the prompt row's hover state. Useful when the user edits a prompt's text.

---

## Telemetry

Every call into the three lib functions writes a `logAiUsage` event with the matching feature label:

| Stage | Provider | Model | Feature label |
|---|---|---|---|
| Generate | anthropic | claude-sonnet-4-6 | `prompt_generate` |
| Score | anthropic | claude-haiku-4-5 | `prompt_score` |
| Mirror | anthropic | claude-haiku-4-5 | `prompt_mirror` |

Existing admin dashboard (`/admin/ai-usage`) groups by feature already, so the three new labels show up as their own rows automatically.

Cost expectations for one full batch (40 prompts):
- Generate (Sonnet, ~3k input + ~2k output): ~$0.045
- Score (Haiku, ~2k input + ~1k output): ~$0.005
- Mirror (Haiku, ~2k input + ~1k output): ~$0.005
- **Total: ~$0.055 per full batch.**

We can run thousands of batches/month before this matters. No per-org rate-limit needed in v1; revisit if a single org pulls > 100 batches/month.

---

## Open questions / future work

- **Real keyword volume API.** The mirror function is shaped so this is a drop-in. Likely candidate: DataForSEO. Open question: do we expose the volume / CPC fields in the UI, or just use them internally to refine the importance score?
- **Score recomputation cadence.** Importance is currently fixed once written. If the brand profile changes substantially, we should re-score automatically or warn the user that scores are stale.
- **Dedup against existing prompts.** Generate currently doesn't check for near-duplicates of prompts already in the project. We could embed-and-compare cosine similarity in v2; for v1 the user manually deletes dupes.
- **Bulk mirror UI.** Right now mirroring an existing legacy prompt requires "Mirror" button per row. A "Mirror all unscored" header button would speed bulk migrations of older projects.
