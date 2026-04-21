-- ── Migration 008 — Competitor suggestions queue ──
-- Stores brand names that appeared in AI responses alongside the tracked
-- brand but aren't yet set up as competitors. Users can promote them to
-- tracked competitors (Track) or dismiss them (Reject). See
-- docs/peec-ai-competitive-review.md § Competitor / brand setup.
--
-- Auto-population happens via the run engine's brand-matching step: any
-- brand_name found in the analysis response that isn't in `competitors`
-- for the project is upserted here, with the mention count incremented.
-- Peec's convention is to surface suggestions at >= 2 mentions, which
-- we'll enforce at query time rather than insert time so the threshold
-- is tunable.
--
-- Status enum: pending (awaiting user action), tracked (user clicked
-- Track — becomes a competitors row), rejected (user dismissed).

CREATE TABLE IF NOT EXISTS public.competitor_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  -- Display name as it appeared in the response. We store the first
  -- observed form and don't try to normalise — if the same brand shows
  -- up as "HubSpot" and "HubSpot Inc." we'll produce two suggestions
  -- and let the user merge at track-time via aliases.
  brand_name TEXT NOT NULL,
  -- How many times this brand has been seen across recent results.
  -- Incremented by the run engine; decayed if we ever add that.
  mention_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'tracked', 'rejected')),
  -- When a suggestion is promoted, we link to the created competitor.
  competitor_id UUID REFERENCES public.competitors ON DELETE SET NULL,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- One suggestion per (project, brand_name). Case-insensitive so "HubSpot"
-- and "HUBSPOT" collapse to the same row; mention count aggregates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_suggestions_project_name
  ON public.competitor_suggestions(project_id, LOWER(brand_name));
CREATE INDEX IF NOT EXISTS idx_comp_suggestions_project_status
  ON public.competitor_suggestions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_comp_suggestions_mention_count
  ON public.competitor_suggestions(mention_count DESC);

COMMENT ON TABLE public.competitor_suggestions IS
  'Auto-detected brand names from AI responses that aren''t yet tracked '
  'competitors. Pending rows with mention_count >= 2 surface on the '
  'Brands page as "Suggested Brands" with Track / Reject actions.';
