/**
 * POST /api/prompts/generate
 *
 * Phase 6 batch generator. Takes a projectId, generates 30-50
 * brand-aware prompts via Sonnet, inserts them as rows on the
 * `prompts` table tagged with a shared `generated_batch_id`, and
 * returns the inserted rows so the UI can render them immediately.
 *
 * Augments — does not replace — the legacy /api/prompts/suggest. The
 * onboarding flow keeps using suggest; the Prompts tab uses generate
 * for the AdWords-style coverage workflow.
 *
 * Source-of-truth design doc: docs/phase-6-prompt-coverage.md
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPromptProjectContext } from "@/lib/prompts/project-context";
import { generatePrompts } from "@/lib/prompts/generate";
import { logAiUsage } from "@/lib/ai-usage-logger";
import { mapAnthropicError } from "@/lib/anthropic-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sonnet emits 40 prompts in ~15-30s. 60s of headroom keeps us comfortably
// under the lambda's wall-clock cap even on a slow model day.
export const maxDuration = 60;

interface RequestBody {
  projectId?: string;
  count?: number;
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

  // Refuse to run with no profile — without a profile, the generator
  // is a coin-flip on industry. Better to surface a clear error and
  // push the user to fill in the brand profile first.
  if (!ctx.profile) {
    return NextResponse.json(
      {
        error:
          "This project has no brand profile yet. Fill in (or regenerate) the brand profile on the Brand tab before running batch generation — without it, the prompts will be generic.",
        code: "missing_brand_profile",
      },
      { status: 400 }
    );
  }

  let result;
  try {
    result = await generatePrompts({
      brandName: ctx.brandName,
      websiteUrl: ctx.websiteUrl,
      profile: ctx.profile,
      count: body.count,
    });
  } catch (err) {
    // Telemetry on failure too — we want to see error rates per feature.
    logAiUsage({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      feature: "prompt_generate",
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
    feature: "prompt_generate",
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    org_id: ctx.project.org_id,
    project_id: ctx.project.id,
    user_id: ctx.user?.id ?? null,
    duration_ms: result.usage.duration_ms,
    success: true,
  });

  if (result.prompts.length === 0) {
    return NextResponse.json(
      {
        error:
          "Sonnet returned zero usable prompts. Most common cause: brand profile is too thin. Edit the profile and retry.",
        code: "no_prompts_generated",
      },
      { status: 502 }
    );
  }

  // One batch_id per generation so the UI can roll back / regenerate
  // / analyse the batch as a unit later.
  const batchId = randomUUID();
  const admin = createAdminClient();

  const insertRows = result.prompts.map((p) => ({
    project_id: ctx.project.id,
    text: p.text,
    category: p.category,
    generated_batch_id: batchId,
  }));

  const { data: inserted, error: insertError } = await admin
    .from("prompts")
    .insert(insertRows)
    .select("*");

  if (insertError) {
    console.error(
      `[prompt_generate] insert failed for project ${ctx.project.id}:`,
      insertError
    );
    return NextResponse.json(
      {
        error:
          "Generated prompts but failed to save them. Check the server log.",
        detail: insertError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    count: inserted?.length ?? 0,
    prompts: inserted ?? [],
  });
}
