-- ── Phase 7a: Audit Council ──
--
-- Cross-model verification of every customer-facing artifact.
-- Three "senior auditor" instances (Claude, ChatGPT, Gemini) review
-- each generated plan in parallel; a Haiku chair synthesises their
-- verdicts. Customer-facing rendering is unchanged; the council is
-- visible only at /admin/audit-council for the CMO.ie ops team.
--
-- v1 ships in observation mode: nothing is auto-blocked, auto-alerted
-- or auto-regenerated. We collect data for 2-4 weeks, then decide
-- what to gate.
--
-- Source-of-truth design doc: docs/phase-7-audit-council.md

CREATE TABLE IF NOT EXISTS public.audit_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── What's being audited ─────────────────────────────────────
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'seo_audit', 'monthly_playbook', 'action_plan', 'brief',
    'brand_profile', 'prompt_batch'
  )),
  artifact_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  /* Nullable: org-level artifacts (e.g. monthly playbooks attached
     to the org, not a single project) leave this null. */
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,

  -- ── Council state ────────────────────────────────────────────
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'error')),
  /* TRUE if this review came in via sampling (vs full coverage).
     Lets us compare flag rates between sampled and fully-covered
     artifacts when tuning sampling rates later. */
  sampled BOOLEAN NOT NULL DEFAULT FALSE,

  -- ── Per-auditor reports ──────────────────────────────────────
  /* Stored as JSONB so we can iterate the rubric / structure without
     a migration each time. The shape is enforced at the lib layer
     (src/lib/audit-council/types.ts → AuditorReport). */
  claude_report JSONB,
  chatgpt_report JSONB,
  gemini_report JSONB,

  -- ── Chair synthesis ──────────────────────────────────────────
  chair_verdict TEXT
    CHECK (chair_verdict IN ('approve', 'approve_with_caveats', 'flag', 'fail')),
  chair_summary TEXT,
  /* 0-1; how much the auditors agreed on the verdict. NULL until
     chair runs. Computed in chair.ts as the share of auditors whose
     verdict matched the chair's final verdict. */
  agreement_score NUMERIC(3, 2),

  -- ── Telemetry ────────────────────────────────────────────────
  /* Sum across the three auditor calls + chair. Mirrors what
     ai_usage_events tracks per call, but denormalised here for
     dashboard convenience. */
  cost_usd NUMERIC(10, 4),
  duration_ms INTEGER,
  error_message TEXT,

  -- ── Ops decision ─────────────────────────────────────────────
  /* Set when an admin reviews the row in /admin/audit-council. */
  ops_decision TEXT
    CHECK (ops_decision IN ('approved', 'overridden', 'mark_regenerate')),
  ops_decision_at TIMESTAMP WITH TIME ZONE,
  ops_decision_by UUID REFERENCES auth.users(id),
  ops_notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- ── Indexes ──────────────────────────────────────────────────────

-- Resolve the review for a given artifact (admin drill-down lookup).
CREATE INDEX IF NOT EXISTS idx_audit_reviews_artifact
  ON public.audit_reviews(artifact_type, artifact_id);

-- "What's still in flight?" — drives the inbox's pending tab.
CREATE INDEX IF NOT EXISTS idx_audit_reviews_pending
  ON public.audit_reviews(status, created_at DESC)
  WHERE status IN ('pending', 'running');

-- Recent verdicts — drives the inbox's main feed + verdict filters.
CREATE INDEX IF NOT EXISTS idx_audit_reviews_verdict
  ON public.audit_reviews(chair_verdict, created_at DESC)
  WHERE chair_verdict IS NOT NULL;

-- Anything an admin still needs to look at — drives the
-- "Pending decision" tab and the inbox notification badge.
CREATE INDEX IF NOT EXISTS idx_audit_reviews_undecided
  ON public.audit_reviews(created_at DESC)
  WHERE chair_verdict IS NOT NULL AND ops_decision IS NULL;

-- Per-org filter for the inbox.
CREATE INDEX IF NOT EXISTS idx_audit_reviews_org
  ON public.audit_reviews(org_id, created_at DESC);

-- ── Comments (visible in Supabase Studio + pg_dump) ──────────────

COMMENT ON TABLE public.audit_reviews IS
  'Phase 7 — Audit Council. One row per customer-facing artifact '
  'that has been (or is being) reviewed by the cross-model audit '
  'pipeline. Customer never sees this; admin-only at /admin/audit-council.';

COMMENT ON COLUMN public.audit_reviews.artifact_type IS
  'Discriminator for which generated artifact this review covers. '
  'Combined with artifact_id, points to the source row in the '
  'matching domain table (seo_audits, monthly_playbooks, etc.).';

COMMENT ON COLUMN public.audit_reviews.sampled IS
  'TRUE if this review was triggered by the sampling rate (e.g. '
  '20%% of action plans + briefs). FALSE for 100%%-coverage artifacts.';

COMMENT ON COLUMN public.audit_reviews.chair_verdict IS
  'Final verdict the chair synthesiser produced. approve = no issues; '
  'approve_with_caveats = minor issues, ship anyway; flag = real issues '
  'an operator should look at; fail = critical issues, do not ship.';

COMMENT ON COLUMN public.audit_reviews.ops_decision IS
  'CMO.ie operator decision on the review. approved = the chair was '
  'right; overridden = ops disagreed with the chair; mark_regenerate '
  '= flag this row so we can find related reviews after fixing the '
  'underlying generator.';

-- ── RLS ──────────────────────────────────────────────────────────

ALTER TABLE public.audit_reviews ENABLE ROW LEVEL SECURITY;
-- No public policies. All access via service_role from /api/admin/*
-- routes that already gate via lib/admin-auth.requireAdmin.
