-- ── Migration 013 — Action plan generation status ──
-- Extends action_plans with in-progress semantics so a user who
-- navigates away mid-generation comes back to a "still working"
-- indicator instead of the empty "no plan" state. Was causing users to
-- think generation had failed when it was just taking its normal
-- 30-60s.
--
-- Generation flow (post-013):
--   1. POST /actions starts: archive current plan, insert new row
--      with status='generating' + started_at=now(). This row becomes
--      the non-superseded "current" plan immediately.
--   2. Claude analyst + strategist run server-side.
--   3. On success: UPDATE status='complete'; insert items+steps.
--   4. On failure: UPDATE status='failed' with status_message.
--
-- If the Node process dies mid-generation, the row is left at
-- 'generating' indefinitely. The UI caps polling after ~5 min of
-- generating-status and shows a "looks stuck — regenerate?" prompt.

ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete'
    CHECK (status IN ('generating', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS status_message TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_action_plans_status
  ON public.action_plans(status);

COMMENT ON COLUMN public.action_plans.status IS
  'generating = Claude call in flight; complete = ready to view; '
  'failed = Claude errored, see status_message. Existing rows default '
  'to complete since they pre-date this column.';
