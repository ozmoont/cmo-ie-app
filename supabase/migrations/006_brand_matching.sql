-- ── Migration 006 — Brand matching upgrade + brand mentions table ──
-- Brings CMO.ie's competitor model closer to Peec.ai parity, and adds
-- the per-result brand-mentions table required for Share of Voice and
-- gap analysis.
--
-- Changes:
-- 1. `competitors` gains display_name / tracked_name / aliases / regex /
--    color / domains. Preserves existing `name` (mapped to tracked_name
--    for backwards compat) and `website_url` (seeds the first domain).
-- 2. `projects` gains the same shape for the tracked brand itself —
--    display_name, aliases, regex, domains — so our brand is matched
--    with the same fidelity as competitors.
-- 3. New table `result_brand_mentions`: one row per brand named in each
--    chat response. Populated by the run-engine's analysis step.
--    Required for SoV, position distribution, and "brand mentioned but
--    not cited" analyses.
--
-- Why one migration for both: brand matching and brand mention storage
-- are the same concept viewed from two ends. The analysis step uses
-- matching rules to identify mentions; mentions are only useful if
-- matching is accurate.

-- ── 1. competitors table upgrade ──

ALTER TABLE public.competitors
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS tracked_name TEXT,
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS regex_pattern TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: display_name defaults to existing name; tracked_name defaults
-- to the existing name (users can refine later). Seed domains from
-- existing website_url where one exists.
UPDATE public.competitors
SET
  display_name = COALESCE(display_name, name),
  tracked_name = COALESCE(tracked_name, name),
  domains = CASE
    WHEN website_url IS NOT NULL AND array_length(domains, 1) IS NULL
    THEN ARRAY[
      regexp_replace(
        regexp_replace(website_url, '^https?://(www\.)?', ''),
        '/.*$', ''
      )
    ]
    ELSE domains
  END
WHERE tracked_name IS NULL OR display_name IS NULL;

-- Now that every row has a tracked_name, make it required.
ALTER TABLE public.competitors
  ALTER COLUMN tracked_name SET NOT NULL,
  ALTER COLUMN display_name SET NOT NULL;

COMMENT ON COLUMN public.competitors.display_name IS
  'Human-readable name shown in dashboards. Does not drive matching.';
COMMENT ON COLUMN public.competitors.tracked_name IS
  'The canonical string Peec-style matching uses. Should be the shortest '
  'unique form (e.g. "HubSpot" not "HubSpot, Inc.").';
COMMENT ON COLUMN public.competitors.aliases IS
  'Alternative spellings, abbreviations, or variations that count as a '
  'match for this brand. Case-insensitive.';
COMMENT ON COLUMN public.competitors.regex_pattern IS
  'Optional advanced regex override. Case-sensitive. Used when simple '
  'name+alias matching is insufficient (e.g. disambiguating "Apple" the '
  'brand from "apple" the fruit).';
COMMENT ON COLUMN public.competitors.domains IS
  'Domains associated with this brand. Used to classify a source URL as '
  '"this competitor" in the sources analyses. Multi-domain support for '
  'brands using different TLDs per market.';

CREATE INDEX IF NOT EXISTS idx_competitors_tracked_name
  ON public.competitors(tracked_name);
CREATE INDEX IF NOT EXISTS idx_competitors_domains
  ON public.competitors USING GIN(domains);
CREATE INDEX IF NOT EXISTS idx_competitors_aliases
  ON public.competitors USING GIN(aliases);

-- ── 2. projects table upgrade (for the tracked brand itself) ──

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS brand_display_name TEXT,
  ADD COLUMN IF NOT EXISTS brand_tracked_name TEXT,
  ADD COLUMN IF NOT EXISTS brand_aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS brand_regex_pattern TEXT,
  ADD COLUMN IF NOT EXISTS brand_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE public.projects
SET
  brand_display_name = COALESCE(brand_display_name, brand_name),
  brand_tracked_name = COALESCE(brand_tracked_name, brand_name),
  brand_domains = CASE
    WHEN website_url IS NOT NULL AND array_length(brand_domains, 1) IS NULL
    THEN ARRAY[
      regexp_replace(
        regexp_replace(website_url, '^https?://(www\.)?', ''),
        '/.*$', ''
      )
    ]
    ELSE brand_domains
  END
WHERE brand_tracked_name IS NULL OR brand_display_name IS NULL;

ALTER TABLE public.projects
  ALTER COLUMN brand_tracked_name SET NOT NULL,
  ALTER COLUMN brand_display_name SET NOT NULL;

COMMENT ON COLUMN public.projects.brand_tracked_name IS
  'Canonical matching name for the tracked brand. Shortest unique form.';
COMMENT ON COLUMN public.projects.brand_aliases IS
  'Alternative spellings recognised as mentions of the tracked brand.';

-- ── 3. result_brand_mentions table ──

CREATE TABLE IF NOT EXISTS public.result_brand_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES public.results ON DELETE CASCADE,
  -- The brand's display name as it appeared in the analysis. We store
  -- the display_name form so listings are readable without a lookup.
  brand_name TEXT NOT NULL,
  -- Foreign key to competitors when the mention matches a tracked
  -- competitor. NULL when the mention is the project's own brand OR
  -- when it's an untracked brand (we capture all brands in the response,
  -- not just tracked ones — Peec-style position calculation needs the
  -- full list).
  competitor_id UUID REFERENCES public.competitors ON DELETE SET NULL,
  -- True when this mention is the tracked brand for the project (our
  -- brand). Mutually exclusive with competitor_id.
  is_tracked_brand BOOLEAN NOT NULL DEFAULT FALSE,
  -- 1-indexed order the brand appeared in the response text.
  position INTEGER NOT NULL,
  -- Sentiment of this specific mention. Different from the aggregated
  -- sentiment on `results.sentiment` which only applies to our brand.
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbm_result_id
  ON public.result_brand_mentions(result_id);
CREATE INDEX IF NOT EXISTS idx_rbm_competitor_id
  ON public.result_brand_mentions(competitor_id);
CREATE INDEX IF NOT EXISTS idx_rbm_is_tracked_brand
  ON public.result_brand_mentions(is_tracked_brand);
-- Compound index for "show me all mentions of brand X across this
-- project" queries, which power the brand-detail page.
CREATE INDEX IF NOT EXISTS idx_rbm_brand_name
  ON public.result_brand_mentions(brand_name);

COMMENT ON TABLE public.result_brand_mentions IS
  'Per-chat-response brand appearances. Populated by the run engine '
  'after analysis of the model response. Drives Share of Voice, position '
  'distribution, brand detail pages, and auto-suggested competitors.';
