-- ── Migration 010 — Classification cache (Phase 2 foundation) ──
-- Caches the Claude-powered type classifications for every domain and
-- URL the visibility pipeline encounters. Stored indefinitely; never
-- re-classified on a cache hit. Each row costs ~$0.001 to populate; the
-- whole dataset for a typical Irish-mid-market project caps out at
-- low single-digit dollars for life of the project.
--
-- See docs/phase-2-scope.md § A for the full rationale.
--
-- Source types (Peec convention):
--   editorial  — news / magazines / blogs run by publishers
--   corporate  — a company's own marketing site (someone else's or yours)
--   ugc        — user-generated-content platforms (Reddit, Quora, HN)
--   reference  — encyclopaedias, glossaries, directories
--   your_own   — the tracked brand's own domain(s)
--   social     — social networks (LinkedIn, Twitter/X, Facebook)
--   other      — classifier bailed; editable via UI later
--
-- Page types (URL-level):
--   article / listicle / how_to / comparison / review /
--   product_page / landing / directory / forum_thread / faq / other

-- ── 1. Domain classifications ──
CREATE TABLE IF NOT EXISTS public.domain_classifications (
  -- Canonicalised domain (lowercase, no www., no trailing slash). The
  -- classifier normalises before write so case collisions don't
  -- produce duplicate rows.
  domain TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'editorial', 'corporate', 'ugc', 'reference',
    'your_own', 'social', 'other'
  )),
  -- 0..1 classifier confidence. Low values (< 0.6) flagged in UI so
  -- users can override.
  confidence REAL NOT NULL DEFAULT 0.7,
  -- The URL we actually fetched to classify (helpful for debugging /
  -- re-classification-on-demand).
  sample_url TEXT,
  -- Allow a human override. When true, the classifier ignores this
  -- row on re-runs.
  manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  classifier_model_version TEXT,
  classified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_classifications_type
  ON public.domain_classifications(source_type);
CREATE INDEX IF NOT EXISTS idx_domain_classifications_classified_at
  ON public.domain_classifications(classified_at);

COMMENT ON TABLE public.domain_classifications IS
  'Claude-derived source-type labels for every domain the pipeline has '
  'seen. Joined into Sources/Gaps queries. Manual overrides persist '
  'across re-classifications.';

-- ── 2. URL classifications ──
CREATE TABLE IF NOT EXISTS public.url_classifications (
  url TEXT PRIMARY KEY,
  page_type TEXT NOT NULL CHECK (page_type IN (
    'article', 'listicle', 'how_to', 'comparison', 'review',
    'product_page', 'landing', 'directory', 'forum_thread',
    'faq', 'other'
  )),
  confidence REAL NOT NULL DEFAULT 0.7,
  -- Captured at classification time so the UI can show a sensible
  -- link label without re-fetching.
  page_title TEXT,
  manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  classifier_model_version TEXT,
  classified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_url_classifications_type
  ON public.url_classifications(page_type);
CREATE INDEX IF NOT EXISTS idx_url_classifications_classified_at
  ON public.url_classifications(classified_at);

-- Domain lookup via functional index (URL → hostname). Used when the
-- UI needs to join URL-level results to the domain's source_type
-- without a separate round-trip.
CREATE INDEX IF NOT EXISTS idx_url_classifications_host
  ON public.url_classifications (
    (lower(regexp_replace(
      split_part(regexp_replace(url, '^https?://', ''), '/', 1),
      '^www\.', ''
    )))
  );

COMMENT ON TABLE public.url_classifications IS
  'Per-URL page-type labels. Populated lazily by the post-run classifier '
  'queue. Feeds the Sources/URLs drill-down and Gap Analysis.';
