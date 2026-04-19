import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/lib/types";

export async function POST(request: Request) {
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
    return NextResponse.json({ error: "No organisation found" }, { status: 400 });
  }

  const body = await request.json();
  const { name, brand_name, website_url, country_codes, models } = body;

  if (!name || !brand_name) {
    return NextResponse.json(
      { error: "name and brand_name are required" },
      { status: 400 }
    );
  }

  // Check plan limits before inserting
  const { data: org } = await supabase
    .from("organisations")
    .select("plan")
    .eq("id", profile.org_id)
    .single();

  if (!org) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 400 });
  }

  const planLimits = PLAN_LIMITS[org.plan as keyof typeof PLAN_LIMITS];
  const { count: projectCount } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("org_id", profile.org_id);

  if (projectCount !== null && projectCount >= planLimits.projects) {
    return NextResponse.json(
      {
        error: `Project limit reached. Your ${org.plan} plan allows ${planLimits.projects} project(s). Please upgrade your plan to create more projects.`,
      },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      org_id: profile.org_id,
      name,
      brand_name,
      website_url: website_url || null,
      country_codes: country_codes || ["IE"],
      models: models || ["chatgpt", "perplexity", "google_aio"],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
