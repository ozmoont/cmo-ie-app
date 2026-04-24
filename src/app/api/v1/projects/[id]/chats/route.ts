/**
 * GET /api/v1/projects/[id]/chats
 *
 * Paginated result rows (one "chat" per prompt × model × run) with
 * snippet, mention flags, and basic metadata. Scope: chats.read.
 *
 * Query params:
 *   from/to     date window (default 30 days).
 *   model       restrict to a single model.
 *   mentioned   "true"/"false" to filter on brand_mentioned.
 *   prompt_id   restrict to one prompt.
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

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isFinite(d.valueOf()) ? d : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(request, "chats.read");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await params;
  const scope = await requireProjectScope(auth.apiKey.org_id, projectId);
  if (!scope.ok) return scope.response;

  const url = new URL(request.url);
  const p = parsePagination(url);
  const from =
    parseDate(url.searchParams.get("from")) ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = parseDate(url.searchParams.get("to")) ?? new Date();
  const model = url.searchParams.get("model");
  const mentionedRaw = url.searchParams.get("mentioned");
  const promptId = url.searchParams.get("prompt_id");

  const admin = createAdminClient();
  const start = (p.page - 1) * p.page_size;
  const end = start + p.page_size - 1;

  let query = admin
    .from("results")
    .select(
      "id, run_id, prompt_id, model, model_version, brand_mentioned, mention_position, sentiment, response_snippet, created_at, prompts!inner(project_id)",
      { count: "exact" }
    )
    .eq("prompts.project_id", projectId)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false });

  if (model) query = query.eq("model", model);
  if (promptId) query = query.eq("prompt_id", promptId);
  if (mentionedRaw === "true") query = query.eq("brand_mentioned", true);
  if (mentionedRaw === "false") query = query.eq("brand_mentioned", false);

  const { data, count, error } = await query.range(start, end);
  if (error) {
    console.error("v1/chats failed:", error);
    return apiError(500, "internal", "Failed to load chats");
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    run_id: r.run_id,
    prompt_id: r.prompt_id,
    model: r.model,
    model_version: r.model_version,
    brand_mentioned: r.brand_mentioned,
    mention_position: r.mention_position,
    sentiment: r.sentiment,
    response_snippet: r.response_snippet,
    created_at: r.created_at,
  }));

  return ok(rows, makePaginationMeta(p, count ?? 0));
}
