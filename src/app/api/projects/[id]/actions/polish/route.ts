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

    const { brief, draft, actionTitle, contactEmail, notes, gap } =
      await request.json();

    if (!brief || !actionTitle || !contactEmail) {
      return NextResponse.json(
        { error: "brief, actionTitle, and contactEmail are required" },
        { status: 400 }
      );
    }

    // Defensive normalisation — if a gap object was passed, ensure it
    // has the three required fields (scope / domain / captured_at) or
    // drop it rather than persisting a half-formed shape.
    let sourceGap: Record<string, unknown> | null = null;
    if (gap && typeof gap === "object") {
      const g = gap as Record<string, unknown>;
      const scope = g.scope;
      const domain = g.domain;
      if (
        (scope === "domain" || scope === "url") &&
        typeof domain === "string" &&
        domain.length > 0
      ) {
        sourceGap = {
          ...g,
          captured_at:
            typeof g.captured_at === "string"
              ? g.captured_at
              : new Date().toISOString(),
        };
      }
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
        source_gap: sourceGap,
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
