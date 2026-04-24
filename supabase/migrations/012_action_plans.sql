-- ── Migration 012 — Persisted action plans ──
-- Before this migration, /api/projects/[id]/actions generated an
-- action plan on every click, returned it inline, and threw it away
-- as soon as the user navigated off the page. Every regeneration
-- cost Claude tokens and lost all user progress (marked-done steps,
-- notes, etc.).
--
-- This migration adds three normalised tables so action plans persist,
-- can be tracked per-step, and archive cleanly on regeneration instead
-- of being overwritten.
--
-- See docs/phase-2-scope.md § E (Actions v2) and the design proposal
-- in the 22 Apr 2026 product review discussion.

-- ── 1. action_plans ────────────────────────────────────────────────
-- One row per generated plan. At most one row per project has
-- superseded_at = NULL (the current plan). Regeneration archives the
-- previous current plan by setting superseded_at = now and inserts a
-- fresh row.

CREATE TABLE IF NOT EXISTS public.action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Who generated this plan. Nullable because the run engine + cron
  -- paths may generate plans without a specific user attributed.
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  tier TEXT NOT NULL CHECK (tier IN ('gaps', 'strategy', 'full')),
  model_version TEXT,
  -- Set to NOW() when a newer plan replaces this one. NULL = current.
  superseded_at TIMESTAMP WITH TIME ZONE,
  -- Raw Claude output kept for audit + re-parse escape hatch.
  raw_output JSONB
);

CREATE INDEX IF NOT EXISTS idx_action_plans_project_id
  ON public.action_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_action_plans_created_at
  ON public.action_plans(created_at DESC);
-- Partial index over the current plan per project. Makes the
-- "find my current plan" query a single-row lookup regardless of
-- how much history has accumulated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_action_plans_current_per_project
  ON public.action_plans(project_id)
  WHERE superseded_at IS NULL;

COMMENT ON TABLE public.action_plans IS
  'Generated action plans. At most one current (superseded_at IS NULL) '
  'row per project; older plans are archived with a timestamp so history '
  'is preserved rather than overwritten.';

-- ── 2. action_items ────────────────────────────────────────────────
-- One row per gap (usually per prompt). Carries the analyst's
-- interpretation — root cause, competitor advantage, opportunity type.

CREATE TABLE IF NOT EXISTS public.action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.action_plans ON DELETE CASCADE,
  -- Nullable: some items may be cross-prompt recommendations rather
  -- than tied to one specific tracked prompt.
  prompt_id UUID REFERENCES public.prompts ON DELETE SET NULL,
  prompt_text TEXT,
  root_cause TEXT,
  competitor_advantage TEXT,
  opportunity_type TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_items_plan_id
  ON public.action_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_action_items_prompt_id
  ON public.action_items(prompt_id);

-- ── 3. action_steps ────────────────────────────────────────────────
-- One row per concrete step the user can act on. This is where per-
-- step state lives (status, notes) so regeneration preserves progress.

CREATE TABLE IF NOT EXISTS public.action_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.action_items ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  effort TEXT NOT NULL CHECK (effort IN ('low', 'medium', 'high')),
  impact TEXT NOT NULL CHECK (impact IN ('low', 'medium', 'high')),
  category TEXT NOT NULL CHECK (category IN (
    'content', 'technical', 'outreach', 'brand'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'done', 'dismissed'
  )),
  user_notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_steps_item_id
  ON public.action_steps(item_id);
CREATE INDEX IF NOT EXISTS idx_action_steps_status
  ON public.action_steps(status);

COMMENT ON TABLE public.action_steps IS
  'Per-step state for action items. Survives plan regeneration — '
  'archiving a plan sets plan.superseded_at but leaves the step rows '
  'intact, so historical progress is preserved. updated_at is managed '
  'by the API layer (PATCH /steps/[id]) rather than a database trigger, '
  'since Supabase''s SQL editor struggles with dollar-quoted function '
  'bodies when pasted alongside other statements.';
