/**
 * GET /api/projects/[id]/gaps/domains
 *
 * Domain-level Gap Analysis. Returns rows sorted by gap_score desc.
 *
 * Query params:
 *   from           ISO date (inclusive). Defaults to 30 days ago.
 *   to             ISO date (inclusive). Defaults to now.
 *   model          Filter to a single AI model.
 *   limit          Row cap. Default 100, max 500.
 *   min_chats      Minimum chats_with_source threshold. Default 1.
 *
 * Response: GapDomainsResult.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDomainGaps } from "@/lib/queries/gap-analysis";
import type { AIModel } from "@/lib/types";

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

  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam)
    ? Math.min(500, Math.max(1, limitParam))
    : 100;

  const minChatsParam = Number(url.searchParams.get("min_chats"));
  const minChats = Number.isFinite(minChatsParam)
    ? Math.max(1, minChatsParam)
    : 1;

  try {
    const result = await getDomainGaps(supabase, projectId, {
      from,
      to,
      model,
      limit,
      minChats,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /gaps/domains failed:", err);
    return NextResponse.json(
      { error: "Failed to compute gaps" },
      { status: 500 }
    );
  }
}
