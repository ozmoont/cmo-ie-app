import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    .select("id, full_name, org_id, organisations(name, plan)")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const org = Array.isArray(profile.organisations)
    ? profile.organisations[0]
    : profile.organisations;

  return NextResponse.json({
    email: user.email,
    fullName: profile.full_name,
    orgName: org?.name,
    plan: org?.plan,
  });
}
