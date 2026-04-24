/**
 * Agency roll-up — one row per project in an org with the small number
 * of metrics an agency owner needs at a glance: visibility %, gap
 * count, last-run date, 30-day sparkline.
 *
 * Aggregates in JS (per-agency volumes are small — 5-50 projects).
 * Single Supabase round-trip per metric bucket; the page calls this
 * helper once and renders the whole table without further lookups.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface AgencyRollupRow {
  project_id: string;
  project_name: string;
  brand_name: string;
  brand_display_name: string | null;
  website_url: string | null;
  /** ISO. null when the project's never been run. */
  last_run_at: string | null;
  /** 0..100; null when there are no results in the window. */
  visibility_30d: number | null;
  /** Number of open gap rows at domain scope in the last 30d. Zero-safe. */
  domain_gap_count: number;
  /** Per-day visibility for the last 14d, for the sparkline. */
  trend_14d: { date: string; visibility_pct: number }[];
}

export interface AgencyRollupResult {
  org_id: string;
  project_count: number;
  rows: AgencyRollupRow[];
}

export async function getAgencyRollup(
  supabase: SupabaseClient,
  orgId: string
): Promise<AgencyRollupResult> {
  // 1. Every project in the org.
  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, name, brand_name, brand_display_name, website_url, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .returns<
      {
        id: string;
        name: string;
        brand_name: string;
        brand_display_name: string | null;
        website_url: string | null;
        created_at: string;
      }[]
    >();
  if (projErr) {
    console.error("getAgencyRollup projects failed:", projErr);
    return { org_id: orgId, project_count: 0, rows: [] };
  }
  const projectRows = projects ?? [];
  if (projectRows.length === 0) {
    return { org_id: orgId, project_count: 0, rows: [] };
  }

  const projectIds = projectRows.map((p) => p.id);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // 2. Pull the 30-day results in one query, grouped later.
  const { data: results30 } = await supabase
    .from("results")
    .select("prompt_id, brand_mentioned, created_at, prompts!inner(project_id)")
    .in("prompts.project_id", projectIds)
    .gte("created_at", since30)
    .returns<
      {
        prompt_id: string;
        brand_mentioned: boolean;
        created_at: string;
        prompts: { project_id: string } | { project_id: string }[] | null;
      }[]
    >();

  // 3. Last run per project.
  const { data: lastRuns } = await supabase
    .from("daily_runs")
    .select("project_id, started_at, run_date, status")
    .in("project_id", projectIds)
    .order("started_at", { ascending: false })
    .returns<
      {
        project_id: string;
        started_at: string | null;
        run_date: string;
        status: string;
      }[]
    >();
  const lastRunByProject = new Map<string, string | null>();
  for (const r of lastRuns ?? []) {
    if (!lastRunByProject.has(r.project_id)) {
      lastRunByProject.set(r.project_id, r.started_at ?? r.run_date);
    }
  }

  // 4. Aggregate visibility per project + per-day for sparkline.
  interface Agg {
    mentioned: number;
    total: number;
    // date → { mentioned, total }
    trend: Map<string, { mentioned: number; total: number }>;
  }
  const agg = new Map<string, Agg>();
  for (const row of results30 ?? []) {
    const promptsRel = row.prompts;
    const projectId =
      (Array.isArray(promptsRel) ? promptsRel[0]?.project_id : promptsRel?.project_id) ?? null;
    if (!projectId) continue;
    const entry = agg.get(projectId) ?? {
      mentioned: 0,
      total: 0,
      trend: new Map(),
    };
    entry.total += 1;
    if (row.brand_mentioned) entry.mentioned += 1;
    // Trend only includes rows in the last 14d; drop older ones.
    if (row.created_at >= since14) {
      const day = row.created_at.slice(0, 10);
      const t = entry.trend.get(day) ?? { mentioned: 0, total: 0 };
      t.total += 1;
      if (row.brand_mentioned) t.mentioned += 1;
      entry.trend.set(day, t);
    }
    agg.set(projectId, entry);
  }

  // 5. Gap count per project (domain scope). We approximate using the
  //    result_brand_mentions → citations linkage: count distinct
  //    competitor-domain sources where the project's brand wasn't
  //    mentioned in the same chat. Exact Gap Score computation is
  //    expensive to fan out here; agency owners just need a
  //    directional number, so a simpler approximation is fine.
  const gapCountByProject = new Map<string, number>();
  for (const projectId of projectIds) gapCountByProject.set(projectId, 0);

  const { data: gapRows } = await supabase
    .from("citations")
    .select(
      "domain, is_competitor_domain, results!inner(brand_mentioned, prompts!inner(project_id))"
    )
    .eq("is_competitor_domain", true)
    .in("results.prompts.project_id", projectIds)
    .gte("results.created_at", since30)
    .returns<
      {
        domain: string;
        is_competitor_domain: boolean;
        results:
          | {
              brand_mentioned: boolean;
              prompts: { project_id: string } | { project_id: string }[] | null;
            }
          | {
              brand_mentioned: boolean;
              prompts: { project_id: string } | { project_id: string }[] | null;
            }[]
          | null;
      }[]
    >();

  // Distinct competitor-citing domains per project where brand was absent.
  const distinctByProject = new Map<string, Set<string>>();
  for (const row of gapRows ?? []) {
    const resRel = row.results;
    const resultObj = Array.isArray(resRel) ? resRel[0] : resRel;
    if (!resultObj) continue;
    if (resultObj.brand_mentioned) continue;
    const promptsRel = resultObj.prompts;
    const projectId =
      (Array.isArray(promptsRel) ? promptsRel[0]?.project_id : promptsRel?.project_id) ?? null;
    if (!projectId) continue;
    const set = distinctByProject.get(projectId) ?? new Set<string>();
    set.add(row.domain);
    distinctByProject.set(projectId, set);
  }
  for (const [projectId, set] of distinctByProject) {
    gapCountByProject.set(projectId, set.size);
  }

  // 6. Build response rows in the order projects were created.
  const rows: AgencyRollupRow[] = projectRows.map((p) => {
    const a = agg.get(p.id);
    const visibility =
      a && a.total > 0 ? Math.round((a.mentioned / a.total) * 100) : null;
    const trend: AgencyRollupRow["trend_14d"] = [];
    if (a) {
      const sorted = Array.from(a.trend.entries()).sort((x, y) =>
        x[0] < y[0] ? -1 : 1
      );
      for (const [date, t] of sorted) {
        trend.push({
          date,
          visibility_pct:
            t.total > 0 ? Math.round((t.mentioned / t.total) * 100) : 0,
        });
      }
    }
    return {
      project_id: p.id,
      project_name: p.name,
      brand_name: p.brand_name,
      brand_display_name: p.brand_display_name ?? null,
      website_url: p.website_url ?? null,
      last_run_at: lastRunByProject.get(p.id) ?? null,
      visibility_30d: visibility,
      domain_gap_count: gapCountByProject.get(p.id) ?? 0,
      trend_14d: trend,
    };
  });

  return {
    org_id: orgId,
    project_count: rows.length,
    rows,
  };
}
