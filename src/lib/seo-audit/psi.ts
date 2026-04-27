/**
 * Google PageSpeed Insights API helper.
 *
 * Free tier: 25k requests/day at the URL level, no per-domain limit.
 * Calls take 10-30 seconds depending on the audited site.
 *
 * We pull the LIGHTHOUSE-style audit (categories: performance, SEO,
 * accessibility, best-practices) plus the field data (CrUX) when
 * available. The skill prompt then summarises and prioritises.
 *
 * Docs: https://developers.google.com/speed/docs/insights/v5/get-started
 *
 * Env: PAGESPEED_API_KEY (set this; if unset we still call but get
 * rate-limited harder — falls back to the unauthenticated tier).
 */

const PSI_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 60_000; // PSI can be slow

export interface PsiResult {
  /** "FAST" | "AVERAGE" | "SLOW" — Lighthouse-derived overall speed bucket */
  performance_score: number | null;
  seo_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  /** Core Web Vitals (CrUX field data when available, lab data fallback) */
  lcp_ms: number | null; // Largest Contentful Paint
  fid_ms: number | null; // First Input Delay (legacy, rarely reported now)
  cls: number | null;    // Cumulative Layout Shift
  inp_ms: number | null; // Interaction to Next Paint (replaces FID)
  /** Raw audit insights — shortlist of issues. Keys = audit id, values = title */
  failed_audits: Array<{ id: string; title: string; description: string }>;
  /** Whether CrUX field data was available */
  has_field_data: boolean;
  /** Strategy: "mobile" or "desktop". We always pull mobile-first. */
  strategy: "mobile" | "desktop";
}

export class PsiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PsiError";
  }
}

/**
 * Run a PageSpeed Insights query against the URL. Returns null
 * categories when PSI couldn't analyse (e.g. site blocks the
 * Lighthouse user agent — same Cloudflare problem brand-profile
 * extraction hits) — caller decides how to surface that.
 */
export async function runPsi(
  url: string,
  opts: {
    strategy?: "mobile" | "desktop";
    apiKey?: string;
  } = {}
): Promise<PsiResult> {
  const strategy = opts.strategy ?? "mobile";
  const apiKey = opts.apiKey ?? process.env.PAGESPEED_API_KEY;

  const params = new URLSearchParams({
    url,
    strategy,
    // Pull every category — the report can use whichever the skill
    // decides matter most for the audit.
    category: "performance",
    locale: "en",
  });
  // The category param can be repeated. URLSearchParams encodes one
  // per append; PSI accepts multiple.
  params.append("category", "seo");
  params.append("category", "accessibility");
  params.append("category", "best-practices");
  if (apiKey) params.set("key", apiKey);

  let payload: PsiRawPayload;
  try {
    const res = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new PsiError(
        `PSI HTTP ${res.status}: ${body.slice(0, 200)}`
      );
    }
    payload = (await res.json()) as PsiRawPayload;
  } catch (err) {
    if (err instanceof PsiError) throw err;
    throw new PsiError(
      err instanceof Error ? err.message : "Unknown PSI fetch error",
      err
    );
  }

  const lr = payload.lighthouseResult;
  if (!lr) {
    // PSI returned a body without a Lighthouse run — typically means
    // the URL was unreachable from Google's crawlers.
    throw new PsiError("PSI returned no Lighthouse result — site likely unreachable");
  }

  // Score is 0-1 in PSI; multiply by 100 for the conventional scale.
  const score = (key: string): number | null => {
    const raw = lr.categories?.[key]?.score;
    return typeof raw === "number" ? Math.round(raw * 100) : null;
  };

  // Field data from CrUX (real-user metrics). Falls back to lab data
  // from the synthetic Lighthouse run when CrUX data isn't available
  // (e.g. low-traffic sites).
  const fieldMetrics = payload.loadingExperience?.metrics ?? {};
  const labMetrics = lr.audits ?? {};

  const fieldOrLabMs = (fieldKey: string, labKey: string): number | null => {
    const f = fieldMetrics[fieldKey]?.percentile;
    if (typeof f === "number") return f;
    const l = labMetrics[labKey]?.numericValue;
    return typeof l === "number" ? Math.round(l) : null;
  };

  const fieldOrLab = (fieldKey: string, labKey: string): number | null => {
    const f = fieldMetrics[fieldKey]?.percentile;
    if (typeof f === "number") return f / 100; // CrUX returns scaled
    const l = labMetrics[labKey]?.numericValue;
    return typeof l === "number" ? l : null;
  };

  // Failed audits — anything with score < 0.9 in the SEO / performance
  // categories. The skill prompt does the prioritisation; we just
  // surface the raw signals.
  const failedAudits: PsiResult["failed_audits"] = [];
  for (const [id, audit] of Object.entries(lr.audits ?? {})) {
    if (
      typeof audit.score === "number" &&
      audit.score < 0.9 &&
      audit.title &&
      audit.description &&
      // Skip "informative" audits with no pass/fail; only surface real issues.
      audit.score !== null
    ) {
      failedAudits.push({
        id,
        title: audit.title,
        description: audit.description.slice(0, 400),
      });
    }
    // Cap at 25 issues — the skill prompt focuses on top problems
    // and the JSON we build here goes inside the user message.
    if (failedAudits.length >= 25) break;
  }

  return {
    performance_score: score("performance"),
    seo_score: score("seo"),
    accessibility_score: score("accessibility"),
    best_practices_score: score("best-practices"),
    lcp_ms: fieldOrLabMs("LARGEST_CONTENTFUL_PAINT_MS", "largest-contentful-paint"),
    fid_ms: fieldOrLabMs("FIRST_INPUT_DELAY_MS", "max-potential-fid"),
    cls: fieldOrLab("CUMULATIVE_LAYOUT_SHIFT_SCORE", "cumulative-layout-shift"),
    inp_ms: fieldOrLabMs("INTERACTION_TO_NEXT_PAINT", "interaction-to-next-paint"),
    failed_audits: failedAudits,
    has_field_data: Object.keys(fieldMetrics).length > 0,
    strategy,
  };
}

// ── Narrow type shape we consume from PSI's response ─────────────
// PSI's payload is huge; we only pin what we read. Keeps the file
// lean and tolerant of schema drift.
interface PsiRawPayload {
  lighthouseResult?: {
    categories?: Record<string, { score: number | null }>;
    audits?: Record<
      string,
      {
        title?: string;
        description?: string;
        score: number | null;
        numericValue?: number;
      }
    >;
  };
  loadingExperience?: {
    metrics?: Record<string, { percentile: number }>;
  };
}
