-- ── Migration 023: SEO audit progress tracking ──
-- The run engine writes a progress phrase to the audit row at each
-- pipeline stage (fetch → PSI → Sonnet → parse → save). The UI polls
-- the row every 1.5s and renders the latest phrase as a loading
-- indicator.
--
-- We persist this rather than streaming via SSE because:
--   1. The audit run is fully async (the user can navigate away)
--   2. Polling lets a refreshed page resume showing the right state
--   3. Multiple users in the same org could be watching the same audit
--
-- progress_percent is approximate — we just want a moving bar, not
-- exact accuracy. Set at known checkpoints in lib/seo-audit/run.

ALTER TABLE public.seo_audits
  ADD COLUMN IF NOT EXISTS progress_step TEXT,
  ADD COLUMN IF NOT EXISTS progress_percent INTEGER
    CHECK (progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100));

COMMENT ON COLUMN public.seo_audits.progress_step IS
  'Latest pipeline step description for the UI loading indicator. e.g. "Fetching site...", "Running Claude analysis..."';

COMMENT ON COLUMN public.seo_audits.progress_percent IS
  'Approximate completion 0-100. Updated at known checkpoints, not strictly accurate.';

NOTIFY pgrst, 'reload schema';
