/**
 * GET /api/admin/skills
 *
 * Returns the list of skills + their current version info for the
 * admin overview page. Includes pending-learnings count so the admin
 * knows when there's a review queue to clear.
 *
 * PATCH /api/admin/skills
 *   body: { skill_id, status }
 *   Toggles status between draft / active / archived. Used by the
 *   admin to flip a skill live once they're happy with the upload.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const { data: skills } = await admin
    .from("skills")
    .select(
      "id, slug, name, description, price_eur_cents, status, current_version_id, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  const skillRows = (skills ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    price_eur_cents: number | null;
    status: string;
    current_version_id: string | null;
    created_at: string;
    updated_at: string;
  }>;

  // Pull current-version metadata + pending-learnings counts in one
  // round-trip per skill. Volume is small (one row per skill kind),
  // so we don't need a complex join — just iterate.
  const enriched = await Promise.all(
    skillRows.map(async (s) => {
      let currentVersion: {
        id: string;
        version_number: number;
        created_at: string;
      } | null = null;
      if (s.current_version_id) {
        const { data: v } = await admin
          .from("skill_versions")
          .select("id, version_number, created_at")
          .eq("id", s.current_version_id)
          .maybeSingle<{
            id: string;
            version_number: number;
            created_at: string;
          }>();
        currentVersion = v;
      }
      const { count: pendingLearnings } = await admin
        .from("skill_learnings")
        .select("*", { count: "exact", head: true })
        .eq("skill_id", s.id)
        .eq("status", "pending");
      const { count: totalVersions } = await admin
        .from("skill_versions")
        .select("*", { count: "exact", head: true })
        .eq("skill_id", s.id);

      return {
        ...s,
        current_version: currentVersion,
        pending_learnings: pendingLearnings ?? 0,
        total_versions: totalVersions ?? 0,
      };
    })
  );

  return NextResponse.json({ skills: enriched });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    skill_id?: string;
    status?: string;
  };

  if (!body.skill_id || !body.status) {
    return NextResponse.json(
      { error: "skill_id and status required" },
      { status: 400 }
    );
  }
  if (!["draft", "active", "archived"].includes(body.status)) {
    return NextResponse.json(
      { error: "status must be draft, active, or archived" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("skills")
    .update({
      status: body.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.skill_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
