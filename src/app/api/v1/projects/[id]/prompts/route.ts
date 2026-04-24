/**
 * GET /api/v1/projects/[id]/prompts
 *
 * Paginated prompt list with latest visibility per prompt. Scope: prompts.read.
 */

import { requireApiKey } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  makePaginationMeta,
  ok,
  parsePagination,
} from "@/lib/api/envelope";
import { requireProjectScope } from "@/lib/api/project-scope";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(request, "prompts.read");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await params;
  const scope = await requireProjectScope(auth.apiKey.org_id, projectId);
  if (!scope.ok) return scope.response;

  const url = new URL(request.url);
  const p = parsePagination(url);
  const admin = createAdminClient();
  const from = (p.page - 1) * p.page_size;
  const to = from + p.page_size - 1;

  const { data: prompts, count, error } = await admin
    .from("prompts")
    .select(
      "id, text, category, status, country_code, topic_id, created_at",
      { count: "exact" }
    )
    .eq("project_id", projectId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) {
    console.error("v1/prompts failed:", error);
    return apiError(500, "internal", "Failed to load prompts");
  }

  // Latest visibility per prompt in this page — single batched query.
  const promptIds = (prompts ?? []).map((r) => r.id as string);
  const visibility = new Map<string, { checks: number; mentioned: number }>();
  if (promptIds.length > 0) {
    const since = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: results, error: resErr } = await admin
      .from("results")
      .select("prompt_id, brand_mentioned")
      .in("prompt_id", promptIds)
      .gte("created_at", since);
    if (resErr) {
      console.error("v1/prompts visibility lookup failed:", resErr);
    }
    for (const r of results ?? []) {
      const pid = r.prompt_id as string;
      const existing = visibility.get(pid) ?? { checks: 0, mentioned: 0 };
      existing.checks += 1;
      if (r.brand_mentioned) existing.mentioned += 1;
      visibility.set(pid, existing);
    }
  }

  const enriched = (prompts ?? []).map((row) => {
    const stats = visibility.get(row.id as string) ?? {
      checks: 0,
      mentioned: 0,
    };
    return {
      id: row.id,
      text: row.text,
      category: row.category,
      status: row.status,
      country_code: row.country_code,
      topic_id: row.topic_id,
      created_at: row.created_at,
      visibility_30d: {
        checks: stats.checks,
        mentioned: stats.mentioned,
        visibility_pct:
          stats.checks > 0
            ? Math.round((stats.mentioned / stats.checks) * 100)
            : 0,
      },
    };
  });

  return ok(enriched, makePaginationMeta(p, count ?? 0));
}
