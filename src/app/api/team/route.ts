import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

// GET: List team members in the user's organisation
export async function GET() {
  const supabase = await createClient();

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Get all profiles in the org with their auth email
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // For each profile, fetch their auth email
  const admin = createAdminClient();
  const teamMembers = await Promise.all(
    (profiles || []).map(async (p: Profile) => {
      const { data: authUser, error: authError } =
        await admin.auth.admin.getUserById(p.id);

      return {
        id: p.id,
        fullName: p.full_name,
        email: authError ? "(email unavailable)" : authUser?.user?.email,
        role: p.role,
        createdAt: p.created_at,
      };
    })
  );

  return NextResponse.json(teamMembers);
}

// POST: Invite a new member to the organisation
export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is owner or admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json(
      { error: "Organisation not found" },
      { status: 400 }
    );
  }

  if (profile.role !== "owner" && profile.role !== "admin") {
    return NextResponse.json(
      { error: "Only owners and admins can invite members" },
      { status: 403 }
    );
  }

  const { email, role } = await request.json();

  if (!email || !role) {
    return NextResponse.json(
      { error: "email and role are required" },
      { status: 400 }
    );
  }

  if (!["owner", "admin", "member"].includes(role)) {
    return NextResponse.json(
      { error: "Invalid role. Must be owner, admin, or member" },
      { status: 400 }
    );
  }

  try {
    // Use admin client to send invitation
    const admin = createAdminClient();

    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      return NextResponse.json(
        { error: inviteError.message },
        { status: 400 }
      );
    }

    // Create profile for the invited user
    if (inviteData?.user?.id) {
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: inviteData.user.id,
          org_id: profile.org_id,
          full_name: null,
          role,
        });

      if (profileError) {
        console.error("Error creating profile for invited user:", profileError);
        return NextResponse.json(
          { error: "Failed to create user profile" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        message: "Invitation sent",
        email,
        role,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error inviting user:", error);
    return NextResponse.json(
      { error: "Failed to invite user" },
      { status: 500 }
    );
  }
}
