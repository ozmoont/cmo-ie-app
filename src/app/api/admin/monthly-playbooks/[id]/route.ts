/**
 * GET /api/admin/monthly-playbooks/[id]
 *   → Full playbook row including body_markdown + raw_input.
 *
 * Admin view only; RLS already scopes SELECT to the caller's org.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
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
    return NextResponse.json(
      { error: "Only owners/admins can view playbooks" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const { data, error } = await supabase
    .from("monthly_playbooks")
    .select(
      "id, project_id, month, subject, body_markdown, recipients, status, status_message, generated_at, sent_at, raw_input"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("admin playbook detail failed:", error);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ playbook: data });
}
