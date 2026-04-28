/**
 * POST /api/prompts/score
 *
 * Phase 6 importance scorer. Takes a projectId (and optionally a list
 * of promptIds), pulls the prompts from the DB, asks Haiku to assign
 * each one an importance score 1-5, and writes the results back.
 *
 * Body:
 *   { projectId: string, promptIds?: string[] }
 *   - omit promptIds = score every prompt in the project that does
 *     not already have an importance_score.
 *
 * Source-of-truth design doc: docs/phase-6-prompt-coverage.md
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPromptProjectContext } from "@/lib/prompts/project-context";
import { scorePrompts } from "@/lib/prompts/score";
import { logAiUsage } from "@/lib/ai-usage-logger";
import { mapAnthropicError } from "@/lib/anthropic-errors";
import type { PromptCategory } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Haiku scoring 50 prompts lands in 5-15s; 30s of headroom is fine.
export const maxDuration = 30;

interface RequestBody {
  projectId?: string;
  promptIds?: string[];
}

interface PromptRow {
  id: string;
  text: string;
  category: PromptCategory;
  importance_score: number | null;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 }
    );
  }

  const ctxResult = await loadPromptProjectContext(body.projectId);
  if (!ctxResult.ok) {
    return NextResponse.json(
      { error: ctxResult.error },
      { status: ctxResult.status }
    );
  }
  const { ctx } = ctxResult;

  const admin = createAdminClient();

  // Fetch the prompts to score. If promptIds is provided, restrict to
  // those; otherwise grab every prompt in the project that's missing
  // an importance_score (the "score everything new" mode used by the
  // batch flow on the Prompts tab).
  let query = admin
    .from("prompts")
    .select("id, text, category, importance_score")
    .eq("project_id", ctx.project.id);

  if (body.promptIds && body.promptIds.length > 0) {
    query = query.in("id", body.promptIds);
  } else {
    query = query.is("importance_score", null);
  }

  const { data: prompts, error: fetchError } = await query.returns<
    PromptRow[]
  >();
  if (fetchError) {
    return NextResponse.json(
      { error: `Failed to load prompts: ${fetchError.message}` },
      { status: 500 }
    );
  }
  if (!prompts || prompts.length === 0) {
    return NextResponse.json({ ok: true, scored_count: 0, prompts: [] });
  }

  let result;
  try {
    result = await scorePrompts({
      brandName: ctx.brandName,
      profile: ctx.profile,
      prompts: prompts.map((p) => ({
        id: p.id,
        text: p.text,
        category: p.category,
      })),
    });
  } catch (err) {
    logAiUsage({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      feature: "prompt_score",
      org_id: ctx.project.org_id,
      project_id: ctx.project.id,
      success: false,
      error_code:
        err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });

    if (err instanceof Error && err.message.includes("ANTHROPIC_API_KEY")) {
      return NextResponse.json(
        { error: err.message, code: "anthropic_not_configured" },
        { status: 503 }
      );
    }
    const mapped = mapAnthropicError(err);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status }
    );
  }

  logAiUsage({
    provider: "anthropic",
    model: result.usage.model,
    feature: "prompt_score",
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    org_id: ctx.project.org_id,
    project_id: ctx.project.id,
    user_id: ctx.user?.id ?? null,
    duration_ms: result.usage.duration_ms,
    success: true,
  });

  // Persist the scores. Supabase has no batch UPDATE-different-values
  // helper, so we fire one update per scored row. With 30-50 rows on
  // the same connection this lands in ~200-400ms — fine for a one-off
  // user action. If this ever becomes a hot path we'd switch to a
  // single SQL CASE/WHEN write.
  const updates = await Promise.all(
    result.scored.map((s) =>
      admin
        .from("prompts")
        .update({
          importance_score: s.importance_score,
          importance_rationale: s.rationale ?? null,
        })
        .eq("id", s.id)
        .eq("project_id", ctx.project.id)
        .select("*")
        .maybeSingle()
    )
  );

  const updatedRows = updates
    .map((u) => u.data)
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return NextResponse.json({
    ok: true,
    scored_count: updatedRows.length,
    prompts: updatedRows,
  });
}
