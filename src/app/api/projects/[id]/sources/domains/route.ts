/**
 * GET /api/projects/[id]/sources/domains
 *
 * Domain-level Sources breakdown for a project, aggregated over the
 * requested date range with optional model + source_type filters.
 *
 * Query params:
 *   from          ISO date (inclusive). Defaults to 30 days ago.
 *   to            ISO date (inclusive). Defaults to now.
 *   model         Filter to a single AI model (chatgpt / claude / perplexity / gemini / google_aio).
 *   source_type   Filter rows to a single source_type. "unclassified" = source_type is null.
 *   limit         Row cap. Default 100, max 500.
 *
 * Response: ProjectSourceDomainsResult (see lib/queries/sources.ts).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProjectSourceDomains } from "@/lib/queries/sources";
import type { AIModel } from "@/lib/types";
import { SOURCE_TYPES, type SourceType } from "@/lib/classifiers/types";

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

  const sourceTypeParam = url.searchParams.get("source_type");
  const sourceType =
    sourceTypeParam === "unclassified"
      ? "unclassified"
      : sourceTypeParam &&
          (SOURCE_TYPES as readonly string[]).includes(sourceTypeParam)
        ? (sourceTypeParam as SourceType)
        : undefined;

  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam)
    ? Math.min(500, Math.max(1, limitParam))
    : 100;

  const result = await getProjectSourceDomains(supabase, projectId, {
    from,
    to,
    model,
    sourceType,
    limit,
  });

  return NextResponse.json(result);
}
