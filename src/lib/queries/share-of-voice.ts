/**
 * Share of Voice queries.
 *
 * SoV = your_brand_mentions / total_brand_mentions × 100, aggregated over
 * every result_brand_mentions row within a time window + project.
 *
 * Implemented against the `result_brand_mentions` table introduced in
 * migration 006. Returns both the score and raw counts so callers can
 * decide whether to show "no data yet" vs a real number.
 */

import { createClient } from "@/lib/supabase/server";
import { computeShareOfVoice } from "@/lib/format";

/**
 * Aggregate SoV for a project over an optional date range.
 *
 * Date filters apply against the `created_at` of the `result_brand_mentions`
 * row, which matches the run's run_date in practice.
 *
 * @returns {{ score, trackedMentions, totalMentions }}
 */
export async function getShareOfVoice(
  projectId: string,
  opts: { from?: Date; to?: Date } = {}
): Promise<{
  score: number;
  trackedMentions: number;
  totalMentions: number;
}> {
  const supabase = await createClient();

  // We need: all mentions for this project, split by is_tracked_brand.
  // result_brand_mentions joins to results → prompts → project_id. Supabase
  // supports filtering via the embedded relation (results!inner) and then
  // filtering on the linked prompts/project via a second join. Written
  // as a single query so we pull only relevant rows.
  let query = supabase
    .from("result_brand_mentions")
    .select(
      "is_tracked_brand, results!inner(prompt_id, prompts!inner(project_id)), created_at",
      { count: "exact" }
    )
    .eq("results.prompts.project_id", projectId);

  if (opts.from) query = query.gte("created_at", opts.from.toISOString());
  if (opts.to) query = query.lte("created_at", opts.to.toISOString());

  const { data, error } = await query;
  if (error) {
    console.error("getShareOfVoice query failed:", error);
    return { score: 0, trackedMentions: 0, totalMentions: 0 };
  }

  const rows = data ?? [];
  const totalMentions = rows.length;
  const trackedMentions = rows.filter((r) => r.is_tracked_brand === true).length;

  return {
    score: computeShareOfVoice(trackedMentions, totalMentions),
    trackedMentions,
    totalMentions,
  };
}

/**
 * Per-brand mention counts, sorted by count descending. Useful for the
 * Brands ranking table on the Overview dashboard.
 *
 * Returns { brand_name, mentions, is_tracked_brand, competitor_id }.
 */
export async function getBrandMentionBreakdown(
  projectId: string,
  opts: { from?: Date; to?: Date; limit?: number } = {}
): Promise<
  {
    brand_name: string;
    mentions: number;
    is_tracked_brand: boolean;
    competitor_id: string | null;
  }[]
> {
  const supabase = await createClient();

  let query = supabase
    .from("result_brand_mentions")
    .select(
      "brand_name, is_tracked_brand, competitor_id, results!inner(prompts!inner(project_id)), created_at"
    )
    .eq("results.prompts.project_id", projectId);

  if (opts.from) query = query.gte("created_at", opts.from.toISOString());
  if (opts.to) query = query.lte("created_at", opts.to.toISOString());

  const { data, error } = await query;
  if (error) {
    console.error("getBrandMentionBreakdown query failed:", error);
    return [];
  }

  // Group in-memory — row counts for SoV-relevant windows are small
  // enough (single-digit thousands) that a server round-trip with
  // GROUP BY isn't worth the complexity.
  const buckets = new Map<
    string,
    {
      brand_name: string;
      mentions: number;
      is_tracked_brand: boolean;
      competitor_id: string | null;
    }
  >();
  for (const row of data ?? []) {
    const key = `${row.brand_name}|${row.is_tracked_brand ? "1" : "0"}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.mentions += 1;
    } else {
      buckets.set(key, {
        brand_name: row.brand_name,
        mentions: 1,
        is_tracked_brand: row.is_tracked_brand,
        competitor_id: row.competitor_id,
      });
    }
  }

  const sorted = Array.from(buckets.values()).sort(
    (a, b) => b.mentions - a.mentions
  );
  return opts.limit ? sorted.slice(0, opts.limit) : sorted;
}
