/**
 * Project-level Sources queries.
 *
 * Powers the /projects/[id]/sources/{domains,urls} pages and eventually
 * Gap Analysis. Scoped to a date range + optional filters rather than
 * a single run (insights.ts handles per-run).
 *
 * Design notes:
 *   - Aggregates in application code. Citations volumes are small (a
 *     few thousand rows per active project), so in-JS aggregation is
 *     simpler than a Supabase RPC and keeps the shape flexible for
 *     Gap Analysis to consume the same helpers.
 *   - Left-joins domain_classifications — unclassified domains still
 *     appear in the list with `source_type: null`; the UI renders them
 *     as "Unclassified" and the classifier queue picks them up on the
 *     next run.
 *   - Tags each row `is_brand_domain` / `is_competitor_domain` by
 *     comparing against the project's `brand_domains` array and every
 *     competitor's `domains` array. This keeps the flag authoritative
 *     even when the pipeline's earlier heuristic write to the citations
 *     table disagrees (e.g. migration order, multi-domain brands).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIModel } from "@/lib/types";
import {
  canonicaliseDomain,
  type SourceType,
} from "@/lib/classifiers/types";

export interface SourceDomainRow {
  domain: string;
  source_type: SourceType | null;
  source_type_confidence: number | null;
  manual_override: boolean;
  /** Total times a URL from this domain appeared as a citation. */
  total_citations: number;
  /** Subset of total_citations that were cited inline in the response. */
  inline_citations: number;
  /** Distinct chats where at least one URL from this domain appeared. */
  chats_appearing: number;
  /** 0..100. Chats-appearing / total-chats-in-window. */
  retrieved_pct: number;
  /** Avg URLs from this domain per chat where at least one appeared. */
  retrieval_rate: number;
  /** Avg inline citations per chat where at least one URL appeared. */
  citation_rate: number;
  is_brand_domain: boolean;
  is_competitor_domain: boolean;
}

export interface ProjectSourceDomainsResult {
  /** Distinct chats (results rows) in the selected window. Used as the denominator for retrieved_pct. */
  total_chats: number;
  /** Sorted by total_citations desc. Respects `limit`. */
  domains: SourceDomainRow[];
  /** Unfiltered counts across ALL source_types — powers the donut chart even when domains is filtered. */
  source_type_counts: Record<SourceType | "unclassified", number>;
}

export interface SourcesQueryOpts {
  from?: Date;
  to?: Date;
  model?: AIModel;
  /** When set, `domains` is filtered to this type but source_type_counts stays unfiltered. */
  sourceType?: SourceType | "unclassified";
  /** Cap on returned domain rows. Default 100. */
  limit?: number;
}

interface CitationJoinRow {
  url: string;
  domain: string;
  was_cited_inline: boolean;
  result_id: string;
  results: {
    run_id: string;
    model: string;
    created_at: string;
    prompt_id: string;
    prompts: { project_id: string };
  } | null;
}

/**
 * Pull every citation for a project within the window, aggregated to
 * domain level with retrieval / citation / inline metrics.
 */
export async function getProjectSourceDomains(
  supabase: SupabaseClient,
  projectId: string,
  opts: SourcesQueryOpts = {}
): Promise<ProjectSourceDomainsResult> {
  const { from, to, model, sourceType } = opts;
  const limit = opts.limit ?? 100;

  // ── 1. Project + competitor domain lookup ──
  const [projectRes, competitorsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("brand_domains")
      .eq("id", projectId)
      .maybeSingle<{ brand_domains: string[] | null }>(),
    supabase
      .from("competitors")
      .select("domains")
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

  // ── 2. Citations within the window ──
  // Embedded results!inner lets us filter on results.run_id / model /
  // prompts.project_id in one round-trip.
  let query = supabase
    .from("citations")
    .select(
      "url, domain, was_cited_inline, result_id, results!inner(run_id, model, created_at, prompt_id, prompts!inner(project_id))"
    )
    .eq("results.prompts.project_id", projectId);

  if (model) query = query.eq("results.model", model);
  if (from) query = query.gte("results.created_at", from.toISOString());
  if (to) query = query.lte("results.created_at", to.toISOString());

  const { data: citationRows, error } = await query.returns<
    CitationJoinRow[]
  >();

  if (error) {
    console.error("getProjectSourceDomains citations query failed:", error);
    return {
      total_chats: 0,
      domains: [],
      source_type_counts: emptyCounts(),
    };
  }

  // ── 3. Aggregate per-domain in memory ──
  const byDomain = new Map<
    string,
    {
      total: number;
      inline: number;
      chats: Set<string>;
    }
  >();
  const allResultIds = new Set<string>();
  for (const c of citationRows ?? []) {
    const d = canonicaliseDomain(c.domain ?? "");
    if (!d) continue;
    allResultIds.add(c.result_id);
    const existing = byDomain.get(d) ?? {
      total: 0,
      inline: 0,
      chats: new Set<string>(),
    };
    existing.total += 1;
    if (c.was_cited_inline) existing.inline += 1;
    existing.chats.add(c.result_id);
    byDomain.set(d, existing);
  }

  const totalChats = allResultIds.size;

  // ── 4. Classifier lookup for the observed domains ──
  const domainList = Array.from(byDomain.keys());
  const classifications = new Map<
    string,
    {
      source_type: SourceType;
      confidence: number;
      manual_override: boolean;
    }
  >();
  if (domainList.length > 0) {
    const { data: classRows } = await supabase
      .from("domain_classifications")
      .select("domain, source_type, confidence, manual_override")
      .in("domain", domainList);
    for (const c of classRows ?? []) {
      classifications.set(c.domain as string, {
        source_type: c.source_type as SourceType,
        confidence: (c.confidence as number) ?? 0,
        manual_override: Boolean(c.manual_override),
      });
    }
  }

  // ── 5. Shape + sort + filter ──
  const allRows: SourceDomainRow[] = domainList.map((d) => {
    const agg = byDomain.get(d)!;
    const classification = classifications.get(d);
    return {
      domain: d,
      source_type: classification?.source_type ?? null,
      source_type_confidence: classification?.confidence ?? null,
      manual_override: classification?.manual_override ?? false,
      total_citations: agg.total,
      inline_citations: agg.inline,
      chats_appearing: agg.chats.size,
      retrieved_pct:
        totalChats > 0 ? Math.round((agg.chats.size / totalChats) * 100) : 0,
      retrieval_rate:
        agg.chats.size > 0
          ? Math.round((agg.total / agg.chats.size) * 10) / 10
          : 0,
      citation_rate:
        agg.chats.size > 0
          ? Math.round((agg.inline / agg.chats.size) * 10) / 10
          : 0,
      is_brand_domain: brandDomains.has(d),
      is_competitor_domain: competitorDomains.has(d),
    };
  });

  // Brand-owned domains are always classified `your_own` regardless of
  // what the classifier said — flags on the citation take precedence.
  for (const row of allRows) {
    if (row.is_brand_domain) row.source_type = "your_own";
  }

  // Source type counts across ALL rows (before filter).
  const counts = emptyCounts();
  for (const r of allRows) {
    const key = (r.source_type ?? "unclassified") as keyof typeof counts;
    counts[key] += 1;
  }

  // Apply source-type filter AFTER counting so the chart always shows
  // the full breakdown even if the table is filtered.
  let filteredRows = allRows;
  if (sourceType) {
    filteredRows =
      sourceType === "unclassified"
        ? allRows.filter((r) => r.source_type === null)
        : allRows.filter((r) => r.source_type === sourceType);
  }

  filteredRows.sort((a, b) => b.total_citations - a.total_citations);

  return {
    total_chats: totalChats,
    domains: filteredRows.slice(0, limit),
    source_type_counts: counts,
  };
}

function emptyCounts(): Record<SourceType | "unclassified", number> {
  return {
    editorial: 0,
    corporate: 0,
    ugc: 0,
    reference: 0,
    your_own: 0,
    social: 0,
    other: 0,
    unclassified: 0,
  };
}
