-- ── Migration 019 — Crawlability checker + newsletter subscribers ──
-- Phase 4 workstream C. Powers the public /crawlability tool and the
-- email-capture newsletter it feeds.
--
-- Both tables are write-allowed from the public API endpoints via the
-- service-role client (anonymous users of /crawlability need to
-- insert). Read access is staff-only via RLS.

-- ── 1. Crawlability checks ──
-- One row per public check. Stored primarily for abuse rate-limiting
-- (by IP / email) and to surface "most-checked domains this week" in
-- a future teaser on the homepage.
CREATE TABLE IF NOT EXISTS public.crawlability_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  email TEXT,
  ip_address TEXT,
  /** Full JSON report — one entry per bot with allowed / disallowed / partial. */
  results JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawlability_checks_domain
  ON public.crawlability_checks(domain);
CREATE INDEX IF NOT EXISTS idx_crawlability_checks_created_at
  ON public.crawlability_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawlability_checks_ip
  ON public.crawlability_checks(ip_address)
  WHERE ip_address IS NOT NULL;

COMMENT ON TABLE public.crawlability_checks IS
  'One row per public /crawlability check. Used for rate-limiting, '
  'analytics, and a future "popular domains this week" teaser.';

ALTER TABLE public.crawlability_checks ENABLE ROW LEVEL SECURITY;
-- No public SELECT/INSERT policies — writes go through the service-
-- role client from the API; reads are staff-only (service role).

-- ── 2. Newsletter subscribers ──
-- Simple double-opt-in list. `subscribed_at` is populated only after
-- the confirmation link is clicked; before that the row exists but
-- `subscribed_at` is NULL. `unsubscribed_at` records opt-out.
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'crawlability'
    CHECK (source IN ('crawlability', 'onboarding', 'agency', 'manual')),
  /** Secret token the confirmation email includes. HMAC-signed in app code; stored for lookup. */
  confirm_token TEXT,
  subscribed_at TIMESTAMP WITH TIME ZONE,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Lower-cased email is the logical identity — stored raw, but we
-- enforce uniqueness on `lower(email)` so Jane@HOWL.IE and
-- jane@howl.ie don't duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_email_lower
  ON public.newsletter_subscribers((lower(email)));
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_subscribed
  ON public.newsletter_subscribers(subscribed_at DESC)
  WHERE subscribed_at IS NOT NULL AND unsubscribed_at IS NULL;

COMMENT ON TABLE public.newsletter_subscribers IS
  'Double-opt-in newsletter list. Confirmation flow: insert row with '
  'confirm_token + NULL subscribed_at; email the signed confirm URL; '
  'on click, set subscribed_at and clear confirm_token. Unsubscribe '
  'sets unsubscribed_at.';

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
-- No public policies — the public /api/newsletter/* endpoints use
-- service role. Supabase default-deny keeps the table private.
