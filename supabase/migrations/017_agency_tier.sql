-- ── Migration 017 — Agency tier + credit pool ──
-- Phase 3 workstream C. Adds an `agency` plan that pools brief credits
-- across every project the org owns, plus an optional per-project cap
-- so the agency owner can ring-fence a client's monthly spend.
--
-- Billing semantics (post-017):
--   trial / starter / pro / advanced      — one project, org-level credit counter.
--   agency                                  — many projects under one pool.
--                                            Per-project caps enforced before
--                                            pool draw-down.
--
-- The existing `brief_credits_used` / `brief_credits_reset_at` columns
-- are repurposed for the agency pool — same plumbing, different semantic.
-- We add `agency_credit_pool` to replace the PLAN_LIMITS.briefCredits
-- lookup for agency-plan orgs; for every other plan the pool column
-- stays zero and is ignored.

-- 1. Extend the plan CHECK constraint to include 'agency'.
ALTER TABLE public.organisations
  DROP CONSTRAINT IF EXISTS organisations_plan_check;

ALTER TABLE public.organisations
  ADD CONSTRAINT organisations_plan_check
  CHECK (plan IN ('trial', 'starter', 'pro', 'advanced', 'agency'));

-- 2. Agency pool size. Set by the Stripe webhook when an org moves to
--    the agency tier; otherwise zero and unused.
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS agency_credit_pool INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.organisations.agency_credit_pool IS
  'Monthly brief-credit pool size for agency-tier orgs. Zero for every '
  'other plan. Usage is tracked in `brief_credits_used` (shared column).';

-- 3. Per-project allocations table. One row per project that has a cap
--    (NULL / missing row = uncapped within the pool).
--
--    monthly_cap_used resets on the same schedule as the pool (30d
--    rolling from the org's brief_credits_reset_at). We keep the
--    counter here so the API can short-circuit when a client has hit
--    their cap without touching the org row.
CREATE TABLE IF NOT EXISTS public.project_credit_allocations (
  project_id UUID PRIMARY KEY
    REFERENCES public.projects(id) ON DELETE CASCADE,
  monthly_cap INTEGER,
  monthly_cap_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_credit_allocations_updated_at
  ON public.project_credit_allocations(updated_at DESC);

COMMENT ON TABLE public.project_credit_allocations IS
  'Optional per-project brief-credit cap for agency-tier orgs. Zero rows '
  'means every project draws uncapped from the pool. A cap of NULL is a '
  'defensive state that behaves identically to uncapped.';

-- 4. RLS. Members of the project's org can read their allocations;
--    owners/admins can update them. Service role bypasses RLS for the
--    billing webhook.
ALTER TABLE public.project_credit_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view allocations" ON public.project_credit_allocations;
CREATE POLICY "Members view allocations"
  ON public.project_credit_allocations
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Members upsert allocations" ON public.project_credit_allocations;
CREATE POLICY "Members upsert allocations"
  ON public.project_credit_allocations
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Members update allocations" ON public.project_credit_allocations;
CREATE POLICY "Members update allocations"
  ON public.project_credit_allocations
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Members delete allocations" ON public.project_credit_allocations;
CREATE POLICY "Members delete allocations"
  ON public.project_credit_allocations
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );
