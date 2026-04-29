/**
 * /api/admin/admins
 *
 * Manage the list of CMO.ie super-admins.
 *
 *   GET    — list every admin (env-list + DB-flagged), unioned.
 *   POST   — body: { email } — find auth user by email, set
 *            profiles.is_super_admin = TRUE.
 *
 * Self-revocation is blocked at DELETE (see [userId]/route.ts).
 * Env-list admins can't be revoked from here — that requires editing
 * CMO_ADMIN_EMAILS on Vercel. The UI surfaces them as read-only rows
 * tagged "env" so the operator knows where the access came from.
 *
 * Source: docs/phase-7-audit-council.md (admin landing section).
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  full_name: string | null;
  is_super_admin: boolean;
  super_admin_granted_at: string | null;
  super_admin_granted_by: string | null;
}

interface AdminEntry {
  user_id: string | null;
  email: string;
  full_name: string | null;
  /** "env" = listed in CMO_ADMIN_EMAILS, "db" = profiles.is_super_admin. */
  source: "env" | "db";
  granted_at: string | null;
  granted_by_email: string | null;
}

function envAdminList(): string[] {
  return (process.env.CMO_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// ── GET ──────────────────────────────────────────────────────────

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const admin = createAdminClient();
  const envEmails = envAdminList();

  // DB-flagged admins.
  const { data: dbAdmins } = await admin
    .from("profiles")
    .select(
      "id, full_name, is_super_admin, super_admin_granted_at, super_admin_granted_by"
    )
    .eq("is_super_admin", true)
    .returns<ProfileRow[]>();

  // We need emails — those live on auth.users, not profiles. Pull
  // them via the admin auth API. listUsers is paged; for our scale
  // (handful of users) one page is plenty.
  const { data: usersPage } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const users = usersPage?.users ?? [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const userByEmail = new Map(
    users
      .map((u) => (u.email ? [u.email.toLowerCase(), u] as const : null))
      .filter((p): p is readonly [string, (typeof users)[number]] => p !== null)
  );

  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const entries: AdminEntry[] = [];

  // DB-backed admins first — they're the manageable set.
  for (const row of dbAdmins ?? []) {
    const u = userById.get(row.id);
    if (!u) continue;
    seenIds.add(row.id);
    if (u.email) seenEmails.add(u.email.toLowerCase());
    const granter = row.super_admin_granted_by
      ? userById.get(row.super_admin_granted_by)
      : null;
    entries.push({
      user_id: row.id,
      email: u.email ?? "",
      full_name: row.full_name,
      source: "db",
      granted_at: row.super_admin_granted_at,
      granted_by_email: granter?.email ?? null,
    });
  }

  // Env-list admins — surface as read-only rows. If their email
  // matches a DB-flagged admin we've already added, skip the dupe.
  for (const email of envEmails) {
    if (seenEmails.has(email)) continue;
    const u = userByEmail.get(email);
    entries.push({
      user_id: u?.id ?? null,
      email,
      full_name:
        (u?.user_metadata?.full_name as string | undefined) ?? null,
      source: "env",
      granted_at: null,
      granted_by_email: null,
    });
  }

  return NextResponse.json({
    admins: entries,
    /** Echoed back so the UI can render "you can't revoke yourself". */
    current_user_id: auth.user.id,
    current_user_email: auth.user.email ?? null,
  });
}

// ── POST (grant by email) ────────────────────────────────────────

interface GrantBody {
  email?: string;
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  let body: GrantBody;
  try {
    body = (await request.json()) as GrantBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const targetEmail =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!targetEmail || !targetEmail.includes("@")) {
    return NextResponse.json(
      { error: "Provide a valid email." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Find the auth user. listUsers is paged; one page covers our scale.
  const { data: usersPage } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const target = (usersPage?.users ?? []).find(
    (u) => u.email?.toLowerCase() === targetEmail
  );
  if (!target) {
    return NextResponse.json(
      {
        error:
          "No user with that email exists yet. They need to sign up first (or you can invite them via Supabase → Authentication → Users → Invite user), then grant admin here.",
      },
      { status: 404 }
    );
  }

  // Confirm a profiles row exists. If somehow missing, refuse — the
  // grant flag lives on profiles, not auth.users, and we don't want
  // to silently create a half-state row.
  const { data: profile } = await admin
    .from("profiles")
    .select("id, is_super_admin")
    .eq("id", target.id)
    .maybeSingle<{ id: string; is_super_admin: boolean }>();
  if (!profile) {
    return NextResponse.json(
      {
        error:
          "User exists in auth but has no profile row. Most likely they signed up before the profiles migration; have them re-sign-up or seed a profile row for them in Supabase.",
      },
      { status: 422 }
    );
  }

  if (profile.is_super_admin) {
    return NextResponse.json({
      ok: true,
      message: "Already an admin — no change.",
      user_id: profile.id,
    });
  }

  const { error } = await admin
    .from("profiles")
    .update({
      is_super_admin: true,
      super_admin_granted_at: new Date().toISOString(),
      super_admin_granted_by: auth.user.id,
    })
    .eq("id", profile.id);

  if (error) {
    return NextResponse.json(
      { error: `Grant failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    user_id: profile.id,
    email: targetEmail,
  });
}
