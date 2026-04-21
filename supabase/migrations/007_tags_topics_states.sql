-- ── Migration 007 — Tags, topics, prompt states, per-prompt country ──
-- Organisation layer on prompts and the dashboard filter surface. See
-- docs/peec-ai-competitive-review.md § Organisation and
-- docs/execution-plan.md Phase 3.
--
-- Changes:
-- 1. `topics` table — one topic per prompt, folder-style grouping with
--    per-project topic names. Drives the prompt-list hierarchy and
--    topic-level analytics.
-- 2. `tags` table + `prompt_tags` join — many tags per prompt, free-form
--    labels. Drives AND/OR filtering on the dashboard.
-- 3. Prompt state — upgrade the boolean `is_active` to a proper
--    TEXT CHECK enum: active / inactive / deleted. Backfills `inactive`
--    / `active` from existing data. Soft-delete semantics: inactive
--    prompts stop running but keep their history, deleted prompts are
--    tombstoned so runs/results/mentions clean up via cascade.
-- 4. Per-prompt country_code. Previously projects had country_codes[]
--    applied globally to every prompt; now each prompt can target a
--    specific market (IE/GB/US/EU/etc.). Backfills from the project's
--    first country code.
-- 5. topic_id foreign key on prompts (nullable — untagged prompts fall
--    into the "No Topic" bucket in the UI).

-- ── 1. Topics ──

CREATE TABLE IF NOT EXISTS public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Optional UI polish; matches the per-brand color pattern from migration 006.
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Topic names are unique within a project (can't have two "CRM Software"
-- folders in the same project). Case-insensitive via LOWER().
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_project_name_unique
  ON public.topics(project_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_topics_project_id ON public.topics(project_id);

COMMENT ON TABLE public.topics IS
  'Folder-style prompt grouping. One topic per prompt. Drives sidebar '
  'hierarchy, prompt suggestions, and topic-level aggregated metrics.';

-- ── 2. Tags ──

CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_project_name_unique
  ON public.tags(project_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_tags_project_id ON public.tags(project_id);

COMMENT ON TABLE public.tags IS
  'Free-form labels. Many tags per prompt. Drives AND/OR dashboard '
  'filters, CSV-upload columns, and batch actions.';

-- Many-to-many join; prompt <-> tag.
CREATE TABLE IF NOT EXISTS public.prompt_tags (
  prompt_id UUID NOT NULL REFERENCES public.prompts ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (prompt_id, tag_id)
);

-- Reverse lookup index — "all prompts with tag X".
CREATE INDEX IF NOT EXISTS idx_prompt_tags_tag_id
  ON public.prompt_tags(tag_id);

-- ── 3. Prompt state enum ──

ALTER TABLE public.prompts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'deleted'));

-- Backfill: anything currently is_active=false becomes 'inactive'.
UPDATE public.prompts
SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END
WHERE status = 'active' AND is_active = FALSE;

CREATE INDEX IF NOT EXISTS idx_prompts_status ON public.prompts(status);

COMMENT ON COLUMN public.prompts.status IS
  'Soft-state enum. "active" runs daily. "inactive" preserves history '
  'but stops running. "deleted" is a tombstone — rows remain until a '
  'cleanup job removes them + their linked results.';

-- NOTE: we keep the legacy `is_active` BOOLEAN column for back-compat
-- with existing queries. New code should prefer `status`. A follow-up
-- migration will drop `is_active` once callers have migrated.

-- ── 4. Per-prompt country_code ──

ALTER TABLE public.prompts
  ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Backfill from project's first country_code (country_codes[] is an
-- existing text[] on projects). Where a project has no country_codes,
-- default to 'IE' (this is CMO.ie, after all).
UPDATE public.prompts p
SET country_code = COALESCE(
  (SELECT pr.country_codes[1] FROM public.projects pr WHERE pr.id = p.project_id),
  'IE'
)
WHERE country_code IS NULL;

ALTER TABLE public.prompts
  ALTER COLUMN country_code SET NOT NULL,
  ALTER COLUMN country_code SET DEFAULT 'IE';

CREATE INDEX IF NOT EXISTS idx_prompts_country_code
  ON public.prompts(country_code);

COMMENT ON COLUMN public.prompts.country_code IS
  'ISO-3166 alpha-2 country code for geo-aware queries. Adapters use '
  'this as user_location where the provider supports it (OpenAI, '
  'Perplexity) and as market context in the prompt where not (Claude '
  'web_search for unsupported countries).';

-- ── 5. topic_id on prompts ──

ALTER TABLE public.prompts
  ADD COLUMN IF NOT EXISTS topic_id UUID
    REFERENCES public.topics ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prompts_topic_id
  ON public.prompts(topic_id);

COMMENT ON COLUMN public.prompts.topic_id IS
  'Optional. One topic per prompt. NULL = "No Topic" bucket in UI.';
