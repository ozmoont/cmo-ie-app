-- ── Migration 016 — Public REST API keys ──
-- Phase 3 workstream A. Powers /api/v1/* and the MCP server.
--
-- Design notes:
--   * Tokens are issued once, shown once. We store a SHA-256 hash + a
--     short prefix. The prefix is how we look up the row in O(1); the
--     hash is the constant-time-compared secret. No plaintext stored.
--   * Scopes are a TEXT[] so we can expand in v2/v3 without a schema
--     change. v1 scopes are documented in lib/api-auth.ts.
--   * Revocation is soft — we set revoked_at rather than deleting.
--     last_used_at and usage counters stay meaningful for audit.
--   * Row-level security: org members see their org's keys. Nothing
--     cross-org. Service role bypasses RLS for the actual auth lookup
--     on incoming requests (we can't use a user-authed client there —
--     the request *is* the auth attempt).

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations ON DELETE CASCADE,
  -- Human-readable label, e.g. "Looker integration" or "Local dev".
  name TEXT NOT NULL,
  -- SHA-256 hex digest of the full token. Never store plaintext.
  token_hash TEXT NOT NULL,
  -- First 8 chars of the plaintext. Used as the O(1) lookup key.
  -- Also shown in the UI as the "last time you saw it" hint.
  token_prefix TEXT NOT NULL,
  -- Scopes the token is allowed to request. See lib/api-auth.ts for
  -- the canonical list.
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- Nullable; NULL = never used.
  last_used_at TIMESTAMP WITH TIME ZONE,
  -- Nullable; NULL = active. Set to NOW() on revoke.
  revoked_at TIMESTAMP WITH TIME ZONE,
  -- Who created the key. Useful in an audit log when an agency
  -- owner wants to see which team member minted what.
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Prefix is unique across active keys, so the O(1) lookup never returns
-- two rows. Collisions on 8 random hex chars are astronomically rare,
-- but we enforce it anyway so a collision fails loud at issue time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_active_prefix
  ON public.api_keys(token_prefix)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_org_id
  ON public.api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_at
  ON public.api_keys(created_at DESC);

COMMENT ON TABLE public.api_keys IS
  'Public REST + MCP API keys. token_hash = sha256(plaintext); '
  'plaintext is shown to the user exactly once at creation. Prefix '
  'is the O(1) lookup key. Revocation is soft (revoked_at).';

-- ── RLS ───────────────────────────────────────────────────────────
-- Members of an org can see and manage their org's keys. There is no
-- cross-org read path. Auth lookups on inbound requests go through
-- the service-role client (lib/supabase/admin.ts), which bypasses RLS.

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their org's api keys"
  ON public.api_keys
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Members create api keys for their org"
  ON public.api_keys
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Members revoke api keys for their org"
  ON public.api_keys
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Explicit delete policy left off — revocation via `revoked_at` is
-- the intended flow. Service role can still delete for cleanup.
