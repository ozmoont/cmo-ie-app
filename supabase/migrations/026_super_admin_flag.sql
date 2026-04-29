-- ── Phase 7 follow-up: DB-backed super-admin flag ──
--
-- Until now, CMO.ie super-admin access has been gated by the
-- CMO_ADMIN_EMAILS env var on Vercel. That worked for one or two
-- people but doesn't scale once we want to grant + revoke admin
-- access without a redeploy.
--
-- This migration adds a per-profile `is_super_admin` flag.
-- lib/admin-auth.ts checks the env list first (so the seed admin
-- can never lock themselves out, and so the very first admin login
-- works on a fresh DB) then falls back to this flag. New admins
-- are granted from /admin/admins by an existing admin.
--
-- Audit trail: granted_at + granted_by are kept on the row itself.
-- Revocation just flips the flag; we don't keep history beyond the
-- last grant. If we ever need full audit history we'd add a
-- super_admin_grants table — premature today.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS super_admin_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS super_admin_granted_by UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial index — almost every row has is_super_admin = false, so
-- the partial index keeps the read path tiny.
CREATE INDEX IF NOT EXISTS idx_profiles_super_admin
  ON public.profiles(is_super_admin)
  WHERE is_super_admin = TRUE;

COMMENT ON COLUMN public.profiles.is_super_admin IS
  'CMO.ie internal super-admin flag. TRUE grants access to /admin '
  'and the /api/admin/* surface. Granted via /admin/admins by an '
  'existing super-admin; the env var CMO_ADMIN_EMAILS continues to '
  'act as a bootstrap allow-list so the seed admin can never get '
  'locked out.';

COMMENT ON COLUMN public.profiles.super_admin_granted_at IS
  'When the flag was last flipped to TRUE. NULL on env-only admins.';

COMMENT ON COLUMN public.profiles.super_admin_granted_by IS
  'auth.users.id of the existing admin who granted the flag. NULL '
  'on env-only admins or on grants that pre-date this migration.';
