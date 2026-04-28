/**
 * POST /api/prompts/mirror
 *
 * Phase 6 Google-query mirror. Takes a projectId (and optionally a
 * list of promptIds), pulls the prompts, asks Haiku for the closest
 * plain-English Google query per prompt, and writes the results back.
 *
 * Body:
 *   { projectId: string, promptIds?: string[] }
 *   - omit promptIds = mirror every prompt in the project that does
 *     not already have a google_query_mirror.
 *
 * Source-of-truth design doc: docs/phase-6-prompt-coverage.md
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPromptProjectContext } from "@/lib/prompts/project-context";
import { mirrorPrompts } from "@/lib/prompts/mirror";
import { logAiUsage } from "@/lib/ai-usage-logger";
import { mapAnthropicError } from "@/lib/anthropic-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RequestBody {
  projectId?: string;
  promptIds?: string[];
}

interface PromptRow {
  id: string;
  text: string;
  google_query_mirror: string | null;
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

  let query = admin
    .from("prompts")
    .select("id, text, google_query_mirror")
    .eq("project_id", ctx.project.id);

  if (body.promptIds && body.promptIds.length > 0) {
    query = query.in("id", body.promptIds);
  } else {
    query = query.is("google_query_mirror", null);
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
    return NextResponse.json({ ok: true, mirrored_count: 0, prompts: [] });
  }

  let result;
  try {
    result = await mirrorPrompts({
      brandName: ctx.brandName,
      prompts: prompts.map((p) => ({ id: p.id, text: p.text })),
    });
  } catch (err) {
    logAiUsage({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      feature: "prompt_mirror",
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
    feature: "prompt_mirror",
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    org_id: ctx.project.org_id,
    project_id: ctx.project.id,
    user_id: ctx.user?.id ?? null,
    duration_ms: result.usage.duration_ms,
    success: true,
  });

  // Same per-row update pattern as /score — fine at this batch size.
  const updates = await Promise.all(
    result.mirrored.map((m) =>
      admin
        .from("prompts")
        .update({ google_query_mirror: m.google_query_mirror })
        .eq("id", m.id)
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
    mirrored_count: updatedRows.length,
    prompts: updatedRows,
  });
}
