import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Auth check
    const supabase = await createClient();
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
        { error: "No organisation found" },
        { status: 400 }
      );
    }

    const { brief, draft, actionTitle, contactEmail, notes } =
      await request.json();

    if (!brief || !actionTitle || !contactEmail) {
      return NextResponse.json(
        { error: "brief, actionTitle, and contactEmail are required" },
        { status: 400 }
      );
    }

    // Insert polish request
    const { data: polishRequest, error } = await supabase
      .from("polish_requests")
      .insert({
        project_id: projectId,
        org_id: profile.org_id,
        brief_text: brief,
        draft_text: draft || null,
        action_title: actionTitle,
        contact_email: contactEmail,
        notes: notes || null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      requestId: polishRequest.id,
    });
  } catch (error) {
    console.error("Polish request creation error:", error);
    return NextResponse.json(
      { error: "Failed to create polish request" },
      { status: 500 }
    );
  }
}
