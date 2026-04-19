import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get user's org
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!profile?.org_id) {
      return NextResponse.json(
        { error: "Organisation not found" },
        { status: 400 }
      );
    }

    // Use admin client to delete org (RLS would block it)
    // This cascades to projects, prompts, competitors, daily_runs, results, citations
    const admin = createAdminClient();

    // Delete the organisation
    const { error: orgError } = await admin
      .from("organisations")
      .delete()
      .eq("id", profile.org_id);

    if (orgError) {
      console.error("Error deleting organisation:", orgError);
      return NextResponse.json(
        { error: "Failed to delete organisation" },
        { status: 500 }
      );
    }

    // Delete the auth user
    const { error: authError } = await admin.auth.admin.deleteUser(user.id);

    if (authError) {
      console.error("Error deleting auth user:", authError);
      return NextResponse.json(
        { error: "Failed to delete user account" },
        { status: 500 }
      );
    }

    // Sign out the user
    await supabase.auth.signOut();

    return NextResponse.json(
      { message: "Account deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in delete account:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
