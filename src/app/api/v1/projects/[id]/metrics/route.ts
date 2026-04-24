/**
 * GET /api/v1/projects/[id]/metrics
 *
 * Headline metrics for a project over an optional date window:
 *   - visibility_pct (mentioned / total_results × 100)
 *   - share_of_voice_pct (tracked_mentions / total_mentions × 100)
 *   - avg_position
 *   - sentiment distribution
 *   - totals (results, mentions, competitors, prompts)
 *
 * Scope: visibility.read.
 */

import { requireApiKey } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, ok } from "@/lib/api/envelope";
import { requireProjectScope } from "@/lib/api/project-scope";
import { computeShareOfVoice } from "@/lib/format";

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isFinite(d.valueOf()) ? d : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(request, "visibility.read");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await params;
  const scope = await requireProjectScope(auth.apiKey.org_id, projectId);
  if (!scope.ok) return scope.response;

  const url = new URL(request.url);
  const from =
    parseDate(url.searchParams.get("from")) ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = parseDate(url.searchParams.get("to")) ?? new Date();

  const admin = createAdminClient();

  try {
    // Results for visibility + position + sentiment.
    const { data: results, error: resultsErr } = await admin
      .from("results")
      .select(
        "id, brand_mentioned, mention_position, sentiment, created_at, prompts!inner(project_id)"
      )
      .eq("prompts.project_id", projectId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());
    if (resultsErr) throw resultsErr;

    // Brand mentions for SoV.
    const resultIds = (results ?? []).map((r) => r.id as string);
    let trackedMentions = 0;
    let totalMentions = 0;
    if (resultIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < resultIds.length; i += CHUNK) {
        const slice = resultIds.slice(i, i + CHUNK);
        const { data: mentions, error: mentionsErr } = await admin
          .from("result_brand_mentions")
          .select("is_tracked_brand")
          .in("result_id", slice);
        if (mentionsErr) throw mentionsErr;
        for (const m of mentions ?? []) {
          totalMentions += 1;
          if (m.is_tracked_brand) trackedMentions += 1;
        }
      }
    }

    // Totals.
    const [{ count: competitorsCount }, { count: promptsCount }] =
      await Promise.all([
        admin
          .from("competitors")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId),
        admin
          .from("prompts")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId),
      ]);

    const total = results?.length ?? 0;
    const mentioned =
      results?.filter((r) => r.brand_mentioned).length ?? 0;
    const visibilityPct = total > 0 ? Math.round((mentioned / total) * 100) : 0;

    const positions = (results ?? [])
      .map((r) => r.mention_position as number | null)
      .filter((p): p is number => typeof p === "number" && p > 0);
    const avgPosition =
      positions.length > 0
        ? Number(
            (
              positions.reduce((a, b) => a + b, 0) / positions.length
            ).toFixed(2)
          )
        : null;

    const sentimentDist = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };
    for (const r of results ?? []) {
      const s = r.sentiment as string | null;
      if (s && s in sentimentDist) {
        sentimentDist[s as keyof typeof sentimentDist] += 1;
      }
    }

    return ok({
      project_id: projectId,
      window: { from: from.toISOString(), to: to.toISOString() },
      visibility_pct: visibilityPct,
      share_of_voice_pct: computeShareOfVoice(trackedMentions, totalMentions),
      avg_position: avgPosition,
      sentiment_distribution: sentimentDist,
      totals: {
        results: total,
        results_with_brand_mentioned: mentioned,
        tracked_brand_mentions: trackedMentions,
        total_brand_mentions: totalMentions,
        tracked_competitors: competitorsCount ?? 0,
        tracked_prompts: promptsCount ?? 0,
      },
    });
  } catch (err) {
    console.error("v1/projects/[id]/metrics failed:", err);
    return apiError(500, "internal", "Failed to load metrics");
  }
}
