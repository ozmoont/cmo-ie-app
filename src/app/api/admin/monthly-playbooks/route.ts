/**
 * Admin endpoints for the monthly playbook dashboard.
 *
 *   GET  /api/admin/monthly-playbooks
 *        → List recent playbooks for the caller's org.
 *   POST /api/admin/monthly-playbooks
 *        { project_id, month }
 *        → Generate-or-reuse the playbook for one project/month.
 *          Idempotent by default; pass ?force=1 to force regeneration.
 *
 * Access: owner / admin of the project's org. Service-role client
 * used for writes so we can create rows whose RLS "SELECT my org" is
 * read-only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateMonthlyPlaybook } from "@/lib/monthly-playbook";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle<{ org_id: string; role: string }>();
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No organisation" }, { status: 400 });
  }
  if (!["owner", "admin"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Only owners/admins can view playbooks" },
      { status: 403 }
    );
  }

  // List the last 12 months' playbooks for every project in the org.
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, brand_name")
    .eq("org_id", profile.org_id);
  const projectIds = (projects ?? []).map((p) => p.id as string);
  if (projectIds.length === 0) {
    return NextResponse.json({ projects: [], playbooks: [] });
  }

  const { data: playbooks } = await supabase
    .from("monthly_playbooks")
    .select(
      "id, project_id, month, subject, status, status_message, generated_at, sent_at"
    )
    .in("project_id", projectIds)
    .order("generated_at", { ascending: false })
    .limit(60);

  return NextResponse.json({
    projects: projects ?? [],
    playbooks: playbooks ?? [],
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle<{ org_id: string; role: string }>();
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No organisation" }, { status: 400 });
  }
  if (!["owner", "admin"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Only owners/admins can generate playbooks" },
      { status: 403 }
    );
  }

  let body: {
    project_id?: string;
    month?: string;
    force?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = body.project_id;
  if (!projectId) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    );
  }

  // Confirm project belongs to caller's org.
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle<{ org_id: string }>();
  if (!project || project.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const monthIso = body.month ?? firstOfThisMonth().toISOString().slice(0, 10);
  const monthDate = new Date(`${monthIso}T00:00:00Z`);
  if (Number.isNaN(monthDate.valueOf())) {
    return NextResponse.json(
      { error: "Invalid month (expected yyyy-mm-dd)" },
      { status: 400 }
    );
  }

  try {
    const playbook = await generateMonthlyPlaybook(projectId, monthDate, {
      force: body.force === true,
    });
    return NextResponse.json({ playbook });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("admin playbook generate failed:", message);
    return NextResponse.json(
      { error: `Generation failed: ${message}` },
      { status: 500 }
    );
  }
}

function firstOfThisMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
