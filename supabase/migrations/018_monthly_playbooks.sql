-- ── Migration 018 — Monthly playbook emails ──
-- Phase 4 workstream B. One row per (project × month). Populated by the
-- scheduled generator on the 1st of each month; sent by the email
-- dispatcher when status flips to 'ready' or manually from the admin
-- preview. The playbook body is the Claude-generated markdown; the
-- subject line is derived at generation time so we don't need to
-- re-render on send.
--
-- Idempotency: (project_id, month) is unique. Re-running the generator
-- for the same month is a no-op unless we explicitly archive the
-- previous row (not something the UI exposes today).

CREATE TABLE IF NOT EXISTS public.monthly_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  -- First day of the calendar month this playbook covers. Stored as a
  -- date (not timestamp) so DST / timezone drift can't produce
  -- duplicate rows for the same conceptual month.
  month DATE NOT NULL,
  subject TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  -- Recipients snapshot at generation time. We capture the addresses
  -- here rather than resolving at send-time so a downstream email
  -- change doesn't reroute a historical playbook.
  recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'sent', 'failed')),
  status_message TEXT,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  -- Raw input bundle Claude saw — kept for audit + re-render if the
  -- Claude prompt changes and we want to diff outputs.
  raw_input JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_playbooks_project_month
  ON public.monthly_playbooks(project_id, month);

CREATE INDEX IF NOT EXISTS idx_monthly_playbooks_status
  ON public.monthly_playbooks(status);

CREATE INDEX IF NOT EXISTS idx_monthly_playbooks_generated_at
  ON public.monthly_playbooks(generated_at DESC);

COMMENT ON TABLE public.monthly_playbooks IS
  'End-of-month "your 3 moves this month" emails. One per project per '
  'calendar month. See lib/monthly-playbook.ts for generation.';

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.monthly_playbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view their org playbooks" ON public.monthly_playbooks;
CREATE POLICY "Members view their org playbooks"
  ON public.monthly_playbooks
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- Writes go through the service-role client from the cron + admin
-- routes. No user-level INSERT/UPDATE policy is needed — the admin
-- client bypasses RLS, and we don't want user-authored playbook
-- bodies.
