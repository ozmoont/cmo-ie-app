/**
 * Insights query layer — surfaces the raw ground-truth data behind
 * every dashboard summary number. Every "sometimes mentioned",
 * "top of the list", "9 cited domains" card should have a clickable
 * drill-down that lands on this data.
 *
 * Kept separate from queries.ts so it's easy to see what's aggregation
 * for display vs. what's underlying evidence for the report.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PromptQualityResult } from "./prompt-quality";

export interface PromptBreakdown {
  prompt_id: string;
  prompt_text: string;
  model: string;
  model_version: string | null;
  brand_mentioned: boolean;
  mention_position: number | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  response_snippet: string | null;
  source_count: number;
  inline_count: number;
  /** Every brand named in the response, ordered by first mention. */
  brands_named: string[];
  /** The five top competitor brands named in the response, for quick display. */
  top_brand_preview: string[];
  /** Populated in API layer by running checkPromptQuality over the text. */
  quality?: PromptQualityResult;
}

export interface DomainBreakdown {
  domain: string;
  total_citations: number;
  inline_citations: number;
  prompts_triggering: number;
  is_brand_domain: boolean;
  is_competitor_domain: boolean;
}

export interface GapOpportunity {
  prompt_id: string;
  prompt_text: string;
  /** Which models showed this gap. */
  models: string[];
  /** Competitors named in these responses. */
  competitors_mentioned: string[];
  /** Latest response snippet we have for this prompt, for context. */
  latest_snippet: string | null;
}

/**
 * Fetch the latest daily_run for a project. Used as the default
 * reporting window by every insight below.
 */
export async function getLatestRunId(
  supabase: SupabaseClient,
  projectId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("daily_runs")
    .select("id, completed_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Per-prompt evidence for a single run. One row per (prompt × model)
 * combination that ran — i.e. for an 11-prompt × 1-model project,
 * this returns 11 rows.
 */
export async function getPromptBreakdown(
  supabase: SupabaseClient,
  runId: string
): Promise<PromptBreakdown[]> {
  // Pull results + linked prompts in one trip. Then separately fetch
  // citations and brand mentions — doing them in the main query would
  // balloon the row count unnecessarily.
  const { data: rows, error } = await supabase
    .from("results")
    .select(
      "id, prompt_id, model, model_version, brand_mentioned, mention_position, sentiment, response_snippet, prompts!inner(text)"
    )
    .eq("run_id", runId)
    .order("mention_position", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("getPromptBreakdown query failed:", error);
    return [];
  }
  if (!rows || rows.length === 0) return [];

  const resultIds = rows.map((r) => r.id);

  // Citations aggregated per result.
  const [citationsRes, mentionsRes] = await Promise.all([
    supabase
      .from("citations")
      .select("result_id, was_cited_inline")
      .in("result_id", resultIds),
    supabase
      .from("result_brand_mentions")
      .select("result_id, brand_name, is_tracked_brand, position")
      .in("result_id", resultIds),
  ]);

  const citationCounts = new Map<
    string,
    { total: number; inline: number }
  >();
  for (const c of citationsRes.data ?? []) {
    const existing = citationCounts.get(c.result_id) ?? {
      total: 0,
      inline: 0,
    };
    existing.total += 1;
    if (c.was_cited_inline) existing.inline += 1;
    citationCounts.set(c.result_id, existing);
  }

  const mentionsByResult = new Map<
    string,
    { brand_name: string; is_tracked_brand: boolean; position: number }[]
  >();
  for (const m of mentionsRes.data ?? []) {
    const list = mentionsByResult.get(m.result_id) ?? [];
    list.push({
      brand_name: m.brand_name,
      is_tracked_brand: m.is_tracked_brand,
      position: m.position,
    });
    mentionsByResult.set(m.result_id, list);
  }

  return rows.map((r) => {
    const counts = citationCounts.get(r.id) ?? { total: 0, inline: 0 };
    const mentions = (mentionsByResult.get(r.id) ?? []).sort(
      (a, b) => a.position - b.position
    );
    const names = mentions.map((m) => m.brand_name);
    // Prompts embedded via !inner come back as `prompts` object or array
    // depending on the Supabase client version; handle both.
    const promptText = Array.isArray(
      (r as unknown as { prompts: { text: string } | { text: string }[] }).prompts
    )
      ? (r as unknown as { prompts: { text: string }[] }).prompts[0]?.text ?? ""
      : (r as unknown as { prompts: { text: string } }).prompts?.text ?? "";
    return {
      prompt_id: r.prompt_id,
      prompt_text: promptText,
      model: r.model,
      model_version: r.model_version ?? null,
      brand_mentioned: r.brand_mentioned,
      mention_position: r.mention_position,
      sentiment: r.sentiment,
      response_snippet: r.response_snippet,
      source_count: counts.total,
      inline_count: counts.inline,
      brands_named: names,
      top_brand_preview: names.slice(0, 5),
    };
  });
}

/**
 * Domain-level citation breakdown for a single run. Answers:
 * "where did the N cited domains come from, and which prompts drove each".
 */
export async function getDomainBreakdown(
  supabase: SupabaseClient,
  runId: string
): Promise<DomainBreakdown[]> {
  const { data, error } = await supabase
    .from("citations")
    .select(
      "domain, is_brand_domain, is_competitor_domain, was_cited_inline, result_id, results!inner(run_id, prompt_id)"
    )
    .eq("results.run_id", runId);

  if (error) {
    console.error("getDomainBreakdown query failed:", error);
    return [];
  }

  const byDomain = new Map<
    string,
    {
      domain: string;
      total: number;
      inline: number;
      prompts: Set<string>;
      is_brand_domain: boolean;
      is_competitor_domain: boolean;
    }
  >();
  for (const row of data ?? []) {
    const existing = byDomain.get(row.domain) ?? {
      domain: row.domain,
      total: 0,
      inline: 0,
      prompts: new Set<string>(),
      is_brand_domain: row.is_brand_domain,
      is_competitor_domain: row.is_competitor_domain,
    };
    existing.total += 1;
    if (row.was_cited_inline) existing.inline += 1;
    const linked = (
      row as unknown as { results: { prompt_id: string } | { prompt_id: string }[] }
    ).results;
    const promptId = Array.isArray(linked)
      ? linked[0]?.prompt_id
      : linked?.prompt_id;
    if (promptId) existing.prompts.add(promptId);
    byDomain.set(row.domain, existing);
  }

  return Array.from(byDomain.values())
    .map((d) => ({
      domain: d.domain,
      total_citations: d.total,
      inline_citations: d.inline,
      prompts_triggering: d.prompts.size,
      is_brand_domain: d.is_brand_domain,
      is_competitor_domain: d.is_competitor_domain,
    }))
    .sort((a, b) => b.total_citations - a.total_citations);
}

/**
 * Gap opportunities: prompts where competitors got mentioned but our
 * brand did NOT. These are the "actionable" rows for the sales pitch.
 *
 * Filters to the latest run only. For a wider date range, build on top
 * of this and aggregate.
 */
export async function getGapOpportunities(
  supabase: SupabaseClient,
  runId: string
): Promise<GapOpportunity[]> {
  // Pull results that missed us.
  const { data: results, error: resultsError } = await supabase
    .from("results")
    .select(
      "id, prompt_id, model, response_snippet, prompts!inner(text)"
    )
    .eq("run_id", runId)
    .eq("brand_mentioned", false);

  if (resultsError) {
    console.error("getGapOpportunities results query failed:", resultsError);
    return [];
  }
  if (!results || results.length === 0) return [];

  // Pull brand mentions for those results.
  const resultIds = results.map((r) => r.id);
  const { data: mentions } = await supabase
    .from("result_brand_mentions")
    .select("result_id, brand_name, is_tracked_brand")
    .in("result_id", resultIds);

  const mentionsByResult = new Map<string, string[]>();
  for (const m of mentions ?? []) {
    if (m.is_tracked_brand) continue;
    const list = mentionsByResult.get(m.result_id) ?? [];
    list.push(m.brand_name);
    mentionsByResult.set(m.result_id, list);
  }

  // Group by prompt_id; collapse model + competitor lists.
  const byPrompt = new Map<
    string,
    {
      prompt_id: string;
      prompt_text: string;
      models: Set<string>;
      competitors: Set<string>;
      latest_snippet: string | null;
    }
  >();
  for (const r of results) {
    const competitorsOnThisResult = mentionsByResult.get(r.id) ?? [];
    // Only a real "gap" if at least one competitor was named — if the
    // response mentioned no brands at all, it's low-signal.
    if (competitorsOnThisResult.length === 0) continue;

    const existing = byPrompt.get(r.prompt_id) ?? {
      prompt_id: r.prompt_id,
      prompt_text: (() => {
        const linked = (
          r as unknown as { prompts: { text: string } | { text: string }[] }
        ).prompts;
        return Array.isArray(linked) ? linked[0]?.text ?? "" : linked?.text ?? "";
      })(),
      models: new Set<string>(),
      competitors: new Set<string>(),
      latest_snippet: r.response_snippet,
    };
    existing.models.add(r.model);
    for (const c of competitorsOnThisResult) existing.competitors.add(c);
    byPrompt.set(r.prompt_id, existing);
  }

  return Array.from(byPrompt.values())
    .map((g) => ({
      prompt_id: g.prompt_id,
      prompt_text: g.prompt_text,
      models: Array.from(g.models),
      competitors_mentioned: Array.from(g.competitors),
      latest_snippet: g.latest_snippet,
    }))
    // Rank by how many distinct competitors appeared — proxy for
    // "this is a live conversation we're absent from".
    .sort(
      (a, b) => b.competitors_mentioned.length - a.competitors_mentioned.length
    );
}
