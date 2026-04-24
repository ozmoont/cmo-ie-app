/**
 * GET /api/projects/[id]/sources/urls
 *
 * URL-level Sources breakdown. Mirrors the domains route's filter
 * semantics (from/to/model) and adds two URL-specific filters:
 *   - domain       Scope to one parent domain (canonicalised).
 *   - page_type    Filter to one page_type. `unclassified` = no url_classifications row yet.
 *   - url          When present, returns a single-URL detail payload
 *                  for the drawer (no pagination, includes triggering
 *                  prompts + latest snippets).
 *
 * Response:
 *   - When `url` is set: { detail: SourceUrlDetail | null }
 *   - Otherwise: ProjectSourceUrlsResult
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getProjectSourceUrls,
  getProjectSourceUrlDetail,
} from "@/lib/queries/sources";
import type { AIModel } from "@/lib/types";
import {
  PAGE_TYPES,
  canonicaliseDomain,
  type PageType,
} from "@/lib/classifiers/types";

const KNOWN_MODELS: ReadonlySet<AIModel> = new Set<AIModel>([
  "chatgpt",
  "perplexity",
  "google_aio",
  "gemini",
  "claude",
  "copilot",
  "grok",
]);

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isFinite(d.valueOf()) ? d : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);

  const from =
    parseDate(url.searchParams.get("from")) ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = parseDate(url.searchParams.get("to")) ?? new Date();

  const modelParam = url.searchParams.get("model");
  const model =
    modelParam && KNOWN_MODELS.has(modelParam as AIModel)
      ? (modelParam as AIModel)
      : undefined;

  // Single-URL detail path (drawer).
  const urlParam = url.searchParams.get("url");
  if (urlParam) {
    const detail = await getProjectSourceUrlDetail(
      supabase,
      projectId,
      urlParam,
      { from, to, model }
    );
    return NextResponse.json({ detail });
  }

  // List path.
  const domainRaw = url.searchParams.get("domain");
  const domain = domainRaw ? canonicaliseDomain(domainRaw) : undefined;

  const pageTypeParam = url.searchParams.get("page_type");
  const pageType =
    pageTypeParam === "unclassified"
      ? "unclassified"
      : pageTypeParam && (PAGE_TYPES as readonly string[]).includes(pageTypeParam)
        ? (pageTypeParam as PageType)
        : undefined;

  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam)
    ? Math.min(500, Math.max(1, limitParam))
    : 200;

  const result = await getProjectSourceUrls(supabase, projectId, {
    from,
    to,
    model,
    domain,
    pageType,
    limit,
  });

  return NextResponse.json(result);
}
