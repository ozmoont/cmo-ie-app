import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's profile and org
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, full_name")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json(
      { error: "No organisation found" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { full_name, org_name } = body;

  // Update profile full_name if provided
  if (full_name !== undefined) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name })
      .eq("id", user.id);

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }
  }

  // Update org name if provided - use admin client to bypass RLS
  if (org_name !== undefined) {
    const admin = createAdminClient();
    const { error: orgError } = await admin
      .from("organisations")
      .update({ name: org_name })
      .eq("id", profile.org_id);

    if (orgError) {
      return NextResponse.json(
        { error: orgError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    {
      success: true,
      message: "Settings updated successfully",
    },
    { status: 200 }
  );
}
