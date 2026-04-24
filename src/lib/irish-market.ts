/**
 * Irish-market data layer.
 *
 * Loads the curated publisher library + sector templates at module
 * init. Exposes pure helpers for the Gap Analysis weighter, the
 * "Irish opportunity" badge, and the onboarding sector picker.
 *
 * Design notes:
 *   - Data is committed JSON, not in the DB. Small enough to ship
 *     with the bundle; a quarterly curation sweep updates it. PRs
 *     welcome.
 *   - Domain lookup is exact + canonical (lowercase, no www). Path-
 *     scoped entries like `independent.ie/life/travel` are matched
 *     only when the cited URL's pathname starts with that segment —
 *     this is opt-in on a per-publisher basis and kept rare.
 *   - Weight defaults to 1.0 and is capped at 2.0 in the Gap Score
 *     integration to prevent small-publisher weight-gaming from
 *     swamping genuinely high-value gaps.
 */

import publishersJson from "@/data/irish-publishers.json";
import sectorsJson from "@/data/sector-templates.json";

export type PublisherSourceType =
  | "editorial"
  | "corporate"
  | "reference"
  | "ugc";

export interface IrishPublisher {
  domain: string;
  name: string;
  source_type: PublisherSourceType;
  sectors: string[];
  notes?: string;
  weight?: number;
}

export interface SectorCompetitor {
  name: string;
  website?: string;
  domains?: string[];
}

export interface SectorTemplate {
  slug: string;
  name: string;
  description: string;
  sample_prompts: string[];
  sample_competitors: SectorCompetitor[];
  sample_publishers: string[];
}

const PUBLISHERS = publishersJson as IrishPublisher[];
const SECTORS = sectorsJson as SectorTemplate[];

// ── Canonicalisation + lookup maps (built once at import) ─────────

function canonicaliseHost(raw: string): string {
  return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
}

/**
 * Split an entry like "independent.ie/life/travel" into
 * { host, pathPrefix }. Publishers without a path share the fast
 * exact-match map.
 */
interface PublisherEntry {
  publisher: IrishPublisher;
  host: string;
  pathPrefix: string | null;
}

const exactByHost = new Map<string, IrishPublisher>();
const pathScoped: PublisherEntry[] = [];

for (const p of PUBLISHERS) {
  const raw = p.domain.trim();
  if (!raw) continue;
  const [hostRaw, ...rest] = raw.split("/");
  const host = canonicaliseHost(hostRaw);
  if (rest.length === 0) {
    exactByHost.set(host, p);
  } else {
    pathScoped.push({
      publisher: p,
      host,
      pathPrefix: `/${rest.join("/")}`,
    });
  }
}

// ── Public helpers ────────────────────────────────────────────────

/** Is the given URL or hostname in the Irish publisher library? */
export function isIrishPublisher(urlOrHost: string): boolean {
  return lookupPublisher(urlOrHost) !== null;
}

/** Full metadata row for the matching publisher, or null. */
export function getPublisherMeta(urlOrHost: string): IrishPublisher | null {
  return lookupPublisher(urlOrHost);
}

/**
 * Multiplier to apply to a Gap Score row. Defaults to 1.0 (no boost).
 * Irish publishers get their `weight` (default 1.2 when undefined),
 * capped at 2.0 to prevent outlier rows from swamping the list.
 *
 * Callers pass the project's `country_codes`; the multiplier only
 * applies when IE is in scope, so non-Irish projects are unaffected.
 */
export function gapScoreWeight(
  urlOrHost: string,
  countryCodes: string[] | null | undefined
): number {
  if (!countryCodes || !countryCodes.includes("IE")) return 1;
  const meta = lookupPublisher(urlOrHost);
  if (!meta) return 1;
  const w = typeof meta.weight === "number" ? meta.weight : 1.2;
  return Math.min(2.0, Math.max(0.1, w));
}

/** Full sector catalogue, in declared order. */
export function listSectorTemplates(): SectorTemplate[] {
  return SECTORS;
}

/** Resolve one sector by slug. Case-sensitive; slugs are kebab-case. */
export function getSectorTemplate(slug: string): SectorTemplate | null {
  return SECTORS.find((s) => s.slug === slug) ?? null;
}

// ── Internals ─────────────────────────────────────────────────────

function lookupPublisher(urlOrHost: string): IrishPublisher | null {
  if (!urlOrHost) return null;
  // Try to parse as a URL. Falls back to host-only input.
  let host = "";
  let pathname = "";
  try {
    const u = new URL(
      urlOrHost.startsWith("http") ? urlOrHost : `https://${urlOrHost}`
    );
    host = canonicaliseHost(u.host);
    pathname = u.pathname;
  } catch {
    host = canonicaliseHost(urlOrHost);
    pathname = "";
  }

  // Exact host match — fast path.
  const exact = exactByHost.get(host);
  if (exact) return exact;

  // Path-scoped entries (e.g. independent.ie/life/travel).
  for (const entry of pathScoped) {
    if (entry.host === host && pathname.startsWith(entry.pathPrefix ?? "")) {
      return entry.publisher;
    }
  }

  return null;
}
