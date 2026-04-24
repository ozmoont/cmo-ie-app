/**
 * Gap Analysis — domain + URL-level "where competitors appear and we
 * don't" with a Gap Score ranking.
 *
 * This is the feature CMO.ie is sold on vs. Peec.ai: the product answer
 * to the marketer's real question, "what should I do about my AI
 * visibility problem?". Everything in /sources/ is evidence — gaps are
 * actionable.
 *
 * Gap Score (per scope doc §D):
 *
 *   gap_score = source_frequency
 *             × competitor_breadth
 *             × (1 - our_presence)
 *
 *   source_frequency   = chats that cited this source / total chats in window (0..1)
 *   competitor_breadth = distinct competitors that appeared via this source / total competitors (0..1)
 *   our_presence       = chats where the source appeared AND our brand was mentioned in the same chat / chats where the source appeared (0..1)
 *
 *   When no competitors are defined on the project, competitor_breadth
 *   degenerates to 0 and the score is always 0. That's intentional —
 *   without a comparison set there is no gap, only absence.
 *
 * Stars (UI rendering, Peec convention):
 *   - >= 0.30 → 3 stars (high opportunity)
 *   - >= 0.10 → 2 stars
 *   - >  0    → 1 star
 *   - == 0    → excluded from the list
 *
 * Aggregation is in-JS. Per-project volumes are in the low thousands of
 * citations; materialised-view optimisation can come later if perf
 * becomes a problem.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIModel } from "@/lib/types";
import {
  canonicaliseDomain,
  type PageType,
  type SourceType,
} from "@/lib/classifiers/types";
import { gapScoreWeight, isIrishPublisher } from "@/lib/irish-market";

export type GapStars = 1 | 2 | 3;

export interface GapDomainRow {
  domain: string;
  source_type: SourceType | null;
  /** 0..1 opportunity score, weighted. */
  gap_score: number;
  stars: GapStars;
  /** Distinct chats in the window where any URL from this domain appeared. */
  chats_with_source: number;
  /** Distinct tracked competitors that appeared via this domain. */
  competitors_present: string[];
  /** Fraction of competitors this source reached, 0..1. */
  competitor_breadth: number;
  /** Chats where the source appeared AND our brand was mentioned in the same chat. */
  chats_with_source_and_brand: number;
  /** Fraction of those source-chats where we were named, 0..1. */
  our_presence: number;
  /** Fraction of ALL chats in the window that cited this domain. */
  source_frequency: number;
  is_brand_domain: boolean;
  is_competitor_domain: boolean;
  /** True when the domain appears in the Irish publisher library. */
  is_irish_publisher: boolean;
}

export interface GapUrlRow {
  url: string;
  domain: string;
  page_type: PageType | null;
  page_title: string | null;
  source_type: SourceType | null;
  gap_score: number;
  stars: GapStars;
  chats_with_source: number;
  competitors_present: string[];
  competitor_breadth: number;
  chats_with_source_and_brand: number;
  our_presence: number;
  source_frequency: number;
  is_brand_domain: boolean;
  is_competitor_domain: boolean;
  /** True when the parent domain is in the Irish publisher library. */
  is_irish_publisher: boolean;
}

export interface GapAnalysisOpts {
  from?: Date;
  to?: Date;
  model?: AIModel;
  /** Cap returned rows. Defaults 100 (domains) / 200 (URLs). */
  limit?: number;
  /** Minimum chats_with_source threshold to keep a row. Drops noise. Default 1. */
  minChats?: number;
}

export interface GapDomainsResult {
  total_chats: number;
  total_competitors: number;
  rows: GapDomainRow[];
}

export interface GapUrlsResult {
  total_chats: number;
  total_competitors: number;
  rows: GapUrlRow[];
}

interface GapCitationRow {
  url: string;
  domain: string;
  result_id: string;
  results: {
    prompt_id: string;
    created_at: string;
    model: string;
    prompts: { project_id: string };
  } | null;
}

interface GapMentionRow {
  result_id: string;
  is_tracked_brand: boolean;
  competitor_id: string | null;
}

/**
 * Pull the raw data the gap algorithm needs — citations with parent
 * result + same-result brand mentions. Shared by the domain and URL
 * gap functions so we only hit Supabase once per call.
 */
async function loadGapInputs(
  supabase: SupabaseClient,
  projectId: string,
  opts: { from?: Date; to?: Date; model?: AIModel }
) {
  const { from, to, model } = opts;

  // Citations within window, scoped to the project via the embedded
  // prompt join. Same shape used by getProjectSourceDomains.
  let citationsQ = supabase
    .from("citations")
    .select(
      "url, domain, result_id, results!inner(prompt_id, created_at, model, prompts!inner(project_id))"
    )
    .eq("results.prompts.project_id", projectId);
  if (model) citationsQ = citationsQ.eq("results.model", model);
  if (from) citationsQ = citationsQ.gte("results.created_at", from.toISOString());
  if (to) citationsQ = citationsQ.lte("results.created_at", to.toISOString());

  const { data: citationRows, error: citError } = await citationsQ.returns<
    GapCitationRow[]
  >();
  if (citError) throw citError;

  // Every brand mention from the same window. We only care about the
  // result_id set: per-result brand co-presence drives `our_presence`,
  // and competitor_id coverage drives `competitor_breadth`.
  const resultIds = Array.from(
    new Set((citationRows ?? []).map((c) => c.result_id))
  );
  let mentionRows: GapMentionRow[] = [];
  if (resultIds.length > 0) {
    // Supabase caps `.in()` payload; chunk to be safe for large windows.
    const CHUNK = 500;
    for (let i = 0; i < resultIds.length; i += CHUNK) {
      const slice = resultIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("result_brand_mentions")
        .select("result_id, is_tracked_brand, competitor_id")
        .in("result_id", slice);
      if (error) throw error;
      if (data) mentionRows = mentionRows.concat(data as GapMentionRow[]);
    }
  }

  return {
    citationRows: citationRows ?? [],
    mentionRows,
  };
}

/**
 * Domain-level gap ranking.
 */
export async function getDomainGaps(
  supabase: SupabaseClient,
  projectId: string,
  opts: GapAnalysisOpts = {}
): Promise<GapDomainsResult> {
  const limit = opts.limit ?? 100;
  const minChats = opts.minChats ?? 1;

  // Project / competitor lookups — needed for flags + breadth denominator.
  const [projectRes, competitorsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("brand_domains, country_codes")
      .eq("id", projectId)
      .maybeSingle<{ brand_domains: string[] | null; country_codes: string[] | null }>(),
    supabase
      .from("competitors")
      .select("id, name, display_name, domains")
      .eq("project_id", projectId),
  ]);
  const brandDomains = new Set(
    (projectRes.data?.brand_domains ?? [])
      .map(canonicaliseDomain)
      .filter(Boolean)
  );
  const countryCodes = projectRes.data?.country_codes ?? [];
  const competitors = (competitorsRes.data ?? []).map((c) => ({
    id: c.id as string,
    name: ((c.display_name as string) || (c.name as string)) ?? "",
    domains: new Set(
      ((c.domains as string[] | null) ?? [])
        .map(canonicaliseDomain)
        .filter(Boolean)
    ),
  }));
  const competitorDomains = new Set<string>();
  for (const c of competitors) for (const d of c.domains) competitorDomains.add(d);

  const totalCompetitors = competitors.length;

  const { citationRows, mentionRows } = await loadGapInputs(
    supabase,
    projectId,
    opts
  );

  // result_id → set of competitor_ids present in that chat.
  const resultCompetitorIds = new Map<string, Set<string>>();
  // result_id → boolean (our brand mentioned in this chat).
  const resultHasBrand = new Map<string, boolean>();
  for (const m of mentionRows) {
    if (m.is_tracked_brand) resultHasBrand.set(m.result_id, true);
    if (m.competitor_id) {
      const existing = resultCompetitorIds.get(m.result_id) ?? new Set<string>();
      existing.add(m.competitor_id);
      resultCompetitorIds.set(m.result_id, existing);
    }
  }

  // Collect per-domain buckets.
  const byDomain = new Map<
    string,
    {
      chats: Set<string>;
      competitors: Set<string>;
      chatsWithBrand: Set<string>;
    }
  >();
  const allResultIds = new Set<string>();
  for (const c of citationRows) {
    const d = canonicaliseDomain(c.domain ?? "");
    if (!d) continue;
    allResultIds.add(c.result_id);
    const entry = byDomain.get(d) ?? {
      chats: new Set<string>(),
      competitors: new Set<string>(),
      chatsWithBrand: new Set<string>(),
    };
    entry.chats.add(c.result_id);
    const brands = resultCompetitorIds.get(c.result_id);
    if (brands) for (const b of brands) entry.competitors.add(b);
    if (resultHasBrand.get(c.result_id)) entry.chatsWithBrand.add(c.result_id);
    byDomain.set(d, entry);
  }

  const totalChats = allResultIds.size;

  // Map competitor_id → display name for the UI chips.
  const competitorNameById = new Map<string, string>();
  for (const c of competitors) competitorNameById.set(c.id, c.name);

  // Classifier lookup.
  const domainList = Array.from(byDomain.keys());
  const classMap = new Map<string, SourceType>();
  if (domainList.length > 0) {
    const { data } = await supabase
      .from("domain_classifications")
      .select("domain, source_type")
      .in("domain", domainList);
    for (const row of data ?? [])
      classMap.set(row.domain as string, row.source_type as SourceType);
  }

  // Score each domain.
  const rows: GapDomainRow[] = [];
  for (const [domain, agg] of byDomain) {
    if (agg.chats.size < minChats) continue;
    // Filter out our own domains from the gap list — they can't be
    // gaps against us by definition.
    if (brandDomains.has(domain)) continue;

    const sourceFrequency = totalChats > 0 ? agg.chats.size / totalChats : 0;
    const competitorBreadth =
      totalCompetitors > 0 ? agg.competitors.size / totalCompetitors : 0;
    const ourPresence =
      agg.chats.size > 0 ? agg.chatsWithBrand.size / agg.chats.size : 0;

    const rawScore = sourceFrequency * competitorBreadth * (1 - ourPresence);
    if (rawScore <= 0) continue;

    // Apply the Irish-market weight when the project tracks IE.
    // Clamps the result at 1.0 so star-buckets stay interpretable.
    const weight = gapScoreWeight(domain, countryCodes);
    const weightedScore = Math.min(1, rawScore * weight);
    const irish = isIrishPublisher(domain);

    rows.push({
      domain,
      source_type: classMap.get(domain) ?? null,
      gap_score: Math.round(weightedScore * 1000) / 1000,
      stars: toStars(weightedScore),
      chats_with_source: agg.chats.size,
      competitors_present: Array.from(agg.competitors)
        .map((id) => competitorNameById.get(id) ?? id)
        .sort(),
      competitor_breadth: Math.round(competitorBreadth * 1000) / 1000,
      chats_with_source_and_brand: agg.chatsWithBrand.size,
      our_presence: Math.round(ourPresence * 1000) / 1000,
      source_frequency: Math.round(sourceFrequency * 1000) / 1000,
      is_brand_domain: false,
      is_competitor_domain: competitorDomains.has(domain),
      is_irish_publisher: irish,
    });
  }

  rows.sort((a, b) => b.gap_score - a.gap_score);

  return {
    total_chats: totalChats,
    total_competitors: totalCompetitors,
    rows: rows.slice(0, limit),
  };
}

/**
 * URL-level gap ranking. Same algorithm, keyed on the full URL — more
 * actionable ("pitch this exact article") and higher-effort because of
 * the page-type enrichment query.
 */
export async function getUrlGaps(
  supabase: SupabaseClient,
  projectId: string,
  opts: GapAnalysisOpts = {}
): Promise<GapUrlsResult> {
  const limit = opts.limit ?? 200;
  const minChats = opts.minChats ?? 1;

  const [projectRes, competitorsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("brand_domains, country_codes")
      .eq("id", projectId)
      .maybeSingle<{ brand_domains: string[] | null; country_codes: string[] | null }>(),
    supabase
      .from("competitors")
      .select("id, name, display_name, domains")
      .eq("project_id", projectId),
  ]);
  const brandDomains = new Set(
    (projectRes.data?.brand_domains ?? [])
      .map(canonicaliseDomain)
      .filter(Boolean)
  );
  const countryCodes = projectRes.data?.country_codes ?? [];
  const competitors = (competitorsRes.data ?? []).map((c) => ({
    id: c.id as string,
    name: ((c.display_name as string) || (c.name as string)) ?? "",
    domains: new Set(
      ((c.domains as string[] | null) ?? [])
        .map(canonicaliseDomain)
        .filter(Boolean)
    ),
  }));
  const competitorDomains = new Set<string>();
  for (const c of competitors) for (const d of c.domains) competitorDomains.add(d);

  const totalCompetitors = competitors.length;

  const { citationRows, mentionRows } = await loadGapInputs(
    supabase,
    projectId,
    opts
  );

  const resultCompetitorIds = new Map<string, Set<string>>();
  const resultHasBrand = new Map<string, boolean>();
  for (const m of mentionRows) {
    if (m.is_tracked_brand) resultHasBrand.set(m.result_id, true);
    if (m.competitor_id) {
      const existing = resultCompetitorIds.get(m.result_id) ?? new Set<string>();
      existing.add(m.competitor_id);
      resultCompetitorIds.set(m.result_id, existing);
    }
  }

  const byUrl = new Map<
    string,
    {
      domain: string;
      chats: Set<string>;
      competitors: Set<string>;
      chatsWithBrand: Set<string>;
    }
  >();
  const allResultIds = new Set<string>();
  for (const c of citationRows) {
    const d = canonicaliseDomain(c.domain ?? "");
    if (!c.url || !d) continue;
    allResultIds.add(c.result_id);
    const entry = byUrl.get(c.url) ?? {
      domain: d,
      chats: new Set<string>(),
      competitors: new Set<string>(),
      chatsWithBrand: new Set<string>(),
    };
    entry.chats.add(c.result_id);
    const brands = resultCompetitorIds.get(c.result_id);
    if (brands) for (const b of brands) entry.competitors.add(b);
    if (resultHasBrand.get(c.result_id)) entry.chatsWithBrand.add(c.result_id);
    byUrl.set(c.url, entry);
  }

  const totalChats = allResultIds.size;
  const competitorNameById = new Map<string, string>();
  for (const c of competitors) competitorNameById.set(c.id, c.name);

  // Classifier lookups (URL + parent domain).
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
  for (const row of urlClassRes.data ?? [])
    urlClass.set(row.url as string, {
      page_type: row.page_type as PageType,
      page_title: (row.page_title as string | null) ?? null,
    });
  const domainClass = new Map<string, SourceType>();
  for (const row of domainClassRes.data ?? [])
    domainClass.set(row.domain as string, row.source_type as SourceType);

  const rows: GapUrlRow[] = [];
  for (const [url, agg] of byUrl) {
    if (agg.chats.size < minChats) continue;
    if (brandDomains.has(agg.domain)) continue;

    const sourceFrequency = totalChats > 0 ? agg.chats.size / totalChats : 0;
    const competitorBreadth =
      totalCompetitors > 0 ? agg.competitors.size / totalCompetitors : 0;
    const ourPresence =
      agg.chats.size > 0 ? agg.chatsWithBrand.size / agg.chats.size : 0;

    const rawScore = sourceFrequency * competitorBreadth * (1 - ourPresence);
    if (rawScore <= 0) continue;

    // Weighting: when the project tracks IE, URLs whose parent
    // domain is in the Irish publisher library get their configured
    // weight. Caller controls country; our job is just to apply.
    const weight = gapScoreWeight(agg.domain, countryCodes);
    const weightedScore = Math.min(1, rawScore * weight);
    const irish = isIrishPublisher(agg.domain);

    const uc = urlClass.get(url);
    rows.push({
      url,
      domain: agg.domain,
      page_type: uc?.page_type ?? null,
      page_title: uc?.page_title ?? null,
      source_type: domainClass.get(agg.domain) ?? null,
      gap_score: Math.round(weightedScore * 1000) / 1000,
      stars: toStars(weightedScore),
      chats_with_source: agg.chats.size,
      competitors_present: Array.from(agg.competitors)
        .map((id) => competitorNameById.get(id) ?? id)
        .sort(),
      competitor_breadth: Math.round(competitorBreadth * 1000) / 1000,
      chats_with_source_and_brand: agg.chatsWithBrand.size,
      our_presence: Math.round(ourPresence * 1000) / 1000,
      source_frequency: Math.round(sourceFrequency * 1000) / 1000,
      is_brand_domain: false,
      is_competitor_domain: competitorDomains.has(agg.domain),
      is_irish_publisher: irish,
    });
  }

  rows.sort((a, b) => b.gap_score - a.gap_score);

  return {
    total_chats: totalChats,
    total_competitors: totalCompetitors,
    rows: rows.slice(0, limit),
  };
}

// ── Pure scoring helpers (exported for testability) ─────────────────

/**
 * Compute a raw gap_score from the three normalised components. Exposed
 * primarily so tests can validate ordering + edge-case behaviour
 * without materialising Supabase mocks.
 */
export function computeGapScore({
  sourceFrequency,
  competitorBreadth,
  ourPresence,
}: {
  sourceFrequency: number;
  competitorBreadth: number;
  ourPresence: number;
}): number {
  const sf = clamp01(sourceFrequency);
  const cb = clamp01(competitorBreadth);
  const op = clamp01(ourPresence);
  return sf * cb * (1 - op);
}

export function toStars(gapScore: number): GapStars {
  if (gapScore >= 0.3) return 3;
  if (gapScore >= 0.1) return 2;
  return 1;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
