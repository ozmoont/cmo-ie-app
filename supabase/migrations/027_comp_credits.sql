-- ── Admin-grantable comp credits + trial extension ──
--
-- Adds three customer-grantable buckets to organisations so an
-- admin can extend an account's runway without touching Stripe:
--
--   • comp_seo_audits        — extra audits an org can run on top
--                              of their plan's monthly free quota.
--   • comp_brief_credits     — extra briefs likewise.
--   • trial_extended_to      — overrides trial_ends_at when later;
--                              lets us extend a trial without
--                              touching the original ends_at field
--                              (so we can audit the original window).
--
-- Plus three audit columns shared across all comps:
--   • comp_notes             — free-text reason for the grant.
--   • comp_granted_by        — auth.users.id of the granting admin.
--   • comp_granted_at        — when the most recent grant happened.
--
-- All comps DECREMENT to zero as they're consumed (audit /
-- brief credit logic — see lib/seo-audit/eligibility.ts +
-- lib/queries.consumeBriefCredit). When zero, the customer falls
-- back to whatever their plan offers.
--
-- The trial extension is a one-shot override (set the new ends_at,
-- the trial logic picks the later of (trial_ends_at, trial_extended_to)).

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS comp_seo_audits INTEGER NOT NULL DEFAULT 0
    CHECK (comp_seo_audits >= 0),
  ADD COLUMN IF NOT EXISTS comp_brief_credits INTEGER NOT NULL DEFAULT 0
    CHECK (comp_brief_credits >= 0),
  ADD COLUMN IF NOT EXISTS trial_extended_to TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comp_notes TEXT,
  ADD COLUMN IF NOT EXISTS comp_granted_by UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comp_granted_at TIMESTAMPTZ;

-- Cheap partial index — the admin "orgs with comps" filter on
-- /admin/orgs needs a fast scan over the small set with credits.
CREATE INDEX IF NOT EXISTS idx_organisations_has_comps
  ON public.organisations(comp_granted_at DESC)
  WHERE comp_seo_audits > 0
     OR comp_brief_credits > 0
     OR trial_extended_to IS NOT NULL;

COMMENT ON COLUMN public.organisations.comp_seo_audits IS
  'Admin-granted SEO audits on top of the plan quota. Decrements '
  'to zero as the customer consumes them.';

COMMENT ON COLUMN public.organisations.comp_brief_credits IS
  'Admin-granted brief credits on top of plan brief credits. '
  'Decrements to zero as briefs are generated.';

COMMENT ON COLUMN public.organisations.trial_extended_to IS
  'Audit log of the most recent trial extension granted by an admin. '
  'When an extension is applied, the admin grant API updates BOTH '
  'trial_ends_at (so existing display + paywall logic just works) '
  'AND trial_extended_to (so we can see the extension separately '
  'from the original trial window). NULL = no extension ever granted.';
