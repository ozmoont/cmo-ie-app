/**
 * Phase 7 — public entry for generators.
 *
 * Generators (seo-audit/run.ts, action-plan, brief, playbook, etc.)
 * call enqueueAuditReview() at the end of a successful generation.
 * The function:
 *   1. Rolls the sampling decision. If skipped, exits silently.
 *   2. Inserts an audit_reviews row in 'pending' status.
 *   3. Kicks off the council orchestrator. The orchestrator handles
 *      its own errors and writes 'error' status if anything blows up.
 *
 * Designed to be called from inside an `after()` block (Next.js 16)
 * so it never blocks the customer's response. Returns void; success +
 * failure are both observed via the audit_reviews row in the admin UI,
 * not via exceptions to the caller.
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { runCouncil } from "./council";
import { shouldAuditArtifact } from "./sampling";
import type { AuditedArtifactType } from "./types";

interface EnqueueArgs {
  artifactType: AuditedArtifactType;
  artifactId: string;
  orgId: string;
  /** Nullable — org-level artifacts have no project_id. */
  projectId?: string | null;
}

/**
 * Enqueue + run a council review for an artifact. Non-blocking from
 * the caller's perspective: errors are logged + persisted on the
 * audit_reviews row, never thrown.
 *
 * The orchestrator (`runCouncil`) is awaited inside this function but
 * the function itself runs inside an `after()` block at every call
 * site, so the customer-facing response has already been returned by
 * the time we get here.
 */
export async function enqueueAuditReview(args: EnqueueArgs): Promise<void> {
  const { artifactType, artifactId, orgId } = args;
  const projectId = args.projectId ?? null;

  // ── Sampling decision ────────────────────────────────────────
  const { shouldAudit, sampled } = shouldAuditArtifact(
    artifactType,
    artifactId
  );
  if (!shouldAudit) {
    // Silent skip. Don't even insert the row — sampling-skipped
    // artifacts produce zero rows so the inbox volume reflects
    // actual reviews, not the full universe of generations.
    return;
  }

  const admin = createAdminClient();

  // ── Idempotency: don't double-enqueue the same artifact ──────
  // If a generator fires enqueue twice (e.g. on a retry), we want
  // the second call to be a no-op rather than producing two reviews.
  const { data: existing } = await admin
    .from("audit_reviews")
    .select("id, status")
    .eq("artifact_type", artifactType)
    .eq("artifact_id", artifactId)
    .maybeSingle<{ id: string; status: string }>();

  if (existing) {
    // Already reviewed (or in flight). Leave it alone.
    return;
  }

  // ── Insert the pending row ───────────────────────────────────
  const { data: inserted, error: insertError } = await admin
    .from("audit_reviews")
    .insert({
      artifact_type: artifactType,
      artifact_id: artifactId,
      org_id: orgId,
      project_id: projectId,
      sampled,
      status: "pending",
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !inserted) {
    console.error(
      `[audit-council] failed to insert review row for ${artifactType}/${artifactId}:`,
      insertError
    );
    return;
  }

  // ── Run the orchestrator ─────────────────────────────────────
  // Awaited so the after() block keeps the lambda alive until the
  // council finishes. Errors are caught and persisted on the row by
  // the orchestrator itself.
  try {
    await runCouncil({
      reviewId: inserted.id,
      artifactType,
      artifactId,
      orgId,
      projectId,
    });
  } catch (err) {
    // Belt-and-braces — runCouncil already catches its own errors
    // and updates the row, but if an exception escapes, log + mark.
    console.error(
      `[audit-council] runCouncil for ${inserted.id} threw:`,
      err
    );
    await admin
      .from("audit_reviews")
      .update({
        status: "error",
        error_message:
          err instanceof Error ? err.message.slice(0, 1000) : "unknown",
        completed_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);
  }
}
