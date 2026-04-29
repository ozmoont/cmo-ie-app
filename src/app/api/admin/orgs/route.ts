/**
 * GET /api/admin/orgs
 *
 * Admin-only org list with comp + trial + plan + signup info.
 * Optional `q` filter searches name + slug + admin user emails.
 *
 * Used by /admin/orgs to render the comp-credits + trial-extension
 * management UI. Customer never sees this.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trial_ends_at: string | null;
  trial_extended_to: string | null;
  comp_seo_audits: number | null;
  comp_brief_credits: number | null;
  comp_notes: string | null;
  comp_granted_by: string | null;
  comp_granted_at: string | null;
  brief_credits_used: number | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  org_id: string;
  full_name: string | null;
  role: string;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200
  );

  const admin = createAdminClient();

  // Base orgs query — server-side ilike on name + slug. Email match is
  // resolved client-side after the user list is fetched (auth schema
  // join via REST is awkward).
  let query = admin
    .from("organisations")
    .select(
      "id, name, slug, plan, trial_ends_at, trial_extended_to, comp_seo_audits, comp_brief_credits, comp_notes, comp_granted_by, comp_granted_at, brief_credits_used, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q && !q.includes("@")) {
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data: orgs, error } = await query.returns<OrgRow[]>();
  if (error) {
    return NextResponse.json(
      { error: `Failed to load orgs: ${error.message}` },
      { status: 500 }
    );
  }

  // Pull all profiles + auth users so we can render at least one
  // member email per org. Single page covers our scale.
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, org_id, full_name, role")
    .returns<ProfileRow[]>();
  const { data: usersPage } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const userById = new Map((usersPage?.users ?? []).map((u) => [u.id, u]));

  // Index profiles by org so we can attach owner emails to each row.
  const profilesByOrg = new Map<string, ProfileRow[]>();
  for (const p of profiles ?? []) {
    const list = profilesByOrg.get(p.org_id) ?? [];
    list.push(p);
    profilesByOrg.set(p.org_id, list);
  }

  let entries = (orgs ?? []).map((org) => {
    const orgProfiles = profilesByOrg.get(org.id) ?? [];
    // Prefer the owner; fall back to first profile.
    const owner = orgProfiles.find((p) => p.role === "owner") ?? orgProfiles[0];
    const ownerUser = owner ? userById.get(owner.id) : null;
    const granter = org.comp_granted_by
      ? userById.get(org.comp_granted_by)
      : null;
    return {
      ...org,
      owner_email: ownerUser?.email ?? null,
      owner_name: owner?.full_name ?? null,
      member_count: orgProfiles.length,
      granted_by_email: granter?.email ?? null,
    };
  });

  // Email-based search runs client-side over the resolved owner_email.
  // Cheap at our scale; saves us a JOIN through Supabase REST.
  if (q && q.includes("@")) {
    entries = entries.filter((e) =>
      (e.owner_email ?? "").toLowerCase().includes(q)
    );
  }

  return NextResponse.json({
    orgs: entries,
    total: entries.length,
    current_user_id: auth.user.id,
  });
}
