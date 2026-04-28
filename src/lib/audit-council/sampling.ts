/**
 * Phase 7 — sampling decisions.
 *
 * Some artifact types are too high-frequency to audit at 100% within
 * the monthly cost ceiling. v1 sampling rates:
 *
 *   100%: seo_audit, monthly_playbook, brand_profile, prompt_batch
 *    20%: action_plan, brief
 *
 * Sampling is deterministic on the artifact_id so the same artifact
 * always produces the same yes/no decision (idempotent re-trigger),
 * and we hit roughly the configured share over a large population.
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import { createHash } from "node:crypto";
import type { AuditedArtifactType } from "./types";

/**
 * Per-artifact-type audit rate. 1.0 = always audit; 0.2 = 20%.
 * Tuning these is the main knob for monthly cost.
 */
export const SAMPLING_RATES: Record<AuditedArtifactType, number> = {
  seo_audit: 1.0,
  monthly_playbook: 1.0,
  brand_profile: 1.0,
  prompt_batch: 1.0,
  action_plan: 0.2,
  brief: 0.2,
};

/**
 * Decide whether to audit a given artifact.
 *
 * Returns:
 *   • shouldAudit — whether the council should run for this row.
 *   • sampled     — whether this audit is "via sampling" (rate < 1.0).
 *                   Stored on the audit_reviews row so we can compare
 *                   flag rates between sampled and full-coverage paths.
 *
 * Determinism: hash(artifactType + artifactId) → 0..1 vs the rate. If
 * the rate is 1.0, we always audit and `sampled` is false.
 */
export function shouldAuditArtifact(
  artifactType: AuditedArtifactType,
  artifactId: string
): { shouldAudit: boolean; sampled: boolean } {
  const rate = SAMPLING_RATES[artifactType];

  if (rate >= 1) return { shouldAudit: true, sampled: false };
  if (rate <= 0) return { shouldAudit: false, sampled: false };

  // Deterministic 0-1 score from the artifact id. We use the first 8
  // hex chars of SHA-1 (32 bits) as an unsigned int, divided by 2^32.
  const digest = createHash("sha1")
    .update(`${artifactType}:${artifactId}`)
    .digest("hex")
    .slice(0, 8);
  const score = parseInt(digest, 16) / 0xffffffff;

  return { shouldAudit: score < rate, sampled: true };
}
