-- ── Migration 005 — Real data pipeline ──
-- Marks the transition from simulated AI responses (Claude Haiku roleplay)
-- to real multi-model queries. See docs/data-collection-sources.md for the
-- audit that led to this change.
--
-- Changes:
-- 1. Add citations.was_cited_inline — Peec's sources-vs-citations distinction.
--    Prior to this migration, every "citation" was an inline citation by
--    definition (Haiku didn't differentiate). Default TRUE preserves that
--    semantics for any legacy rows, though we truncate below anyway.
-- 2. Add results.model_version — the specific underlying model ID
--    (e.g. "gpt-4.1-2025-04-14", "claude-sonnet-4-6"). Useful when
--    providers roll model updates and we need to pin regressions.
-- 3. Truncate results + citations — all existing rows are synthetic
--    Haiku roleplay and have no value once real adapters ship. No
--    customer data is lost because there are no paying customers as of
--    this migration.

-- 1. Sources vs citations distinction
ALTER TABLE public.citations
  ADD COLUMN IF NOT EXISTS was_cited_inline BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.citations.was_cited_inline IS
  'True if the model referenced this URL inline in the response body. '
  'False if the URL appeared in the model''s source list/sidebar but was '
  'not explicitly cited. The distinction matters for gap analysis — a '
  'domain retrieved-but-never-cited is a different opportunity than one '
  'retrieved-and-cited.';

-- 2. Model version pinning
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS model_version TEXT;

COMMENT ON COLUMN public.results.model_version IS
  'Concrete model identifier returned by the provider at query time '
  '(e.g. gpt-4.1-2025-04-14, claude-sonnet-4-6). Lets us attribute '
  'visibility shifts to model updates.';

CREATE INDEX IF NOT EXISTS idx_results_model_version
  ON public.results(model_version);

-- 3. Truncate synthetic data.
-- Rationale: every row in these tables was produced by the Haiku roleplay
-- pipeline and is indistinguishable from imagination. Keeping them would
-- contaminate the new analytics with garbage. Safe because no paying
-- customer has made decisions on this data.
-- If you are running this in a branch where customers DO exist, replace
-- the TRUNCATE below with a conditional DELETE or a soft-delete migration.
TRUNCATE TABLE public.citations RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.results RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.daily_runs RESTART IDENTITY CASCADE;
