/**
 * GET /api/agency/allocations
 *   Returns the agency pool status + every project's usage + cap.
 *   Owner/admin only. Agency-tier orgs only — returns 400 otherwise.
 *
 * PATCH /api/agency/allocations
 *   Body: { project_id: string, monthly_cap: number | null }
 *   Upserts the per-project cap. `null` = uncapped within pool.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgBriefCredits } from "@/lib/queries";

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
      { error: "Only owners/admins can manage allocations" },
      { status: 403 }
    );
  }

  const pool = await getOrgBriefCredits(profile.org_id);
  if (pool.plan !== "agency") {
    return NextResponse.json(
      {
        error:
          "Allocations are only available on the agency plan. Upgrade from Settings.",
      },
      { status: 400 }
    );
  }

  // List projects with their per-project cap.
  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, name, brand_name, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });
  if (projErr) {
    console.error("allocations list projects failed:", projErr);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const projectIds = (projects ?? []).map((p) => p.id as string);
  const allocationsById = new Map<
    string,
    { monthly_cap: number | null; monthly_cap_used: number }
  >();
  if (projectIds.length > 0) {
    const { data: allocs } = await supabase
      .from("project_credit_allocations")
      .select("project_id, monthly_cap, monthly_cap_used")
      .in("project_id", projectIds);
    for (const a of allocs ?? []) {
      allocationsById.set(a.project_id as string, {
        monthly_cap: a.monthly_cap as number | null,
        monthly_cap_used: a.monthly_cap_used as number,
      });
    }
  }

  const rows = (projects ?? []).map((p) => {
    const a = allocationsById.get(p.id as string);
    return {
      project_id: p.id,
      name: p.name,
      brand_name: p.brand_name,
      monthly_cap: a?.monthly_cap ?? null,
      monthly_cap_used: a?.monthly_cap_used ?? 0,
    };
  });

  return NextResponse.json({
    pool: {
      total: pool.limit,
      used: pool.used,
      remaining: pool.remaining,
      reset_at: pool.resetAt,
    },
    projects: rows,
  });
}

export async function PATCH(request: Request) {
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
      { error: "Only owners/admins can edit allocations" },
      { status: 403 }
    );
  }

  let body: { project_id?: string; monthly_cap?: number | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = body.project_id;
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    );
  }

  // Confirm the project belongs to the user's org.
  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .maybeSingle<{ id: string; org_id: string }>();
  if (!project || project.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const cap: number | null =
    body.monthly_cap === null || body.monthly_cap === undefined
      ? null
      : typeof body.monthly_cap === "number" &&
          Number.isFinite(body.monthly_cap) &&
          body.monthly_cap >= 0
        ? Math.floor(body.monthly_cap)
        : null;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("project_credit_allocations")
    .select("project_id, monthly_cap_used")
    .eq("project_id", projectId)
    .maybeSingle<{ project_id: string; monthly_cap_used: number }>();
  if (existing) {
    const { error } = await admin
      .from("project_credit_allocations")
      .update({ monthly_cap: cap, updated_at: new Date().toISOString() })
      .eq("project_id", projectId);
    if (error) {
      console.error("allocation update failed:", error);
      return NextResponse.json({ error: "Internal" }, { status: 500 });
    }
  } else {
    const { error } = await admin
      .from("project_credit_allocations")
      .insert({
        project_id: projectId,
        monthly_cap: cap,
        monthly_cap_used: 0,
      });
    if (error) {
      console.error("allocation insert failed:", error);
      return NextResponse.json({ error: "Internal" }, { status: 500 });
    }
  }

  return NextResponse.json({
    project_id: projectId,
    monthly_cap: cap,
  });
}
