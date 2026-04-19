-- ── CMO.ie Initial Schema ──
-- Comprehensive schema for AI search visibility tracking system

-- ── Organisations ──
CREATE TABLE public.organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'pro', 'advanced')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organisations_slug ON public.organisations(slug);
CREATE INDEX idx_organisations_stripe_customer_id ON public.organisations(stripe_customer_id);
CREATE INDEX idx_organisations_plan ON public.organisations(plan);

-- ── Profiles ──
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organisations ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- ── Projects ──
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT,
  brand_name TEXT NOT NULL,
  country_codes TEXT[] DEFAULT ARRAY['IE'],
  models TEXT[] DEFAULT ARRAY['chatgpt', 'perplexity', 'google_aio'],
  is_pitch BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_org_id ON public.projects(org_id);
CREATE INDEX idx_projects_brand_name ON public.projects(brand_name);
CREATE INDEX idx_projects_created_at ON public.projects(created_at);

-- ── Competitors ──
CREATE TABLE public.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_competitors_project_id ON public.competitors(project_id);
CREATE INDEX idx_competitors_created_at ON public.competitors(created_at);

-- ── Prompts ──
CREATE TABLE public.prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  text TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('awareness', 'consideration', 'decision')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompts_project_id ON public.prompts(project_id);
CREATE INDEX idx_prompts_category ON public.prompts(category);
CREATE INDEX idx_prompts_is_active ON public.prompts(is_active);
CREATE INDEX idx_prompts_created_at ON public.prompts(created_at);

-- ── Daily Runs ──
CREATE TABLE public.daily_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  run_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_daily_runs_project_id ON public.daily_runs(project_id);
CREATE INDEX idx_daily_runs_run_date ON public.daily_runs(run_date);
CREATE INDEX idx_daily_runs_status ON public.daily_runs(status);
CREATE INDEX idx_daily_runs_created_at ON public.daily_runs(created_at);
CREATE UNIQUE INDEX idx_daily_runs_project_date ON public.daily_runs(project_id, run_date);

-- ── Results ──
CREATE TABLE public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.daily_runs ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES public.prompts ON DELETE CASCADE,
  model TEXT NOT NULL CHECK (model IN ('chatgpt', 'perplexity', 'google_aio', 'gemini', 'claude')),
  brand_mentioned BOOLEAN DEFAULT FALSE,
  mention_position INTEGER,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  response_snippet TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_results_run_id ON public.results(run_id);
CREATE INDEX idx_results_prompt_id ON public.results(prompt_id);
CREATE INDEX idx_results_model ON public.results(model);
CREATE INDEX idx_results_brand_mentioned ON public.results(brand_mentioned);
CREATE INDEX idx_results_sentiment ON public.results(sentiment);
CREATE INDEX idx_results_created_at ON public.results(created_at);

-- ── Citations ──
CREATE TABLE public.citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES public.results ON DELETE CASCADE,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  is_brand_domain BOOLEAN DEFAULT FALSE,
  is_competitor_domain BOOLEAN DEFAULT FALSE,
  position INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_citations_result_id ON public.citations(result_id);
CREATE INDEX idx_citations_domain ON public.citations(domain);
CREATE INDEX idx_citations_is_brand_domain ON public.citations(is_brand_domain);
CREATE INDEX idx_citations_is_competitor_domain ON public.citations(is_competitor_domain);
CREATE INDEX idx_citations_created_at ON public.citations(created_at);

-- ── Row Level Security (RLS) ──

-- Enable RLS on all tables
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citations ENABLE ROW LEVEL SECURITY;

-- Organisations: Users can only see their own org
CREATE POLICY "Users can view their own organisation"
  ON public.organisations
  FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Profiles: Users can view profiles in their org
CREATE POLICY "Users can view profiles in their organisation"
  ON public.profiles
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Profiles: Only auth system can insert/update profiles
CREATE POLICY "Profiles are managed by auth system"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid() OR auth.role() = 'authenticated');

-- Projects: Users can view projects in their org
CREATE POLICY "Users can view projects in their organisation"
  ON public.projects
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert projects in their organisation"
  ON public.projects
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their organisation's projects"
  ON public.projects
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Competitors: Users can view competitors for projects in their org
CREATE POLICY "Users can view competitors in their organisation"
  ON public.competitors
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert competitors in their organisation"
  ON public.competitors
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- Prompts: Users can view prompts for projects in their org
CREATE POLICY "Users can view prompts in their organisation"
  ON public.prompts
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert prompts in their organisation"
  ON public.prompts
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update prompts in their organisation"
  ON public.prompts
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete prompts in their organisation"
  ON public.prompts
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- Daily Runs: Users can view runs for projects in their org
CREATE POLICY "Users can view daily runs in their organisation"
  ON public.daily_runs
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert daily runs in their organisation"
  ON public.daily_runs
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE org_id IN (
        SELECT org_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- Results: Users can view results for projects in their org
CREATE POLICY "Users can view results in their organisation"
  ON public.results
  FOR SELECT
  USING (
    run_id IN (
      SELECT id FROM public.daily_runs
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE org_id IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can insert results in their organisation"
  ON public.results
  FOR INSERT
  WITH CHECK (
    run_id IN (
      SELECT id FROM public.daily_runs
      WHERE project_id IN (
        SELECT id FROM public.projects
        WHERE org_id IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

-- Citations: Users can view citations for projects in their org
CREATE POLICY "Users can view citations in their organisation"
  ON public.citations
  FOR SELECT
  USING (
    result_id IN (
      SELECT id FROM public.results
      WHERE run_id IN (
        SELECT id FROM public.daily_runs
        WHERE project_id IN (
          SELECT id FROM public.projects
          WHERE org_id IN (
            SELECT org_id FROM public.profiles WHERE id = auth.uid()
          )
        )
      )
    )
  );

CREATE POLICY "Users can insert citations in their organisation"
  ON public.citations
  FOR INSERT
  WITH CHECK (
    result_id IN (
      SELECT id FROM public.results
      WHERE run_id IN (
        SELECT id FROM public.daily_runs
        WHERE project_id IN (
          SELECT id FROM public.projects
          WHERE org_id IN (
            SELECT org_id FROM public.profiles WHERE id = auth.uid()
          )
        )
      )
    )
  );

-- ── Grants ──

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
