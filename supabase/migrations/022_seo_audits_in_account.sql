-- ── Migration 022: SEO audits → in-account ──
-- Migration 021 set up seo_audits as a public-only product (anyone
-- with an email could buy a €49 audit). The product now also lives
-- inside a logged-in user's project, so paid plans can include free
-- audits without going through Stripe Checkout.
--
-- Three columns added:
--   - org_id:     which organisation owns this audit. NULL for
--                 anonymous public buyers (still supported).
--   - project_id: which project the audit ran against. NULL for
--                 public buyers (no project context). For in-account
--                 audits, scopes the audit to one project so the
--                 'past audits' tab on /projects/[id]/seo-audit
--                 filters cleanly.
--   - source:     'public_paid' (€49 from /seo-audit) | 'account_paid'
--                 (€49 from /projects/[id]/seo-audit, plan didn't
--                 include free) | 'account_included' (free from a
--                 plan with seoAuditsIncluded > 0). Powers the
--                 admin/cost dashboards and quota checks.
--
-- The org-scoped index supports the `getSeoAuditUsageThisMonth`
-- helper that drives the eligibility banner in the in-account tab.

ALTER TABLE public.seo_audits
  ADD COLUMN org_id UUID
    REFERENCES public.organisations ON DELETE SET NULL,
  ADD COLUMN project_id UUID
    REFERENCES public.projects ON DELETE SET NULL,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'public_paid'
    CHECK (source IN (
      'public_paid',       -- anonymous buyer at /seo-audit
      'account_paid',      -- logged-in user, plan exhausted/no quota
      'account_included'   -- logged-in user, plan included this audit
    ));

-- Backfill: existing rows pre-dating in-account flow are public_paid.
-- (Default already gives them 'public_paid'; explicit UPDATE not needed
-- because the column was added with DEFAULT.)

-- Indexes for the quota query: count completed audits per
-- (org_id, source, current month).
CREATE INDEX IF NOT EXISTS idx_seo_audits_org_month
  ON public.seo_audits(org_id, source, created_at DESC)
  WHERE org_id IS NOT NULL AND status = 'complete';

CREATE INDEX IF NOT EXISTS idx_seo_audits_project
  ON public.seo_audits(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN public.seo_audits.org_id IS
  'Owning organisation. NULL for public anonymous buyers.';
COMMENT ON COLUMN public.seo_audits.project_id IS
  'Project the audit ran against. NULL for public anonymous buyers.';
COMMENT ON COLUMN public.seo_audits.source IS
  'Funnel the audit came from. Drives quota checks + ops attribution.';
