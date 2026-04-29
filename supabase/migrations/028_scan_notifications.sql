-- ── Scan-completion email notifications ──
--
-- Two changes that together let us email customers (and log it) when
-- a daily run finishes:
--
--   1. profiles.notify_on_scan — per-user opt-in (default TRUE).
--      Settings page exposes a toggle so users can silence the
--      stream of emails when they prefer the dashboard view.
--
--   2. daily_runs.scan_email_sent_at — denormalised flag so we don't
--      double-send when the run-engine reruns its tail (rare but
--      possible during deploys). NULL = never sent; non-null = sent.
--
-- The actual send-event log lives in scan_email_log, keyed by
-- (run_id, profile_id) so a run can email multiple recipients
-- without conflicts. Useful for audit + bounce reconciliation later.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_on_scan BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.daily_runs
  ADD COLUMN IF NOT EXISTS scan_email_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.scan_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.daily_runs(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  /* Resend's id for the message — useful when reconciling bounces /
     opens / clicks via the webhook later. Nullable because we still
     log even if Resend errored or RESEND_API_KEY isn't set. */
  resend_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_email_log_run
  ON public.scan_email_log(run_id);
CREATE INDEX IF NOT EXISTS idx_scan_email_log_profile
  ON public.scan_email_log(profile_id, sent_at DESC);
-- Uniqueness so the dispatcher can't double-record the same
-- (run, recipient) pair on a re-trigger.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_email_log_run_profile
  ON public.scan_email_log(run_id, profile_id);

COMMENT ON COLUMN public.profiles.notify_on_scan IS
  'TRUE = email this user when a daily run on any of their org''s '
  'projects completes. Default TRUE so customers get the value of '
  'the run engine without opting in; toggle off in Settings.';

COMMENT ON COLUMN public.daily_runs.scan_email_sent_at IS
  'When the scan-completion email batch was dispatched for this '
  'run. NULL = never. Set by lib/email/scan-completion to make the '
  'send idempotent across run-engine reruns.';

COMMENT ON TABLE public.scan_email_log IS
  'One row per (run, recipient) email dispatch. Audit log for the '
  'scan-completion notification flow; consulted by the email '
  'dispatcher to skip already-sent recipients.';

ALTER TABLE public.scan_email_log ENABLE ROW LEVEL SECURITY;
-- No public policies — service-role-only access via the dispatcher.
