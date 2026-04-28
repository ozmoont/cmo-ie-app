-- ── Phase 6: AdWords-style prompt coverage ──
--
-- Adds three columns to the prompts table so we can carry the
-- batch-generator + importance-score + Google-mirror metadata
-- introduced in Phase 6.
--
-- All three columns are nullable. Legacy prompts (Phase 1-5) keep
-- working unchanged; the UI just renders an em-dash for the new
-- columns until the user opts in by re-running score / mirror.
--
-- Source of truth for the design: docs/phase-6-prompt-coverage.md

ALTER TABLE public.prompts
  ADD COLUMN IF NOT EXISTS importance_score SMALLINT
    CHECK (importance_score IS NULL OR (importance_score BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS importance_rationale TEXT,
  ADD COLUMN IF NOT EXISTS google_query_mirror TEXT,
  ADD COLUMN IF NOT EXISTS generated_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_prompts_generated_batch
  ON public.prompts(generated_batch_id)
  WHERE generated_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prompts_importance_score
  ON public.prompts(project_id, importance_score DESC NULLS LAST);

COMMENT ON COLUMN public.prompts.importance_score IS
  '1-5 importance ranking from Phase 6 prompt_score pass. '
  '5 = high-volume, high-intent. 1 = niche edge case. '
  'NULL = unscored (legacy prompts or not-yet-run).';

COMMENT ON COLUMN public.prompts.importance_rationale IS
  'Optional one-line explanation Haiku emitted alongside the '
  'importance_score. Surfaced as a tooltip in the UI. NULL is fine.';

COMMENT ON COLUMN public.prompts.google_query_mirror IS
  'Closest plain-English Google query for the same intent, ≤8 words. '
  'LLM-inferred in v1 via prompt_mirror; can be replaced with real '
  'keyword-volume data (DataForSEO etc.) without UI changes.';

COMMENT ON COLUMN public.prompts.generated_batch_id IS
  'Set when the prompt came from a Phase 6 /api/prompts/generate '
  'batch. Lets us roll back, regenerate, or analyse a batch as a unit.';
