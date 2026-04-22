import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/lib/types";
import { validateWebsiteUrl } from "@/lib/url-validation";

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

  // Validate the website URL upfront. A single comma in the hostname
  // ("www,howl.ie" instead of "www.howl.ie") silently breaks every
  // downstream extraction — the snapshot fetch fails, Claude has no
  // context, the profile goes "Unknown", and every generated prompt
  // becomes off-industry. Catch it at the form.
  let normalisedUrl: string | null = null;
  if (website_url && website_url.trim()) {
    const validation = validateWebsiteUrl(website_url);
    if (!validation.ok) {
      return NextResponse.json(
        { error: `Invalid website URL: ${validation.error}` },
        { status: 400 }
      );
    }
    normalisedUrl = validation.normalised;
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

  // Migration 006 split brand identity into display_name / tracked_name /
  // aliases / domains. The legacy `brand_name` column stays as the user-
  // facing canonical label; the matching-layer fields default from it so
  // the project is usable immediately without extra onboarding steps.
  // brand_aliases / brand_domains have schema defaults but we seed
  // brand_domains from the website_url so the "your_own" classifier
  // flag starts correct on day one.
  const seedDomain = normalisedUrl
    ? (() => {
        try {
          return new URL(normalisedUrl).hostname
            .replace(/^www\./i, "")
            .toLowerCase();
        } catch {
          return null;
        }
      })()
    : null;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      org_id: profile.org_id,
      name,
      brand_name,
      website_url: normalisedUrl,
      brand_display_name: brand_name,
      brand_tracked_name: brand_name,
      brand_domains: seedDomain ? [seedDomain] : [],
      country_codes: country_codes || ["IE"],
      // Default to the four adapter-implemented models. google_aio is
      // unimplemented — leaving it off prevents a confusing "No model
      // adapters available" run error on a fresh project.
      models: models || ["claude", "chatgpt", "perplexity", "gemini"],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
