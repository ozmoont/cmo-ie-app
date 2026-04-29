/**
 * POST /api/admin/audit-council/trigger
 *
 * Phase 7b — manually trigger a council review for an artifact.
 * Two main use cases:
 *   1. Backfill: re-running the council on artifacts that completed
 *      before Phase 7 shipped.
 *   2. Re-review: an admin wants to re-run the council on an artifact
 *      after the auditors' prompts have been updated.
 *
 * Body: { artifact_type: AuditedArtifactType, artifact_id: string }
 *
 * If a review already exists for this (artifact_type, artifact_id),
 * we return its id and skip the enqueue (the audit_reviews unique
 * shape is enforced at the lib layer; trigger is idempotent).
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { enqueueAuditReview } from "@/lib/audit-council/enqueue";
import {
  loadArtifactForAudit,
} from "@/lib/audit-council/artifact-loaders";
import type { AuditedArtifactType } from "@/lib/audit-council/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const VALID_TYPES = new Set<AuditedArtifactType>([
  "seo_audit",
  "monthly_playbook",
  "action_plan",
  "brief",
  "brand_profile",
  "prompt_batch",
]);

interface RequestBody {
  artifact_type?: string;
  artifact_id?: string;
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.artifact_type || !body.artifact_id) {
    return NextResponse.json(
      { error: "artifact_type and artifact_id are required" },
      { status: 400 }
    );
  }
  if (!VALID_TYPES.has(body.artifact_type as AuditedArtifactType)) {
    return NextResponse.json(
      {
        error: `artifact_type must be one of: ${Array.from(VALID_TYPES).join(", ")}`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const artifactType = body.artifact_type as AuditedArtifactType;
  const artifactId = body.artifact_id;

  // Resolve the artifact to confirm it exists and pull the org_id /
  // project_id for the enqueue. Loaders return null for artifacts not
  // worth auditing (still pending / missing body); throw for
  // unsupported types (e.g. brief).
  let artifact;
  try {
    artifact = await loadArtifactForAudit(admin, artifactType, artifactId);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Cannot load artifact: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 400 }
    );
  }
  if (!artifact) {
    return NextResponse.json(
      {
        error:
          "Artifact not found, or not in a state worth auditing (still pending / failed / missing body).",
      },
      { status: 404 }
    );
  }
  if (!artifact.org_id) {
    return NextResponse.json(
      {
        error:
          "Artifact has no org_id — likely a legacy public-paid SEO audit. Backfill org_id before triggering.",
      },
      { status: 400 }
    );
  }

  // Run inside an after() block so the lambda stays alive past the
  // response. Customer-facing surface doesn't exist for this route
  // (it's admin-only), but the same pattern keeps the response fast.
  after(async () => {
    await enqueueAuditReview({
      artifactType,
      artifactId,
      orgId: artifact.org_id,
      projectId: artifact.project_id,
    });
  });

  return NextResponse.json({
    ok: true,
    message:
      "Council triggered. Refresh the inbox in ~30-60s to see the verdict.",
    artifact_type: artifactType,
    artifact_id: artifactId,
  });
}
