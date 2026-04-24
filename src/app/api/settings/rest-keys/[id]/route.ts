/**
 * PATCH /api/settings/rest-keys/[id]
 *
 * Soft-revoke an API key by setting `revoked_at = NOW()`. Body is
 * empty — this is purely "flip to revoked". We keep the row so usage
 * history stays queryable.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", profile.org_id);
  if (error) {
    console.error("revoke rest key failed:", error);
    return NextResponse.json({ error: "Failed to revoke" }, { status: 500 });
  }
  return NextResponse.json({ revoked: true });
}
