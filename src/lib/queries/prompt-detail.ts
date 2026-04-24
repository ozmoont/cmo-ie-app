/**
 * Per-prompt detail queries — one prompt's visibility arc over time
 * across every model it's been checked against.
 *
 * Powers /projects/[id]/prompts/[promptId]. Everything else on the
 * dashboard aggregates *up* (project → prompt set → runs → results);
 * this file aggregates *down* to a single prompt so the user can
 * understand the ebb and flow of one specific question.
 *
 * Design notes:
 *   - We keep the entire history (bounded by `limitDays`, default 90)
 *     in a single query and aggregate in JS. Per-prompt result counts
 *     are small (< 500 rows for a year of daily runs across 5 models).
 *   - The shape is opinionated toward UI consumption: per-run rows for
 *     the timeline, a single trend series for the chart, and pre-grouped
 *     sources / brands so the page renders with no extra joins.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIModel, Sentiment } from "@/lib/types";
import { canonicaliseDomain } from "@/lib/classifiers/types";

export interface PromptDetailResult {
  run_id: string;
  result_id: string;
  created_at: string;
  model: AIModel;
  model_version: string | null;
  brand_mentioned: boolean;
  mention_position: number | null;
  sentiment: Sentiment | null;
  response_snippet: string | null;
}

export interface PromptDetailSource {
  domain: string;
  total_citations: number;
  inline_citations: number;
  /** First time we recorded a citation from this domain in the window. */
  first_seen: string;
  last_seen: string;
  is_brand_domain: boolean;
  is_competitor_domain: boolean;
}

export interface PromptDetailBrand {
  brand_name: string;
  mentions: number;
  competitor_id: string | null;
  is_tracked_brand: boolean;
  /** Best (lowest) position recorded for this brand on this prompt. */
  best_position: number | null;
}

export interface PromptDetailTrendPoint {
  date: string; // ISO yyyy-mm-dd (local to the run)
  mentioned: number;
  total: number;
  visibility_pct: number;
}

export interface PromptDetail {
  prompt: {
    id: string;
    text: string;
    project_id: string;
    category: string;
    status: string;
    country_code: string | null;
    topic_id: string | null;
    created_at: string;
  };
  window_start: string;
  window_end: string;
  total_runs: number;
  total_mentions: number;
  /** 0-100. Project-level visibility limited to this one prompt. */
  visibility_pct: number;
  /** Most recent check per model, newest first. */
  latest_per_model: PromptDetailResult[];
  /** Every check on this prompt within the window (capped at 200). */
  results: PromptDetailResult[];
  /** 7-day rolling visibility. */
  trend: PromptDetailTrendPoint[];
  sources: PromptDetailSource[];
  brands: PromptDetailBrand[];
}

interface PromptResultRow {
  id: string;
  run_id: string;
  prompt_id: string;
  model: string;
  model_version: string | null;
  brand_mentioned: boolean;
  mention_position: number | null;
  sentiment: string | null;
  response_snippet: string | null;
  created_at: string;
}

interface PromptCitationRow {
  result_id: string;
  url: string;
  domain: string;
  was_cited_inline: boolean;
  results: { created_at: string } | null;
}

interface PromptBrandRow {
  result_id: string;
  brand_name: string;
  competitor_id: string | null;
  is_tracked_brand: boolean;
  position: number;
}

export async function getPromptDetail(
  supabase: SupabaseClient,
  projectId: string,
  promptId: string,
  opts: { limitDays?: number } = {}
): Promise<PromptDetail | null> {
  const limitDays = opts.limitDays ?? 90;
  const windowStart = new Date(
    Date.now() - limitDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const windowEnd = new Date().toISOString();

  // 1. The prompt itself.
  const { data: prompt, error: promptErr } = await supabase
    .from("prompts")
    .select(
      "id, text, project_id, category, status, country_code, topic_id, created_at"
    )
    .eq("id", promptId)
    .eq("project_id", projectId)
    .maybeSingle<PromptDetail["prompt"]>();
  if (promptErr) {
    console.error("getPromptDetail prompt lookup failed:", promptErr);
    return null;
  }
  if (!prompt) return null;

  // 2. Project / competitor domains for source flagging.
  const [projectRes, competitorsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("brand_domains")
      .eq("id", projectId)
      .maybeSingle<{ brand_domains: string[] | null }>(),
    supabase
      .from("competitors")
      .select("display_name, name, domains")
      .eq("project_id", projectId),
  ]);
  const brandDomains = new Set(
    (projectRes.data?.brand_domains ?? [])
      .map(canonicaliseDomain)
      .filter(Boolean)
  );
  const competitorDomains = new Set<string>();
  for (const c of competitorsRes.data ?? []) {
    for (const d of c.domains ?? []) {
      const cd = canonicaliseDomain(d);
      if (cd) competitorDomains.add(cd);
    }
  }

  // 3. Results for this prompt (newest first).
  const { data: resultsRaw, error: resErr } = await supabase
    .from("results")
    .select(
      "id, run_id, prompt_id, model, model_version, brand_mentioned, mention_position, sentiment, response_snippet, created_at"
    )
    .eq("prompt_id", promptId)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(500);
  if (resErr) {
    console.error("getPromptDetail results lookup failed:", resErr);
    return {
      prompt,
      window_start: windowStart,
      window_end: windowEnd,
      total_runs: 0,
      total_mentions: 0,
      visibility_pct: 0,
      latest_per_model: [],
      results: [],
      trend: [],
      sources: [],
      brands: [],
    };
  }

  const results: PromptDetailResult[] = (resultsRaw ?? []).map(
    (r: PromptResultRow) => ({
      run_id: r.run_id,
      result_id: r.id,
      created_at: r.created_at,
      model: r.model as AIModel,
      model_version: r.model_version,
      brand_mentioned: r.brand_mentioned,
      mention_position: r.mention_position,
      sentiment: r.sentiment as Sentiment | null,
      response_snippet: r.response_snippet,
    })
  );

  const resultIds = results.map((r) => r.result_id);

  // 4. Citations + brand-mentions for those results (parallel).
  const [citationsRes, brandsRes] = await Promise.all([
    resultIds.length > 0
      ? supabase
          .from("citations")
          .select(
            "result_id, url, domain, was_cited_inline, results!inner(created_at)"
          )
          .in("result_id", resultIds)
          .returns<PromptCitationRow[]>()
      : Promise.resolve({ data: [] as PromptCitationRow[] }),
    resultIds.length > 0
      ? supabase
          .from("result_brand_mentions")
          .select("result_id, brand_name, competitor_id, is_tracked_brand, position")
          .in("result_id", resultIds)
          .returns<PromptBrandRow[]>()
      : Promise.resolve({ data: [] as PromptBrandRow[] }),
  ]);

  const citationRows = (citationsRes.data ?? []) as PromptCitationRow[];
  const brandRows = (brandsRes.data ?? []) as PromptBrandRow[];

  // 5. Aggregate sources.
  const bySource = new Map<
    string,
    {
      total: number;
      inline: number;
      first: string;
      last: string;
    }
  >();
  for (const c of citationRows) {
    const dom = canonicaliseDomain(c.domain ?? "");
    if (!dom) continue;
    const created =
      c.results?.created_at ?? new Date().toISOString();
    const existing = bySource.get(dom) ?? {
      total: 0,
      inline: 0,
      first: created,
      last: created,
    };
    existing.total += 1;
    if (c.was_cited_inline) existing.inline += 1;
    if (created < existing.first) existing.first = created;
    if (created > existing.last) existing.last = created;
    bySource.set(dom, existing);
  }
  const sources: PromptDetailSource[] = Array.from(bySource.entries())
    .map(([domain, agg]) => ({
      domain,
      total_citations: agg.total,
      inline_citations: agg.inline,
      first_seen: agg.first,
      last_seen: agg.last,
      is_brand_domain: brandDomains.has(domain),
      is_competitor_domain: competitorDomains.has(domain),
    }))
    .sort((a, b) => b.total_citations - a.total_citations);

  // 6. Aggregate brands named.
  const byBrand = new Map<
    string,
    {
      brand_name: string;
      mentions: number;
      competitor_id: string | null;
      is_tracked_brand: boolean;
      best_position: number | null;
    }
  >();
  for (const b of brandRows) {
    const key = b.brand_name.toLowerCase();
    const existing = byBrand.get(key) ?? {
      brand_name: b.brand_name,
      mentions: 0,
      competitor_id: b.competitor_id,
      is_tracked_brand: b.is_tracked_brand,
      best_position: null,
    };
    existing.mentions += 1;
    if (
      existing.best_position === null ||
      (b.position && b.position < existing.best_position)
    ) {
      existing.best_position = b.position;
    }
    byBrand.set(key, existing);
  }
  const brands: PromptDetailBrand[] = Array.from(byBrand.values()).sort(
    (a, b) => {
      if (a.is_tracked_brand && !b.is_tracked_brand) return -1;
      if (!a.is_tracked_brand && b.is_tracked_brand) return 1;
      return b.mentions - a.mentions;
    }
  );

  // 7. Latest per-model snapshot.
  const latestPerModelMap = new Map<AIModel, PromptDetailResult>();
  for (const r of results) {
    if (!latestPerModelMap.has(r.model)) {
      latestPerModelMap.set(r.model, r);
    }
  }
  const latestPerModel = Array.from(latestPerModelMap.values()).sort(
    (a, b) => (a.model > b.model ? 1 : -1)
  );

  // 8. Trend — visibility per day-bucket (UTC) across all models.
  const byDate = new Map<
    string,
    { mentioned: number; total: number }
  >();
  for (const r of results) {
    const day = r.created_at.slice(0, 10);
    const entry = byDate.get(day) ?? { mentioned: 0, total: 0 };
    entry.total += 1;
    if (r.brand_mentioned) entry.mentioned += 1;
    byDate.set(day, entry);
  }
  const trend: PromptDetailTrendPoint[] = Array.from(byDate.entries())
    .map(([date, agg]) => ({
      date,
      mentioned: agg.mentioned,
      total: agg.total,
      visibility_pct:
        agg.total > 0 ? Math.round((agg.mentioned / agg.total) * 100) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const totalRuns = results.length;
  const totalMentions = results.filter((r) => r.brand_mentioned).length;
  const visibility =
    totalRuns > 0 ? Math.round((totalMentions / totalRuns) * 100) : 0;

  return {
    prompt,
    window_start: windowStart,
    window_end: windowEnd,
    total_runs: totalRuns,
    total_mentions: totalMentions,
    visibility_pct: visibility,
    latest_per_model: latestPerModel,
    results: results.slice(0, 200),
    trend,
    sources,
    brands,
  };
}
