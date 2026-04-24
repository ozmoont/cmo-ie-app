-- ── Migration 020: AI usage events ──
-- Every call to an AI provider (run check, sentiment, action plan,
-- brief, brand extract, prompt suggest, classifier) writes a row here.
-- This is the single source of truth for the CMO.ie ops dashboard:
--   - daily managed-key spend (detect runaway bills)
--   - per-org spend (decide who to upsell / downgrade)
--   - per-provider breakdown (shift volume between providers)
--   - error rate (spot adapter regressions)
--
-- Writes are fire-and-forget from the callsite — we don't block the
-- user response path on a log insert. That means the table may
-- occasionally miss a row under load. Fine for ops-level tracking.
--
-- `byok = true` means the cost was billed to the customer's own
-- provider key, not ours. We still log the event (for usage
-- analytics) but exclude it from "managed spend" totals.
--
-- RLS: only service role. The ops dashboard API uses the admin client.

CREATE TABLE public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Attribution (all nullable so we can log internal / unattributed calls)
  org_id UUID REFERENCES public.organisations ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,

  -- What was called
  provider TEXT NOT NULL CHECK (
    provider IN (
      'anthropic', 'openai', 'perplexity', 'gemini', 'grok', 'copilot'
    )
  ),
  model TEXT NOT NULL,          -- actual model string, e.g. "claude-haiku-4-5-20251001"
  feature TEXT NOT NULL CHECK (
    feature IN (
      'run_check',        -- primary per-prompt visibility check
      'sentiment',        -- Claude-Haiku sentiment tag on a run result
      'action_plan',      -- analyst + strategist action plan call
      'brief',            -- content brief + draft generation
      'brand_extract',    -- site → brand profile extraction
      'prompt_suggest',   -- LLM-generated prompt suggestions
      'classifier',       -- domain / page-type classifier
      'playbook',         -- monthly playbook generator
      'other'
    )
  ),

  -- Cost
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS
    (COALESCE(input_tokens,0) + COALESCE(output_tokens,0)) STORED,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  byok BOOLEAN NOT NULL DEFAULT FALSE,

  -- Diagnostics
  duration_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_code TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_usage_events IS
  'Per-call AI provider usage + cost. Powers the /admin ops dashboard.';

-- Indexes tuned for the dashboard queries:
--   1. daily spend series:           WHERE created_at >= ... ORDER BY created_at
--   2. per-org aggregates:           WHERE org_id = ? AND created_at >= ...
--   3. per-provider spend:           WHERE provider = ? AND created_at >= ...
--   4. errors feed:                  WHERE success = false ORDER BY created_at DESC
CREATE INDEX idx_ai_usage_events_created_at
  ON public.ai_usage_events(created_at DESC);
CREATE INDEX idx_ai_usage_events_org_created
  ON public.ai_usage_events(org_id, created_at DESC)
  WHERE org_id IS NOT NULL;
CREATE INDEX idx_ai_usage_events_provider_created
  ON public.ai_usage_events(provider, created_at DESC);
CREATE INDEX idx_ai_usage_events_errors
  ON public.ai_usage_events(created_at DESC)
  WHERE success = FALSE;

-- RLS: service role only. The /api/admin/ops/* endpoints gate on
-- CMO_ADMIN_EMAILS in app code, then use the admin client to read.
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Block all non-service-role access. No policy = deny by default under
-- RLS; we add an explicit no-op comment so it's clear the silence is
-- intentional.
-- (The service role bypasses RLS entirely, which is what we want here.)
