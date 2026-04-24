/**
 * GET /api/projects/[id]/competitors/suggestions
 *
 * Returns pending competitor suggestions for a project — brands the
 * run engine has seen mentioned repeatedly but that aren't tracked.
 * Filtered by mention_count >= SUGGESTION_THRESHOLD (2). Sorted most-
 * mentioned first.
 *
 * Auth: signed-in member of the project's org (RLS enforced on the
 * underlying select via the user-scoped Supabase client).
 *
 * POST /api/projects/[id]/competitors/suggestions
 *   body: { suggestionId: string, action: "track" | "reject" }
 *
 *   - action=track   → create a competitor row with the suggestion's
 *                      brand name, mark the suggestion as 'tracked'
 *                      and link competitor_id, returns both rows
 *   - action=reject  → mark the suggestion 'rejected' (won't be
 *                      re-suggested even if it shows up again)
 *
 * We use the admin client for the write half so we can update both
 * competitor_suggestions and competitors atomically without worrying
 * about RLS policies on the former (which is service-role-only).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPendingSuggestions,
} from "@/lib/competitor-suggestions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the caller has access to this project (RLS on projects).
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const suggestions = await getPendingSuggestions(supabase, projectId, {
    limit: 20,
  });

  return NextResponse.json({ suggestions });
}

interface ActionBody {
  suggestionId?: string;
  action?: "track" | "reject";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Access check via RLS-guarded select.
  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as ActionBody;
  if (!body.suggestionId || !body.action) {
    return NextResponse.json(
      { error: "suggestionId and action are required" },
      { status: 400 }
    );
  }
  if (body.action !== "track" && body.action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'track' or 'reject'" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Fetch the suggestion to confirm it belongs to this project — we
  // don't want a stray suggestionId from another project slipping
  // through because the admin client bypasses RLS.
  const { data: suggestion } = await admin
    .from("competitor_suggestions")
    .select("id, project_id, brand_name, status")
    .eq("id", body.suggestionId)
    .eq("project_id", projectId)
    .maybeSingle<{
      id: string;
      project_id: string;
      brand_name: string;
      status: string;
    }>();

  if (!suggestion) {
    return NextResponse.json(
      { error: "Suggestion not found" },
      { status: 404 }
    );
  }

  if (suggestion.status !== "pending") {
    return NextResponse.json(
      { error: `Suggestion already ${suggestion.status}` },
      { status: 409 }
    );
  }

  if (body.action === "reject") {
    await admin
      .from("competitor_suggestions")
      .update({ status: "rejected" })
      .eq("id", suggestion.id);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // action === "track": create a competitor row, then link.
  // tracked_name defaults to the brand_name; user can rename later
  // on the Competitors page. website_url is left null — the user can
  // add it in the same row-edit flow.
  const { data: competitor, error: compError } = await admin
    .from("competitors")
    .insert({
      project_id: projectId,
      name: suggestion.brand_name,
      tracked_name: suggestion.brand_name,
      display_name: suggestion.brand_name,
      website_url: null,
    })
    .select()
    .single();

  if (compError || !competitor) {
    console.error("Track-suggestion insert failed:", compError);
    return NextResponse.json(
      { error: `Failed to create competitor: ${compError?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  await admin
    .from("competitor_suggestions")
    .update({
      status: "tracked",
      competitor_id: competitor.id,
    })
    .eq("id", suggestion.id);

  return NextResponse.json({
    ok: true,
    status: "tracked",
    competitor,
  });
}
