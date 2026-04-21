/**
 * Competitor suggestions pipeline.
 *
 * After the run engine populates `result_brand_mentions` for a run, this
 * module sweeps those mentions, strips out anything already tracked
 * (project's own brand + existing competitors), and upserts the rest
 * into `competitor_suggestions`. Subsequent runs increment `mention_count`
 * so the dashboard can show the most-mentioned untracked brands first.
 *
 * A brand shows up as a "Suggested competitor" in the UI once
 * `mention_count >= SUGGESTION_THRESHOLD` (default 2, Peec convention).
 * The threshold is applied at query time, not insert time, so we keep
 * all observations and can tune the bar without a data migration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Competitor } from "@/lib/types";

export const SUGGESTION_THRESHOLD = 2;

export interface PendingSuggestion {
  id: string;
  project_id: string;
  brand_name: string;
  mention_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

/**
 * Normalise a brand-name string for dedup purposes. Case-insensitive,
 * trims whitespace. Does NOT strip punctuation — "HubSpot" and
 * "HubSpot, Inc." remain distinct entries so the user can decide
 * whether they're the same brand (merge via aliases) or different.
 */
function normBrandName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Given the set of brand names named in a run's responses plus the
 * tracked brands for the project, return only the names that are
 * genuinely un-tracked. Case-insensitive comparison; matches against
 * tracked_name, display_name, and all aliases.
 */
export function filterUntrackedBrands(
  observedBrands: string[],
  tracked: {
    trackedName: string;
    aliases: string[];
  },
  competitors: Pick<Competitor, "tracked_name" | "display_name" | "aliases">[]
): string[] {
  const knownNames = new Set<string>();
  for (const n of [tracked.trackedName, ...tracked.aliases]) {
    if (n) knownNames.add(normBrandName(n));
  }
  for (const c of competitors) {
    if (c.tracked_name) knownNames.add(normBrandName(c.tracked_name));
    if (c.display_name) knownNames.add(normBrandName(c.display_name));
    for (const a of c.aliases ?? []) {
      if (a) knownNames.add(normBrandName(a));
    }
  }

  // Dedup observations by normalised form, preserve first-seen casing.
  const deduped = new Map<string, string>();
  for (const obs of observedBrands) {
    const key = normBrandName(obs);
    if (!key) continue;
    if (!deduped.has(key)) deduped.set(key, obs);
  }

  return Array.from(deduped.entries())
    .filter(([key]) => !knownNames.has(key))
    .map(([, displayForm]) => displayForm);
}

/**
 * Upsert a batch of observations into `competitor_suggestions`.
 * Increments mention_count for repeat brands. Refreshes last_seen_at.
 *
 * Idempotent per-observation: calling twice with the same brand counts
 * as two observations (which is what we want — each call corresponds
 * to a distinct AI response). Callers should pass one entry per
 * mention, not one entry per unique name.
 */
export async function recordSuggestionObservations(
  admin: SupabaseClient,
  projectId: string,
  brandNames: string[]
): Promise<void> {
  if (brandNames.length === 0) return;

  // Aggregate in-memory first so we minimise roundtrips.
  const counts = new Map<string, { brandName: string; count: number }>();
  for (const bn of brandNames) {
    const key = normBrandName(bn);
    if (!key) continue;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { brandName: bn, count: 1 });
  }

  const now = new Date().toISOString();

  for (const { brandName, count } of counts.values()) {
    // Upsert pattern: try to find an existing row (status=pending
    // preferred; we don't disturb tracked/rejected rows). If found,
    // bump count. Otherwise insert fresh.
    const { data: existing } = await admin
      .from("competitor_suggestions")
      .select("id, mention_count, status")
      .eq("project_id", projectId)
      .ilike("brand_name", brandName)
      .maybeSingle();

    if (existing) {
      // Rejected suggestions stay rejected — don't revive them.
      if (existing.status === "rejected") continue;
      await admin
        .from("competitor_suggestions")
        .update({
          mention_count: existing.mention_count + count,
          last_seen_at: now,
        })
        .eq("id", existing.id);
    } else {
      await admin.from("competitor_suggestions").insert({
        project_id: projectId,
        brand_name: brandName,
        mention_count: count,
        status: "pending",
        first_seen_at: now,
        last_seen_at: now,
      });
    }
  }
}

/**
 * Query helper: surface pending suggestions for a project, filtered
 * above the mention threshold, sorted by most-mentioned first.
 */
export async function getPendingSuggestions(
  supabase: SupabaseClient,
  projectId: string,
  opts: { threshold?: number; limit?: number } = {}
): Promise<PendingSuggestion[]> {
  const threshold = opts.threshold ?? SUGGESTION_THRESHOLD;

  let query = supabase
    .from("competitor_suggestions")
    .select(
      "id, project_id, brand_name, mention_count, first_seen_at, last_seen_at"
    )
    .eq("project_id", projectId)
    .eq("status", "pending")
    .gte("mention_count", threshold)
    .order("mention_count", { ascending: false });

  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) {
    console.error("getPendingSuggestions failed:", error);
    return [];
  }
  return data ?? [];
}
