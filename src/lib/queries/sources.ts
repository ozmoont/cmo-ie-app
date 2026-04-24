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
  type PageType,
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

// ── URL-level queries (P2-C) ──────────────────────────────────────────

export interface SourceUrlRow {
  url: string;
  domain: string;
  page_type: PageType | null;
  page_title: string | null;
  /** Total citations of this specific URL across all results in the window. */
  total_citations: number;
  /** Citations where the URL was referenced inline in the response body. */
  inline_citations: number;
  /** Distinct prompts that triggered this URL at least once. */
  distinct_prompts: number;
  /** Earliest `created_at` (ISO) we have for this URL in the window. */
  first_seen: string | null;
  /** Most recent `created_at` (ISO) we have for this URL in the window. */
  last_seen: string | null;
  /** Source-type of the parent domain, joined from domain_classifications. */
  source_type: SourceType | null;
  is_brand_domain: boolean;
  is_competitor_domain: boolean;
}

export interface ProjectSourceUrlsResult {
  total_chats: number;
  urls: SourceUrlRow[];
  /** Unfiltered counts across all page_types, for the filter bar. */
  page_type_counts: Record<PageType | "unclassified", number>;
}

export interface SourceUrlsQueryOpts extends SourcesQueryOpts {
  /** Scope to a single domain (canonicalised — lowercase, no www.). */
  domain?: string;
  /** Filter to one page type. `unclassified` keeps rows with no url_classifications row. */
  pageType?: PageType | "unclassified";
}

interface UrlCitationJoinRow {
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
 * URL-level aggregation. Mirrors `getProjectSourceDomains` but keyed on
 * the full URL instead of the hostname. Joins `url_classifications`
 * (page type + title) and `domain_classifications` (source type of the
 * parent domain) so the UI can render everything from one query.
 */
export async function getProjectSourceUrls(
  supabase: SupabaseClient,
  projectId: string,
  opts: SourceUrlsQueryOpts = {}
): Promise<ProjectSourceUrlsResult> {
  const { from, to, model, domain, pageType } = opts;
  const limit = opts.limit ?? 200;

  // ── 1. Project + competitor domain lookup (for badges) ──
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
  let query = supabase
    .from("citations")
    .select(
      "url, domain, was_cited_inline, result_id, results!inner(run_id, model, created_at, prompt_id, prompts!inner(project_id))"
    )
    .eq("results.prompts.project_id", projectId);

  if (model) query = query.eq("results.model", model);
  if (from) query = query.gte("results.created_at", from.toISOString());
  if (to) query = query.lte("results.created_at", to.toISOString());
  if (domain) query = query.eq("domain", domain);

  const { data: citationRows, error } = await query.returns<
    UrlCitationJoinRow[]
  >();
  if (error) {
    console.error("getProjectSourceUrls citations query failed:", error);
    return {
      total_chats: 0,
      urls: [],
      page_type_counts: emptyPageCounts(),
    };
  }

  // ── 3. Aggregate per-URL + collect prompts ──
  const byUrl = new Map<
    string,
    {
      domain: string;
      total: number;
      inline: number;
      results: Set<string>;
      prompts: Set<string>;
      firstSeen: string | null;
      lastSeen: string | null;
    }
  >();
  const allResultIds = new Set<string>();
  for (const c of citationRows ?? []) {
    const dom = canonicaliseDomain(c.domain ?? "");
    if (!c.url || !dom) continue;
    allResultIds.add(c.result_id);
    const existing = byUrl.get(c.url) ?? {
      domain: dom,
      total: 0,
      inline: 0,
      results: new Set<string>(),
      prompts: new Set<string>(),
      firstSeen: null,
      lastSeen: null,
    };
    existing.total += 1;
    if (c.was_cited_inline) existing.inline += 1;
    existing.results.add(c.result_id);
    if (c.results?.prompt_id) existing.prompts.add(c.results.prompt_id);
    const ts = c.results?.created_at ?? null;
    if (ts) {
      if (!existing.firstSeen || ts < existing.firstSeen)
        existing.firstSeen = ts;
      if (!existing.lastSeen || ts > existing.lastSeen) existing.lastSeen = ts;
    }
    byUrl.set(c.url, existing);
  }

  const totalChats = allResultIds.size;

  // ── 4. Classification lookups (parallel) ──
  const urlList = Array.from(byUrl.keys());
  const distinctDomains = Array.from(
    new Set(Array.from(byUrl.values()).map((v) => v.domain))
  );

  const [urlClassRes, domainClassRes] = await Promise.all([
    urlList.length > 0
      ? supabase
          .from("url_classifications")
          .select("url, page_type, page_title")
          .in("url", urlList)
      : Promise.resolve({ data: [] as { url: string; page_type: string; page_title: string | null }[] }),
    distinctDomains.length > 0
      ? supabase
          .from("domain_classifications")
          .select("domain, source_type")
          .in("domain", distinctDomains)
      : Promise.resolve({ data: [] as { domain: string; source_type: string }[] }),
  ]);

  const urlClass = new Map<
    string,
    { page_type: PageType; page_title: string | null }
  >();
  for (const c of urlClassRes.data ?? []) {
    urlClass.set(c.url as string, {
      page_type: c.page_type as PageType,
      page_title: (c.page_title as string | null) ?? null,
    });
  }
  const domainClass = new Map<string, SourceType>();
  for (const c of domainClassRes.data ?? []) {
    domainClass.set(c.domain as string, c.source_type as SourceType);
  }

  // ── 5. Shape rows ──
  const allRows: SourceUrlRow[] = urlList.map((u) => {
    const agg = byUrl.get(u)!;
    const uc = urlClass.get(u);
    const ds = domainClass.get(agg.domain) ?? null;
    return {
      url: u,
      domain: agg.domain,
      page_type: uc?.page_type ?? null,
      page_title: uc?.page_title ?? null,
      total_citations: agg.total,
      inline_citations: agg.inline,
      distinct_prompts: agg.prompts.size,
      first_seen: agg.firstSeen,
      last_seen: agg.lastSeen,
      source_type: brandDomains.has(agg.domain) ? "your_own" : ds,
      is_brand_domain: brandDomains.has(agg.domain),
      is_competitor_domain: competitorDomains.has(agg.domain),
    };
  });

  // ── 6. Counts (before filter, so chart/filter bar stays stable) ──
  const counts = emptyPageCounts();
  for (const r of allRows) {
    const key = (r.page_type ?? "unclassified") as keyof typeof counts;
    counts[key] += 1;
  }

  let filteredRows = allRows;
  if (pageType) {
    filteredRows =
      pageType === "unclassified"
        ? allRows.filter((r) => r.page_type === null)
        : allRows.filter((r) => r.page_type === pageType);
  }

  filteredRows.sort((a, b) => b.total_citations - a.total_citations);

  return {
    total_chats: totalChats,
    urls: filteredRows.slice(0, limit),
    page_type_counts: counts,
  };
}

function emptyPageCounts(): Record<PageType | "unclassified", number> {
  return {
    article: 0,
    listicle: 0,
    how_to: 0,
    comparison: 0,
    review: 0,
    product_page: 0,
    landing: 0,
    directory: 0,
    forum_thread: 0,
    faq: 0,
    other: 0,
    unclassified: 0,
  };
}

// ── Single-URL detail (drawer) ─────────────────────────────────────────

export interface SourceUrlPromptRow {
  prompt_id: string;
  prompt_text: string;
  prompt_category: string | null;
  /** Times this URL appeared for this prompt in the window. */
  citation_count: number;
  /** Models that returned the URL for this prompt (deduped). */
  models: string[];
  /** Latest response snippet from any of these citations. Null when results have no snippet. */
  latest_snippet: string | null;
  latest_at: string | null;
}

export interface SourceUrlDetail {
  url: string;
  domain: string;
  page_type: PageType | null;
  page_title: string | null;
  source_type: SourceType | null;
  is_brand_domain: boolean;
  is_competitor_domain: boolean;
  total_citations: number;
  inline_citations: number;
  first_seen: string | null;
  last_seen: string | null;
  /** Prompts that triggered this URL, ordered by citation_count desc. */
  prompts: SourceUrlPromptRow[];
}

interface UrlDetailJoinRow {
  was_cited_inline: boolean;
  result_id: string;
  results: {
    model: string;
    created_at: string;
    response_snippet: string | null;
    prompt_id: string;
    prompts: {
      id: string;
      text: string;
      category: string | null;
      project_id: string;
    };
  } | null;
}

/**
 * Full detail for one URL: page metadata, parent-domain source type, and
 * the list of prompts that triggered it with per-prompt citation counts
 * and the most recent response snippet.
 */
export async function getProjectSourceUrlDetail(
  supabase: SupabaseClient,
  projectId: string,
  url: string,
  opts: { from?: Date; to?: Date; model?: AIModel } = {}
): Promise<SourceUrlDetail | null> {
  const { from, to, model } = opts;

  let query = supabase
    .from("citations")
    .select(
      "was_cited_inline, result_id, results!inner(model, created_at, response_snippet, prompt_id, prompts!inner(id, text, category, project_id))"
    )
    .eq("url", url)
    .eq("results.prompts.project_id", projectId);

  if (model) query = query.eq("results.model", model);
  if (from) query = query.gte("results.created_at", from.toISOString());
  if (to) query = query.lte("results.created_at", to.toISOString());

  const { data: rows, error } = await query.returns<UrlDetailJoinRow[]>();
  if (error) {
    console.error("getProjectSourceUrlDetail failed:", error);
    return null;
  }
  if (!rows || rows.length === 0) return null;

  // Aggregate per-prompt.
  const byPrompt = new Map<
    string,
    {
      prompt_id: string;
      prompt_text: string;
      prompt_category: string | null;
      citation_count: number;
      models: Set<string>;
      latest_snippet: string | null;
      latest_at: string | null;
    }
  >();
  let total = 0;
  let inline = 0;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;
  let domain = "";

  for (const r of rows) {
    total += 1;
    if (r.was_cited_inline) inline += 1;
    const pr = r.results?.prompts;
    const resInfo = r.results;
    if (!pr || !resInfo) continue;
    if (!firstSeen || resInfo.created_at < firstSeen)
      firstSeen = resInfo.created_at;
    if (!lastSeen || resInfo.created_at > lastSeen)
      lastSeen = resInfo.created_at;
    const existing = byPrompt.get(pr.id) ?? {
      prompt_id: pr.id,
      prompt_text: pr.text,
      prompt_category: pr.category,
      citation_count: 0,
      models: new Set<string>(),
      latest_snippet: null,
      latest_at: null,
    };
    existing.citation_count += 1;
    existing.models.add(resInfo.model);
    if (!existing.latest_at || resInfo.created_at > existing.latest_at) {
      existing.latest_at = resInfo.created_at;
      existing.latest_snippet = resInfo.response_snippet;
    }
    byPrompt.set(pr.id, existing);
  }

  // Domain + classification lookups.
  domain = canonicaliseDomain(new URL(url).host);

  const [projectRes, competitorsRes, urlClassRes, domainClassRes] =
    await Promise.all([
      supabase
        .from("projects")
        .select("brand_domains")
        .eq("id", projectId)
        .maybeSingle<{ brand_domains: string[] | null }>(),
      supabase.from("competitors").select("domains").eq("project_id", projectId),
      supabase
        .from("url_classifications")
        .select("page_type, page_title")
        .eq("url", url)
        .maybeSingle<{ page_type: string; page_title: string | null }>(),
      supabase
        .from("domain_classifications")
        .select("source_type")
        .eq("domain", domain)
        .maybeSingle<{ source_type: string }>(),
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

  const isBrand = brandDomains.has(domain);
  const isCompetitor = competitorDomains.has(domain);

  const prompts: SourceUrlPromptRow[] = Array.from(byPrompt.values())
    .map((p) => ({
      prompt_id: p.prompt_id,
      prompt_text: p.prompt_text,
      prompt_category: p.prompt_category,
      citation_count: p.citation_count,
      models: Array.from(p.models).sort(),
      latest_snippet: p.latest_snippet,
      latest_at: p.latest_at,
    }))
    .sort((a, b) => b.citation_count - a.citation_count);

  return {
    url,
    domain,
    page_type: (urlClassRes.data?.page_type as PageType | undefined) ?? null,
    page_title: urlClassRes.data?.page_title ?? null,
    source_type: isBrand
      ? "your_own"
      : ((domainClassRes.data?.source_type as SourceType | undefined) ?? null),
    is_brand_domain: isBrand,
    is_competitor_domain: isCompetitor,
    total_citations: total,
    inline_citations: inline,
    first_seen: firstSeen,
    last_seen: lastSeen,
    prompts,
  };
}
