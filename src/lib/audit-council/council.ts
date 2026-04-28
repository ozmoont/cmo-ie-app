/**
 * Phase 7 — council orchestrator.
 *
 * Runs the three auditors in parallel, then the chair, then writes
 * everything to the audit_reviews row. Telemetry per call to
 * ai_usage_events.
 *
 * Robust on purpose:
 *   - One auditor erroring is fine; chair synthesises from survivors.
 *   - All three auditors erroring → chair runs the mechanical
 *     fallback, status='complete', error_message captures detail.
 *   - DB write failure on the final UPDATE is caught + logged; we
 *     don't blow up the customer's request because the customer's
 *     request returned long ago (this is in an after() block).
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logAiUsage } from "@/lib/ai-usage-logger";
import { computeCost } from "@/lib/ai-pricing";
import { runClaudeAuditor } from "./auditors/claude";
import { runChatGPTAuditor } from "./auditors/chatgpt";
import { runGeminiAuditor } from "./auditors/gemini";
import { runChair } from "./chair";
import { loadArtifactForAudit } from "./artifact-loaders";
import type {
  AuditedArtifactType,
  AuditorReport,
} from "./types";

interface RunCouncilArgs {
  reviewId: string;
  artifactType: AuditedArtifactType;
  artifactId: string;
  orgId: string;
  projectId: string | null;
}

/**
 * Run the council for one pending audit_reviews row. The row is
 * expected to already exist in 'pending' status (enqueue.ts handles
 * the insert). This function flips it to 'running' on entry,
 * 'complete' or 'error' on exit.
 */
export async function runCouncil(args: RunCouncilArgs): Promise<void> {
  const { reviewId, artifactType, artifactId, orgId, projectId } = args;
  const startedAt = Date.now();
  const admin = createAdminClient();

  // Mark running so the inbox can show in-flight rows distinctly.
  await admin
    .from("audit_reviews")
    .update({ status: "running" })
    .eq("id", reviewId);

  // ── Load the artifact ──────────────────────────────────────────
  let artifact;
  try {
    artifact = await loadArtifactForAudit(admin, artifactType, artifactId);
  } catch (err) {
    await markErrored(
      reviewId,
      err instanceof Error ? err.message : "load_failed"
    );
    return;
  }
  if (!artifact) {
    await markErrored(
      reviewId,
      `Artifact ${artifactType}/${artifactId} could not be loaded — likely missing body or not in 'complete' state.`
    );
    return;
  }

  // ── Run the three auditors in parallel ─────────────────────────
  const [claudeReport, chatgptReport, geminiReport] = await Promise.all([
    runClaudeAuditor(artifact),
    runChatGPTAuditor(artifact),
    runGeminiAuditor(artifact),
  ]);

  // Telemetry: one ai_usage_events row per auditor.
  logAuditor(claudeReport, "audit_council_claude", "anthropic", orgId, projectId);
  logAuditor(chatgptReport, "audit_council_chatgpt", "openai", orgId, projectId);
  logAuditor(geminiReport, "audit_council_gemini", "gemini", orgId, projectId);

  // ── Run the chair ──────────────────────────────────────────────
  const chairVerdict = await runChair([
    claudeReport,
    chatgptReport,
    geminiReport,
  ]);

  if (!chairVerdict.error) {
    logAiUsage({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      feature: "audit_council_chair",
      input_tokens: chairVerdict.usage.input_tokens,
      output_tokens: chairVerdict.usage.output_tokens,
      duration_ms: chairVerdict.usage.duration_ms,
      org_id: orgId,
      project_id: projectId,
      success: true,
    });
  }

  // ── Persist ────────────────────────────────────────────────────
  const cost_usd =
    sumCost(claudeReport, "anthropic", "claude-sonnet-4-6") +
    sumCost(chatgptReport, "openai", "gpt-4.1") +
    sumCost(geminiReport, "gemini", "gemini-2.5-pro") +
    sumCost(
      { model: "claude-haiku-4-5-20251001", usage: chairVerdict.usage },
      "anthropic",
      "claude-haiku-4-5-20251001"
    );

  const duration_ms = Date.now() - startedAt;

  // If every auditor errored AND the chair fell back, we still mark
  // status='complete' so the row appears in the inbox — but with a
  // non-null error_message and chair_verdict='flag' so ops sees it.
  const allErrored =
    Boolean(claudeReport.error) &&
    Boolean(chatgptReport.error) &&
    Boolean(geminiReport.error);

  const error_message = allErrored
    ? "All auditors errored. See per-auditor reports for vendor-specific causes."
    : chairVerdict.error ?? null;

  const { error: updateError } = await admin
    .from("audit_reviews")
    .update({
      status: "complete",
      claude_report: claudeReport,
      chatgpt_report: chatgptReport,
      gemini_report: geminiReport,
      chair_verdict: chairVerdict.verdict,
      chair_summary: chairVerdict.summary,
      agreement_score: chairVerdict.agreement_score,
      cost_usd,
      duration_ms,
      error_message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (updateError) {
    console.error(
      `[audit-council] failed to persist review ${reviewId}:`,
      updateError
    );
    await markErrored(reviewId, `persist_failed: ${updateError.message}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

async function markErrored(reviewId: string, message: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("audit_reviews")
    .update({
      status: "error",
      error_message: message.slice(0, 1000),
      completed_at: new Date().toISOString(),
    })
    .eq("id", reviewId);
}

function logAuditor(
  report: AuditorReport,
  feature:
    | "audit_council_claude"
    | "audit_council_chatgpt"
    | "audit_council_gemini",
  provider: "anthropic" | "openai" | "gemini",
  orgId: string,
  projectId: string | null
): void {
  logAiUsage({
    provider,
    model: report.model,
    feature,
    input_tokens: report.usage.input_tokens,
    output_tokens: report.usage.output_tokens,
    org_id: orgId,
    project_id: projectId,
    duration_ms: report.usage.duration_ms,
    success: !report.error,
    error_code: report.error ?? null,
  });
}



/**
 * Best-effort cost lookup for a single (provider, model, usage)
 * triple. Falls back to 0 if the model isn't in the pricing table —
 * we'd rather under-report cost than crash the council.
 */
function sumCost(
  report: { model?: string; usage: { input_tokens?: number; output_tokens?: number } },
  provider: "anthropic" | "openai" | "gemini",
  fallbackModel: string
): number {
  const model =
    typeof report.model === "string" && report.model.length > 0
      ? report.model
      : fallbackModel;
  try {
    return computeCost({
      provider,
      model,
      input_tokens: report.usage.input_tokens ?? 0,
      output_tokens: report.usage.output_tokens ?? 0,
    });
  } catch {
    return 0;
  }
}
