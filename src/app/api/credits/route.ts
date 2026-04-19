import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getOrgBriefCredits } from "@/lib/queries";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const org = Array.isArray(profile.organisations)
      ? profile.organisations[0]
      : profile.organisations;

    if (!org) {
      return NextResponse.json(
        { error: "Organisation not found" },
        { status: 404 }
      );
    }

    const credits = await getOrgBriefCredits(org.id);

    return NextResponse.json(credits);
  } catch (error) {
    console.error("Credits API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
