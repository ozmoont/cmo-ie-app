-- ── Migration 021: Skills + SEO audits ──
-- Adds the data layer for paid AI-generated services on top of the
-- main visibility tracker. The first one is a €49 SEO audit, but the
-- structure is generic so we can add more skill-driven products
-- (PPC audit, content audit, social audit) without re-architecting.
--
-- Concepts:
--   - skills: catalogue of installed skills (one row per kind, e.g. 'seo-audit')
--   - skill_versions: every uploaded version of a skill's content
--                     (the SKILL.md body, the plugin.json metadata, the
--                     reference docs). Most-recent active row drives
--                     report generation.
--   - skill_learnings: observations the audit pipeline surfaces while
--                      running. Stay 'pending' until an admin reviews
--                      and either accepts (creates a new skill_version
--                      with the diff applied) or rejects.
--   - seo_audits: one row per paid audit. Linked to a Stripe payment_intent
--                 and the skill_version that produced it (so we can A/B
--                 future rev quality vs older revs).
--
-- All four tables are admin-only via RLS — public access goes through
-- API routes that use the admin client + token-based auth (the audit
-- viewer route uses a long unguessable id).

-- ── 1. skills ────────────────────────────────────────────────────
CREATE TABLE public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- URL-safe slug. Only one row per slug. Examples: 'seo-audit', 'ppc-audit'.
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,49}$'),
  name TEXT NOT NULL,
  description TEXT,
  -- Public price in EUR cents. NULL = no public price (internal-only).
  -- We don't store Stripe price_id here because prices change; the
  -- Stripe price IDs live in NEXT_PUBLIC_STRIPE_PRICE_<NAME> env vars
  -- and the audit route reads them at runtime.
  price_eur_cents INTEGER,
  -- Which version is the live one. Updated when admin promotes a new
  -- version after reviewing learnings.
  current_version_id UUID,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skills_status ON public.skills(status);

COMMENT ON TABLE public.skills IS
  'Catalogue of paid AI services on top of CMO.ie. One row per skill kind.';

-- ── 2. skill_versions ────────────────────────────────────────────
-- The actual skill content lives here. Each version is immutable —
-- new uploads or auto-promoted learnings produce a NEW version row,
-- the previous one stays for audit-trail and so old audits stay
-- reproducible.
CREATE TABLE public.skill_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.skills ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  -- The SKILL.md body. The text Claude sees as a system prompt.
  skill_md TEXT NOT NULL,
  -- The plugin.json metadata, parsed from the upload. Optional —
  -- single-file skills can omit this.
  plugin_metadata JSONB,
  -- Reference files included with the upload (AGENT_SDK_INTEGRATION.md,
  -- README.md, anything else). Stored as { filename: content }.
  -- Bounded — large reference docs get truncated to 50k chars.
  reference_files JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Free-form notes on what changed vs the previous version. Filled
  -- in by the admin on accept-learnings flows.
  changelog TEXT,
  -- When was this row created. The skill's "current" version is
  -- driven by skills.current_version_id, NOT by max(version_number).
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Who created it. NULL for system-generated (auto-promoted).
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  -- Where it came from: 'upload' (admin upload), 'learning' (
  -- promoted from skill_learnings), 'edit' (in-place admin edit).
  source TEXT NOT NULL DEFAULT 'upload'
    CHECK (source IN ('upload', 'learning', 'edit')),

  UNIQUE (skill_id, version_number)
);

CREATE INDEX idx_skill_versions_skill ON public.skill_versions(skill_id, version_number DESC);

COMMENT ON TABLE public.skill_versions IS
  'Immutable history of skill content. skills.current_version_id picks the live one.';

-- Now wire the FK from skills.current_version_id back to skill_versions.
-- We couldn't do this inline because of the cyclic dependency; both
-- tables had to exist first.
ALTER TABLE public.skills
  ADD CONSTRAINT skills_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES public.skill_versions ON DELETE SET NULL;

-- ── 3. skill_learnings ────────────────────────────────────────────
-- Observations from each audit run that aren't yet captured in the
-- skill. Stay 'pending' until reviewed. Accepted learnings get folded
-- into a new skill_version with source='learning'.
CREATE TABLE public.skill_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.skills ON DELETE CASCADE,
  -- Which version was active when this learning was observed.
  -- Helps the admin decide whether the learning is still novel given
  -- the skill may have been updated since.
  observed_against_version_id UUID
    REFERENCES public.skill_versions ON DELETE SET NULL,
  -- Which audit run produced this. Lets us cite an evidence trail
  -- when reviewing.
  source_audit_id UUID,  -- FK added below after seo_audits exists
  -- The pattern Claude observed. Plain text, expected to be 1-3 sentences.
  observation TEXT NOT NULL,
  -- Where in the skill content the admin would add this. Suggested
  -- by the observer pass (e.g. "## Best Practices 2026 → new bullet").
  suggested_location TEXT,
  -- Optional: a complete proposed insertion the admin can accept verbatim.
  suggested_diff TEXT,
  -- Cite evidence: a URL, log, or other artefact. Often the audited
  -- site itself.
  evidence_url TEXT,
  -- 0-1 model self-rated confidence. Drops below 0.5 → ignored
  -- in any auto-promote flow we add later.
  confidence NUMERIC(3, 2)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'duplicate')),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES auth.users ON DELETE SET NULL,
  review_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skill_learnings_pending
  ON public.skill_learnings(skill_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX idx_skill_learnings_audit
  ON public.skill_learnings(source_audit_id);

COMMENT ON TABLE public.skill_learnings IS
  'Observations from audit runs queued for admin review. '
  'Accepted learnings produce new skill_versions.';

-- ── 4. seo_audits ────────────────────────────────────────────────
-- One row per paid audit. The €49 transactional product. Lives at
-- /seo-audit/[id] for the customer; /admin/skills/audits for ops.
CREATE TABLE public.seo_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Customer email captured at checkout. Always populated even for
  -- signed-in customers because Stripe carries the auth-of-record.
  customer_email TEXT NOT NULL,
  -- The site to audit. Validated + canonicalised before insert.
  site_url TEXT NOT NULL,
  -- Stripe references. payment_intent_id is the immutable ref;
  -- checkout_session_id is for fraud-trail.
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT,
  -- Which skill version produced this audit. Lets us trace report
  -- quality back to a specific skill rev.
  skill_version_id UUID REFERENCES public.skill_versions ON DELETE SET NULL,
  -- Lifecycle. 'paid' = customer paid, generation will start; 'generating'
  -- = Claude is running; 'complete' = report saved; 'failed' = exception.
  -- 'unavailable' = site couldn't be crawled (the skill's documented error path).
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'generating', 'complete', 'failed', 'unavailable')),
  -- The full markdown report. Populated when status='complete'.
  report_markdown TEXT,
  -- The structured JSON summary the skill emits. Schema:
  -- { seo_health_score, top_3_priorities, ai_resilience_score, ... }
  report_summary JSONB,
  -- Failure reason for status='failed' or 'unavailable'.
  error_message TEXT,
  -- When the customer requested an implementation quote. NULL until
  -- they click the "Send to Howl" CTA.
  quote_requested_at TIMESTAMP WITH TIME ZONE,
  -- Random-looking access token for the public report URL. We use
  -- the row id directly (UUIDs are unguessable) — no separate token
  -- column needed. Listed here as documentation only.
  generated_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seo_audits_email ON public.seo_audits(LOWER(customer_email));
CREATE INDEX idx_seo_audits_status ON public.seo_audits(status, created_at DESC);
CREATE INDEX idx_seo_audits_payment ON public.seo_audits(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON TABLE public.seo_audits IS
  'Paid SEO audits. One row per €49 purchase. Public viewer at /seo-audit/{id}.';

-- Wire the FK from skill_learnings.source_audit_id now that seo_audits exists.
ALTER TABLE public.skill_learnings
  ADD CONSTRAINT skill_learnings_audit_fk
  FOREIGN KEY (source_audit_id)
  REFERENCES public.seo_audits ON DELETE SET NULL;

-- ── 5. RLS — service role only ────────────────────────────────────
-- All four tables are admin-only. The /seo-audit/[id] public viewer
-- route uses the admin client (with id-based access — UUIDs are
-- unguessable enough as access tokens at this scale).
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_audits ENABLE ROW LEVEL SECURITY;
-- No policies = deny by default. Service role bypasses RLS, which
-- is what the API routes use.
