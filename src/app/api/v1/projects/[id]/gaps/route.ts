/**
 * GET /api/v1/projects/[id]/gaps
 *
 * Ranked gap list. Defaults to domain scope; pass ?scope=urls for URL
 * gaps. Scope: gaps.read.
 */

import { requireApiKey } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, ok } from "@/lib/api/envelope";
import { requireProjectScope } from "@/lib/api/project-scope";
import { getDomainGaps, getUrlGaps } from "@/lib/queries/gap-analysis";
import type { AIModel } from "@/lib/types";

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isFinite(d.valueOf()) ? d : undefined;
}

const MODELS: ReadonlySet<AIModel> = new Set<AIModel>([
  "chatgpt",
  "perplexity",
  "google_aio",
  "gemini",
  "claude",
  "copilot",
  "grok",
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(request, "gaps.read");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await params;
  const projectScope = await requireProjectScope(auth.apiKey.org_id, projectId);
  if (!projectScope.ok) return projectScope.response;

  const url = new URL(request.url);
  const from =
    parseDate(url.searchParams.get("from")) ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = parseDate(url.searchParams.get("to")) ?? new Date();
  const modelParam = url.searchParams.get("model");
  const model =
    modelParam && MODELS.has(modelParam as AIModel)
      ? (modelParam as AIModel)
      : undefined;
  const scopeParam = url.searchParams.get("scope");
  const wantUrls = scopeParam === "urls";

  const admin = createAdminClient();

  try {
    if (wantUrls) {
      const result = await getUrlGaps(admin, projectId, {
        from,
        to,
        model,
        limit: 200,
      });
      return ok({ scope: "urls", ...result });
    }
    const result = await getDomainGaps(admin, projectId, {
      from,
      to,
      model,
      limit: 200,
    });
    return ok({ scope: "domains", ...result });
  } catch (err) {
    console.error("v1/gaps failed:", err);
    return apiError(500, "internal", "Failed to compute gaps");
  }
}
