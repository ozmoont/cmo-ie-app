-- ── Migration 015 — Gap context on polish_requests ──
-- Phase 2 workstream E: ties the brief → draft → polish pipeline to a
-- specific gap so the human agency team (polishers) can see exactly
-- which competitor-heavy source the user was trying to break into.
-- Also powers the "which gaps did I already act on?" view on the gaps
-- page — once a polish_request exists for a gap, we can suppress or
-- tag that gap row as "in progress".
--
-- Note on numbering: scope doc §E called this migration 011, but that
-- slot was already taken when the polish_requests / classification cache
-- migrations shipped ahead of it in different orders. Renumbered to 015
-- to avoid conflicts with the live sequence.
--
-- Shape of source_gap (TypeScript SourceGap):
--   {
--     scope:         "domain" | "url";
--     domain:        string;                      // required for both scopes
--     url?:          string;                      // set when scope === "url"
--     source_type?:  SourceType | null;           // editorial / ugc / reference …
--     page_type?:    PageType | null;             // article / listicle / comparison …
--     competitors?:  string[];                    // display names of competitors present
--     gap_score?:    number;                      // 0..1 at time of acting
--     captured_at:   string;                      // ISO of when the user clicked
--   }
--
-- All fields nullable-or-absent EXCEPT scope/domain/captured_at — the
-- app should refuse to persist a gap without those three.

ALTER TABLE public.polish_requests
  ADD COLUMN IF NOT EXISTS source_gap JSONB;

COMMENT ON COLUMN public.polish_requests.source_gap IS
  'Gap context captured at the moment the user clicked "Act on this". '
  'Drives gap-aware brief templates and the "already acting" state on '
  'the gaps page. Shape: see lib/types.ts SourceGap.';

-- GIN index on scope + domain so "have I already acted on this gap?" is
-- a single indexed lookup. jsonb_path_ops is intentional — it supports
-- the `@>` containment query we actually run and is smaller than the
-- default operator class.
CREATE INDEX IF NOT EXISTS idx_polish_requests_source_gap
  ON public.polish_requests USING GIN (source_gap jsonb_path_ops);
