/**
 * GET /api/admin/audit-council/reviews/[id]
 *
 * Phase 7b — single-review drill-down. Returns the audit_reviews row
 * with the three auditor reports + chair verdict + a re-loaded
 * artifact preview so the admin UI can render the original content
 * side-by-side with the council's verdict.
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { loadArtifactForAudit } from "@/lib/audit-council/artifact-loaders";
import type { AuditedArtifactType } from "@/lib/audit-council/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: review, error } = await admin
    .from("audit_reviews")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to load review: ${error.message}` },
      { status: 500 }
    );
  }
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  // Load the underlying artifact so the UI can render the original
  // content alongside the council's verdict. Caught + soft-failed:
  // a missing artifact (deleted while review still in DB) shouldn't
  // break the drill-down view.
  let artifact = null;
  try {
    artifact = await loadArtifactForAudit(
      admin,
      review.artifact_type as AuditedArtifactType,
      review.artifact_id
    );
  } catch (err) {
    console.warn(
      `[audit-council] artifact load failed for review ${id}:`,
      err
    );
  }

  // Pull the brand name + project name so the admin sees which
  // org/project this review belongs to without an extra join.
  const { data: project } = review.project_id
    ? await admin
        .from("projects")
        .select("brand_name, brand_tracked_name, name")
        .eq("id", review.project_id)
        .maybeSingle<{
          brand_name: string | null;
          brand_tracked_name: string | null;
          name: string | null;
        }>()
    : { data: null };

  return NextResponse.json({
    review,
    artifact,
    project: project
      ? {
          name: project.name,
          brand_name:
            project.brand_tracked_name ?? project.brand_name,
        }
      : null,
  });
}
