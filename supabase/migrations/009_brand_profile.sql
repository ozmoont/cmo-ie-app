-- ── Migration 009 — Structured brand profile on projects ──
-- Replaces ad-hoc website fetching with a stored, editable profile that
-- drives every downstream personalisation step (prompt suggestions,
-- competitor detection, action drafting). See
-- docs/peec-ai-competitive-review.md § Brand profile and
-- docs/execution-plan.md Phase 1.
--
-- The profile is populated from a one-off Claude-powered extraction at
-- onboarding (or on-demand via a "refresh" button). Users can edit any
-- field; changes re-trigger prompt suggestions via the existing
-- /api/prompts/suggest route.

ALTER TABLE public.projects
  -- Short plain-English description of what the business does.
  -- Example: "Employment-law firm advising SMEs on hiring, termination,
  -- and workplace disputes." Max ~300 chars.
  ADD COLUMN IF NOT EXISTS profile_short_description TEXT,
  -- Industry / vertical / sub-category. Example: "Irish employment-law
  -- legal services for small and medium businesses." Max ~200 chars.
  ADD COLUMN IF NOT EXISTS profile_market_segment TEXT,
  -- Brand positioning — e.g. "premium", "challenger", "enterprise-focused",
  -- "low-cost alternative". Claude picks the tone from the site.
  ADD COLUMN IF NOT EXISTS profile_brand_identity TEXT,
  -- Who the brand's customers are.
  ADD COLUMN IF NOT EXISTS profile_target_audience TEXT,
  -- Flexible JSON shape for products / services. Rather than a separate
  -- table (premature), we store an array of { name, description } objects
  -- here and let the extractor emit as many as it finds.
  ADD COLUMN IF NOT EXISTS profile_products_services JSONB DEFAULT '[]'::jsonb,
  -- Tracks when the profile was last extracted / edited. The suggestion
  -- engine reads this to decide whether to regenerate prompt suggestions.
  ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.projects.profile_short_description IS
  'One-sentence description of what the business does. Populated by the '
  'Claude-based extractor at onboarding; editable.';
COMMENT ON COLUMN public.projects.profile_market_segment IS
  'Industry / sub-segment. Drives industry-specific prompt suggestion.';
COMMENT ON COLUMN public.projects.profile_brand_identity IS
  'Positioning statement — premium / challenger / enterprise / etc.';
COMMENT ON COLUMN public.projects.profile_target_audience IS
  'Who the brand serves. Used to bias prompt suggestions toward realistic '
  'customer questions.';
COMMENT ON COLUMN public.projects.profile_products_services IS
  'JSON array of { name, description } for each product / service. Used '
  'to surface offering-specific prompts and content actions.';

CREATE INDEX IF NOT EXISTS idx_projects_profile_updated_at
  ON public.projects(profile_updated_at);
