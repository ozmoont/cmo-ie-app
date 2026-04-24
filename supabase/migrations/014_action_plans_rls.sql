-- ── Migration 014 — RLS for action plan tables ──
-- Migrations 012 + 013 created action_plans / action_items / action_steps
-- but forgot to enable Row-Level Security and attach policies. Symptom:
--   1. POST /actions uses the service-role admin client to insert a shell
--      row with status='generating'. This succeeds (admin bypasses RLS).
--   2. User navigates away, then back. Page hydrates via GET /actions,
--      which uses the user-authed Supabase client.
--   3. Postgres default-denies the row because no SELECT policy exists,
--      so the user sees the empty "Get an action plan" state instead of
--      the in-progress indicator.
--
-- Fix: enable RLS and mirror the org-membership pattern used by projects /
-- competitors / prompts in migration 001. Access is gated on the caller
-- having a profile in the same org as the project the plan belongs to.
--
-- action_items and action_steps don't carry project_id directly — they
-- reach it through plan_id → project_id and item_id → plan_id → project_id
-- respectively, so their policies nest one or two sub-selects deep. That's
-- fine for the volumes we expect (a handful of plans per project) and it
-- matches how competitors / prompts are already policed.

-- ── action_plans ──────────────────────────────────────────────────

ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view action plans in their organisation"
  ON public.action_plans
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert action plans in their organisation"
  ON public.action_plans
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update action plans in their organisation"
  ON public.action_plans
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete action plans in their organisation"
  ON public.action_plans
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- ── action_items ──────────────────────────────────────────────────

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view action items in their organisation"
  ON public.action_items
  FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM public.action_plans
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE org_id IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can insert action items in their organisation"
  ON public.action_items
  FOR INSERT
  WITH CHECK (
    plan_id IN (
      SELECT id FROM public.action_plans
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE org_id IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can update action items in their organisation"
  ON public.action_items
  FOR UPDATE
  USING (
    plan_id IN (
      SELECT id FROM public.action_plans
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE org_id IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can delete action items in their organisation"
  ON public.action_items
  FOR DELETE
  USING (
    plan_id IN (
      SELECT id FROM public.action_plans
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE org_id IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

-- ── action_steps ──────────────────────────────────────────────────

ALTER TABLE public.action_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view action steps in their organisation"
  ON public.action_steps
  FOR SELECT
  USING (
    item_id IN (
      SELECT id FROM public.action_items
      WHERE plan_id IN (
        SELECT id FROM public.action_plans
        WHERE project_id IN (
          SELECT id FROM public.projects
          WHERE org_id IN (
            SELECT org_id FROM public.profiles WHERE id = auth.uid()
          )
        )
      )
    )
  );

CREATE POLICY "Users can insert action steps in their organisation"
  ON public.action_steps
  FOR INSERT
  WITH CHECK (
    item_id IN (
      SELECT id FROM public.action_items
      WHERE plan_id IN (
        SELECT id FROM public.action_plans
        WHERE project_id IN (
          SELECT id FROM public.projects
          WHERE org_id IN (
            SELECT org_id FROM public.profiles WHERE id = auth.uid()
          )
        )
      )
    )
  );

CREATE POLICY "Users can update action steps in their organisation"
  ON public.action_steps
  FOR UPDATE
  USING (
    item_id IN (
      SELECT id FROM public.action_items
      WHERE plan_id IN (
        SELECT id FROM public.action_plans
        WHERE project_id IN (
          SELECT id FROM public.projects
          WHERE org_id IN (
            SELECT org_id FROM public.profiles WHERE id = auth.uid()
          )
        )
      )
    )
  );

CREATE POLICY "Users can delete action steps in their organisation"
  ON public.action_steps
  FOR DELETE
  USING (
    item_id IN (
      SELECT id FROM public.action_items
      WHERE plan_id IN (
        SELECT id FROM public.action_plans
        WHERE project_id IN (
          SELECT id FROM public.projects
          WHERE org_id IN (
            SELECT org_id FROM public.profiles WHERE id = auth.uid()
          )
        )
      )
    )
  );
