import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Project,
  Competitor,
  Prompt,
  DailyRun,
  Result,
  Citation,
  AIModel,
  Sentiment,
} from "@/lib/types";
import { MODEL_LABELS, PLAN_LIMITS } from "@/lib/types";

// ── Auth & Profile ──

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*, organisations(*)")
    .eq("id", userId)
    .single();
  return data;
}

// ── Projects ──

export async function getProjects() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as Project[];
}

export async function getProject(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  return data as Project | null;
}

export async function createProject(project: {
  org_id: string;
  name: string;
  brand_name: string;
  website_url?: string;
  country_codes: string[];
  models: AIModel[];
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert(project)
    .select()
    .single();
  if (error) throw error;
  return data as Project;
}

// ── Competitors ──

export async function getCompetitors(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitors")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? []) as Competitor[];
}

// ── Prompts ──

export async function getPrompts(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prompts")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Prompt[];
}

// ── Runs & Results ──

export async function getDailyRuns(projectId: string, limit = 14) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_runs")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "complete")
    .order("run_date", { ascending: false })
    .limit(limit);
  return (data ?? []) as DailyRun[];
}

export async function getResultsForRuns(runIds: string[]) {
  if (runIds.length === 0) return [] as Result[];
  const supabase = await createClient();
  const { data } = await supabase
    .from("results")
    .select("*")
    .in("run_id", runIds);
  return (data ?? []) as Result[];
}

// ── Computed Metrics ──

export function computeVisibilityScore(results: Result[]): number {
  if (results.length === 0) return 0;
  const mentioned = results.filter((r) => r.brand_mentioned).length;
  return Math.round((mentioned / results.length) * 100);
}

export function computeVisibilityTrend(
  runs: DailyRun[],
  results: Result[]
): { date: string; score: number }[] {
  return runs
    .map((run) => {
      const runResults = results.filter((r) => r.run_id === run.id);
      return {
        date: run.run_date,
        score: computeVisibilityScore(runResults),
      };
    })
    .reverse(); // oldest first for charting
}

export function computeModelScores(
  results: Result[],
  models: AIModel[]
): { model: AIModel; label: string; score: number }[] {
  return models.map((model) => {
    const modelResults = results.filter((r) => r.model === model);
    return {
      model,
      label: MODEL_LABELS[model],
      score: computeVisibilityScore(modelResults),
    };
  });
}

export function computePromptBreakdown(
  prompts: Prompt[],
  results: Result[]
): {
  prompt: string;
  promptId: string;
  category: string;
  score: number;
  modelsVisible: number;
  totalModels: number;
}[] {
  return prompts.map((prompt) => {
    const promptResults = results.filter((r) => r.prompt_id === prompt.id);
    const mentioned = promptResults.filter((r) => r.brand_mentioned).length;
    const total = promptResults.length;
    return {
      prompt: prompt.text,
      promptId: prompt.id,
      category: prompt.category,
      score: total > 0 ? Math.round((mentioned / total) * 100) : 0,
      modelsVisible: mentioned,
      totalModels: total,
    };
  });
}

// ── Citations ──

export async function getCitationsForResults(resultIds: string[]) {
  if (resultIds.length === 0) return [] as Citation[];
  const supabase = await createClient();
  const { data } = await supabase
    .from("citations")
    .select("*")
    .in("result_id", resultIds);
  return (data ?? []) as Citation[];
}

// ── Deep Analytics Computations ──

export function computeCitationDomains(
  citations: Citation[]
): {
  domain: string;
  count: number;
  isBrand: boolean;
  isCompetitor: boolean;
}[] {
  const domainMap = new Map<
    string,
    { count: number; isBrand: boolean; isCompetitor: boolean }
  >();
  for (const c of citations) {
    const existing = domainMap.get(c.domain);
    if (existing) {
      existing.count++;
      existing.isBrand = existing.isBrand || c.is_brand_domain;
      existing.isCompetitor = existing.isCompetitor || c.is_competitor_domain;
    } else {
      domainMap.set(c.domain, {
        count: 1,
        isBrand: c.is_brand_domain,
        isCompetitor: c.is_competitor_domain,
      });
    }
  }
  return Array.from(domainMap.entries())
    .map(([domain, data]) => ({ domain, ...data }))
    .sort((a, b) => b.count - a.count);
}

export function computeSentimentDistribution(
  results: Result[]
): { sentiment: string; count: number; percentage: number }[] {
  const sentiments: Sentiment[] = ["positive", "neutral", "negative"];
  const withSentiment = results.filter((r) => r.sentiment !== null);
  const total = withSentiment.length;
  return sentiments.map((s) => {
    const count = withSentiment.filter((r) => r.sentiment === s).length;
    return {
      sentiment: s,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

export function computeMentionPositions(
  results: Result[]
): { position: string; count: number; percentage: number }[] {
  const mentioned = results.filter(
    (r) => r.brand_mentioned && r.mention_position !== null
  );
  const total = mentioned.length;
  const positionBuckets = [
    { label: "1st", min: 1, max: 1 },
    { label: "2nd", min: 2, max: 2 },
    { label: "3rd", min: 3, max: 3 },
    { label: "4th+", min: 4, max: Infinity },
  ];
  return positionBuckets.map(({ label, min, max }) => {
    const count = mentioned.filter(
      (r) => r.mention_position! >= min && r.mention_position! <= max
    ).length;
    return {
      position: label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

export function computeCompetitorAppearances(
  citations: Citation[],
  competitors: Competitor[]
): { name: string; domain: string; appearances: number }[] {
  return competitors
    .map((comp) => {
      // Match citations where the domain contains the competitor's website domain
      const compDomain = comp.website_url
        ? new URL(
            comp.website_url.startsWith("http")
              ? comp.website_url
              : `https://${comp.website_url}`
          ).hostname.replace("www.", "")
        : null;
      const appearances = compDomain
        ? citations.filter((c) => c.domain.includes(compDomain)).length
        : citations.filter((c) => c.is_competitor_domain).length;
      return {
        name: comp.name,
        domain: compDomain ?? "unknown",
        appearances,
      };
    })
    .sort((a, b) => b.appearances - a.appearances);
}

/** Identify prompts where brand is invisible - used by the action layer */
export function computeVisibilityGaps(
  prompts: Prompt[],
  results: Result[],
  citations: Citation[],
  competitors: Competitor[]
): {
  promptId: string;
  promptText: string;
  category: string;
  score: number;
  competitorsCited: string[];
  topCitedDomains: string[];
  snippets: { model: string; snippet: string }[];
}[] {
  return prompts
    .map((prompt) => {
      const promptResults = results.filter((r) => r.prompt_id === prompt.id);
      const mentioned = promptResults.filter((r) => r.brand_mentioned).length;
      const total = promptResults.length;
      const score = total > 0 ? Math.round((mentioned / total) * 100) : 0;

      // Only include gaps (score < 50%)
      if (score >= 50) return null;

      // Find citations for these results
      const resultIds = new Set(promptResults.map((r) => r.id));
      const promptCitations = citations.filter((c) => resultIds.has(c.result_id));

      // Competitor domains cited
      const competitorsCited = new Set<string>();
      for (const c of promptCitations) {
        if (c.is_competitor_domain) {
          const comp = competitors.find((comp) => {
            if (!comp.website_url) return false;
            const compDomain = comp.website_url.replace(/^https?:\/\//, "").replace("www.", "");
            return c.domain.includes(compDomain);
          });
          if (comp) competitorsCited.add(comp.name);
        }
      }

      // Top cited domains
      const domainCounts = new Map<string, number>();
      for (const c of promptCitations) {
        domainCounts.set(c.domain, (domainCounts.get(c.domain) ?? 0) + 1);
      }
      const topCitedDomains = Array.from(domainCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([d]) => d);

      // Collect snippets
      const snippets = promptResults
        .filter((r) => r.response_snippet)
        .slice(0, 3)
        .map((r) => ({
          model: MODEL_LABELS[r.model] ?? r.model,
          snippet: r.response_snippet!,
        }));

      return {
        promptId: prompt.id,
        promptText: prompt.text,
        category: prompt.category,
        score,
        competitorsCited: Array.from(competitorsCited),
        topCitedDomains,
        snippets,
      };
    })
    .filter(Boolean) as NonNullable<ReturnType<typeof computeVisibilityGaps>[number]>[];
}

// ── Brief Credits ──

export async function getOrgBriefCredits(orgId: string) {
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organisations")
    .select(
      "brief_credits_used, brief_credits_reset_at, plan, agency_credit_pool, comp_brief_credits"
    )
    .eq("id", orgId)
    .single();

  if (!org) {
    throw new Error("Organisation not found");
  }

  const now = new Date();
  const resetAt = org.brief_credits_reset_at
    ? new Date(org.brief_credits_reset_at)
    : null;

  // Lazy reset: if reset_at has passed, reset the org-level counter
  // AND every project_credit_allocations.monthly_cap_used counter
  // under this org. Agency pools roll the pool + per-project counters
  // together so accounting stays consistent.
  let used = org.brief_credits_used;
  let nextResetAt = resetAt;

  if (!resetAt || resetAt < now) {
    const admin = createAdminClient();
    const newResetAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { error } = await admin
      .from("organisations")
      .update({
        brief_credits_used: 0,
        brief_credits_reset_at: newResetAt.toISOString(),
      })
      .eq("id", orgId);

    if (!error) {
      used = 0;
      nextResetAt = newResetAt;
      // For agency plans, also reset per-project caps. We scope via
      // project_id IN (SELECT id FROM projects WHERE org_id = ?) so
      // cross-org rows can't be touched. Failures are logged but
      // non-fatal — the pool reset already succeeded.
      if (org.plan === "agency") {
        const { data: projectIds } = await admin
          .from("projects")
          .select("id")
          .eq("org_id", orgId);
        const ids = (projectIds ?? []).map((p) => p.id as string);
        if (ids.length > 0) {
          const { error: capErr } = await admin
            .from("project_credit_allocations")
            .update({
              monthly_cap_used: 0,
              updated_at: new Date().toISOString(),
            })
            .in("project_id", ids);
          if (capErr) {
            console.error(
              "Failed to reset project_credit_allocations on rollover:",
              capErr
            );
          }
        }
      }
    } else {
      console.error("Failed to reset brief credits:", error);
    }
  }

  // Agency plans take their limit from agency_credit_pool; everyone
  // else uses the PLAN_LIMITS constant.
  const limit =
    org.plan === "agency"
      ? org.agency_credit_pool
      : PLAN_LIMITS[org.plan as keyof typeof PLAN_LIMITS].briefCredits;
  const planRemaining =
    limit === Infinity ? Infinity : Math.max(0, limit - used);

  // Admin-granted comps (migration 027) sit on top of the plan
  // remaining. The total is what the UI / gating logic should use;
  // we keep the plan-only number around so admins can see the
  // breakdown.
  const compRemaining = Math.max(0, org.comp_brief_credits ?? 0);
  const remaining =
    planRemaining === Infinity ? Infinity : planRemaining + compRemaining;

  return {
    used,
    limit,
    remaining,
    plan_remaining: planRemaining,
    comp_remaining: compRemaining,
    resetAt: nextResetAt?.toISOString() ?? null,
    plan: org.plan as "trial" | "starter" | "pro" | "advanced" | "agency",
    is_pool: org.plan === "agency",
  };
}

/**
 * Per-project brief credit status. For non-agency plans we defer to
 * the org-level counter (every project in a single-project plan draws
 * from the same counter anyway). For agency plans we additionally
 * check the per-project `monthly_cap` from project_credit_allocations.
 *
 * Returns the *effective* remaining — min(project_cap_remaining, pool_remaining).
 * A caller must still respect both individually if they want per-counter
 * metrics for display; the combined number is for gating.
 */
export async function getProjectBriefCredits(projectId: string) {
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle<{ org_id: string }>();
  if (!project?.org_id) {
    throw new Error("Project not found");
  }

  const poolState = await getOrgBriefCredits(project.org_id);
  if (poolState.plan !== "agency") {
    return {
      ...poolState,
      project_cap: null as number | null,
      project_cap_used: 0,
      project_cap_remaining:
        poolState.remaining === Infinity ? Infinity : poolState.remaining,
      effective_remaining: poolState.remaining,
    };
  }

  // Agency plan: look up the per-project allocation, default to
  // uncapped when no row exists.
  const { data: alloc } = await supabase
    .from("project_credit_allocations")
    .select("monthly_cap, monthly_cap_used")
    .eq("project_id", projectId)
    .maybeSingle<{ monthly_cap: number | null; monthly_cap_used: number }>();
  const cap = alloc?.monthly_cap ?? null;
  const capUsed = alloc?.monthly_cap_used ?? 0;
  const capRemaining =
    cap === null || cap === undefined
      ? Infinity
      : Math.max(0, cap - capUsed);

  const effective =
    poolState.remaining === Infinity
      ? capRemaining
      : capRemaining === Infinity
        ? poolState.remaining
        : Math.min(capRemaining, poolState.remaining);

  return {
    ...poolState,
    project_cap: cap,
    project_cap_used: capUsed,
    project_cap_remaining: capRemaining,
    effective_remaining: effective,
  };
}

/**
 * Consume one brief credit for a given project. Bumps the org pool
 * counter and, when agency-tier and a per-project cap exists, the
 * project's cap counter too. Uses the admin client — callers have
 * already authorised the action at the API layer.
 *
 * Does NOT re-check remaining — the caller should have done that via
 * getProjectBriefCredits right before generating the brief. This is
 * the commit half of a check-then-commit pattern; the race window is
 * small enough that over-drawing by one credit in a worst case is
 * acceptable given the cost of over-engineering a transactional path.
 */
export async function consumeBriefCredit(projectId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle<{ org_id: string }>();
  if (!project?.org_id) return;

  // Bump org-level counter. We fetch-then-update rather than using an
  // RPC — Supabase's typed RPC API requires codegen we don't have
  // wired, and the tiny race window (concurrent brief creations on
  // the same org) is acceptable per the docstring.
  //
  // Admin-granted comp_brief_credits (migration 027) consume FIRST.
  // Only when comps are exhausted do we tick the plan's
  // brief_credits_used counter — that way an admin grant always
  // extends runway rather than burning the plan quota.
  const { data: org } = await admin
    .from("organisations")
    .select("brief_credits_used, plan, comp_brief_credits")
    .eq("id", project.org_id)
    .maybeSingle<{
      brief_credits_used: number;
      plan: string;
      comp_brief_credits: number | null;
    }>();
  if (org) {
    const compRemaining = Math.max(0, org.comp_brief_credits ?? 0);
    if (compRemaining > 0) {
      await admin
        .from("organisations")
        .update({ comp_brief_credits: compRemaining - 1 })
        .eq("id", project.org_id);
    } else {
      await admin
        .from("organisations")
        .update({ brief_credits_used: (org.brief_credits_used ?? 0) + 1 })
        .eq("id", project.org_id);
    }
  }

  // For agency-tier orgs, also bump the per-project counter IF a row
  // exists. We upsert the row if absent but with monthly_cap null so
  // behaviour stays identical to "no cap recorded".
  if (org?.plan === "agency") {
    const { data: existing } = await admin
      .from("project_credit_allocations")
      .select("monthly_cap, monthly_cap_used")
      .eq("project_id", projectId)
      .maybeSingle<{ monthly_cap: number | null; monthly_cap_used: number }>();
    if (existing) {
      await admin
        .from("project_credit_allocations")
        .update({
          monthly_cap_used: (existing.monthly_cap_used ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", projectId);
    } else {
      await admin.from("project_credit_allocations").insert({
        project_id: projectId,
        monthly_cap: null,
        monthly_cap_used: 1,
      });
    }
  }
}
