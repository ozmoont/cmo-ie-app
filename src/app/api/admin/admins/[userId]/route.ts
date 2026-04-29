/**
 * DELETE /api/admin/admins/[userId]
 *
 * Revoke a user's super-admin flag. Only revokes the DB-backed
 * grant; env-list admins must be removed from CMO_ADMIN_EMAILS on
 * Vercel and require a redeploy.
 *
 * Safety rails:
 *   - Cannot revoke yourself (the requireAdmin caller). Otherwise an
 *     admin could lock themselves out, then have to chase through
 *     Vercel env to recover.
 *   - 404 if the user has no profile row.
 *   - No-op (returns ok=true) if the flag was already false — keeps
 *     the UI's "revoke" button idempotent.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const { userId } = await params;

  if (userId === auth.user.id) {
    return NextResponse.json(
      {
        error:
          "You can't revoke your own admin access from here. Have another admin do it, or remove your email from CMO_ADMIN_EMAILS on Vercel.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, is_super_admin")
    .eq("id", userId)
    .maybeSingle<{ id: string; is_super_admin: boolean }>();
  if (!profile) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 }
    );
  }
  if (!profile.is_super_admin) {
    return NextResponse.json({
      ok: true,
      message: "Already not an admin — no change.",
    });
  }

  const { error } = await admin
    .from("profiles")
    .update({
      is_super_admin: false,
      super_admin_granted_at: null,
      super_admin_granted_by: null,
    })
    .eq("id", profile.id);

  if (error) {
    return NextResponse.json(
      { error: `Revoke failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
