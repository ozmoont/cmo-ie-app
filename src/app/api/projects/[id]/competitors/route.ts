import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("competitors")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
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

  const body = await request.json();
  const { name, website_url, display_name, tracked_name, aliases, domains } =
    body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Derive a default domain from website_url if callers don't supply an
  // explicit `domains` array. Keeps the legacy "just type a URL" UX
  // working while the new schema (migration 006) stays authoritative.
  const normDomain = (u: string | null | undefined): string | null => {
    if (!u) return null;
    try {
      return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname
        .replace(/^www\./, "")
        .toLowerCase();
    } catch {
      return null;
    }
  };
  const seedDomain = normDomain(website_url);

  const { data, error } = await supabase
    .from("competitors")
    .insert({
      project_id: projectId,
      // Legacy name stays populated for back-compat with older queries.
      name,
      website_url: website_url || null,
      // Migration 006 fields. display_name + tracked_name default to
      // `name` so the quick-add flow keeps working; caller can override.
      display_name: display_name || name,
      tracked_name: tracked_name || name,
      aliases: Array.isArray(aliases) ? aliases : [],
      domains: Array.isArray(domains)
        ? domains
        : seedDomain
          ? [seedDomain]
          : [],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const competitorId = searchParams.get("competitorId");

  if (!competitorId) {
    return NextResponse.json(
      { error: "competitorId is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("competitors")
    .delete()
    .eq("id", competitorId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
