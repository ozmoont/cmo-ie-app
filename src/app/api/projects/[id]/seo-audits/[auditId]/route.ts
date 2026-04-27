/**
 * GET /api/projects/[id]/seo-audits/[auditId]
 *   Single-audit fetch used by the SEO tab to poll progress while a
 *   run is in flight. Returns status + progress_step + progress_percent
 *   for the in-flight loader, plus the full report once status='complete'.
 *
 * DELETE /api/projects/[id]/seo-audits/[auditId]
 *   Removes a single audit row. Used by the SEO tab to clean up
 *   failed / stuck rows. We allow deletion on any status — there's no
 *   reason to forbid deleting a complete report from the user's own
 *   project.
 *
 * Auth: signed-in user with access to the project (RLS-gated).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; auditId: string }> }
) {
  const { id: projectId, auditId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify project access.
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: audit } = await admin
    .from("seo_audits")
    .select(
      "id, site_url, status, source, progress_step, progress_percent, report_markdown, report_summary, error_message, created_at, generated_at"
    )
    .eq("id", auditId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  return NextResponse.json({ audit });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; auditId: string }> }
) {
  const { id: projectId, auditId } = await params;

  // Auth + project access via RLS-gated SELECT — confirms the caller
  // belongs to the project's org before we let them delete.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Use admin to actually delete — seo_audits is service-role-only RLS.
  // We've already confirmed access via the RLS-gated project SELECT
  // above, so the auditId+projectId match below is the real authz.
  const admin = createAdminClient();
  const { data: deleted, error } = await admin
    .from("seo_audits")
    .delete()
    .eq("id", auditId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Delete failed: ${error.message}` },
      { status: 500 }
    );
  }
  if (!deleted) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: deleted.id });
}
