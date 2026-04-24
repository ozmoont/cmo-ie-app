import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // ── Resolve the user's organisation ──────────────────────────────
  // The canonical path is a user-authed SELECT from `profiles`. On a
  // fresh signup this sometimes returns nothing because the v1 RLS
  // policy on `profiles` is self-referential (see migration 001).
  // When the user-authed lookup comes up empty we cross-check via the
  // service-role admin client so we can give a precise reason instead
  // of the opaque "No organisation found" we used to throw.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle<{ org_id: string | null }>();

  if (profileErr) {
    console.error("projects POST — profile lookup error:", {
      user_id: user.id,
      email: user.email,
      error: profileErr,
    });
  }

  let orgId = profile?.org_id ?? null;

  if (!orgId) {
    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("id, org_id")
      .eq("id", user.id)
      .maybeSingle<{ id: string; org_id: string | null }>();

    console.error("projects POST — user-authed profile empty:", {
      user_id: user.id,
      email: user.email,
      admin_profile: adminProfile,
    });

    if (!adminProfile) {
      return NextResponse.json(
        {
          error:
            "Your profile row is missing from public.profiles. Run the repair SQL from the chat, then retry.",
        },
        { status: 400 }
      );
    }
    if (!adminProfile.org_id) {
      return NextResponse.json(
        {
          error:
            "Your profile exists but isn't linked to an organisation. Run the repair SQL, then retry.",
        },
        { status: 400 }
      );
    }

    // Profile + org both exist via admin — RLS is hiding them. Fall
    // back to the admin-resolved org_id so the user can proceed.
    console.warn(
      "projects POST — RLS is masking the user's own profile. " +
        "Run the 'Users can view own profile' policy. Falling back to admin lookup."
    );
    orgId = adminProfile.org_id;
  }

  // ── Validate body ───────────────────────────────────────────────
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
  // downstream extraction — catch it at the form.
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

  // ── Plan limit check ────────────────────────────────────────────
  // Use the admin client so RLS can't occlude the org row either.
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organisations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle<{ plan: string }>();

  if (!org) {
    return NextResponse.json(
      { error: "Organisation not found" },
      { status: 400 }
    );
  }

  const planLimits = PLAN_LIMITS[org.plan as keyof typeof PLAN_LIMITS];
  const { count: projectCount } = await admin
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);

  if (projectCount !== null && projectCount >= planLimits.projects) {
    return NextResponse.json(
      {
        error: `Project limit reached. Your ${org.plan} plan allows ${planLimits.projects} project(s). Upgrade to create more.`,
      },
      { status: 403 }
    );
  }

  // ── Insert ──────────────────────────────────────────────────────
  // Migration 006 split brand identity into display_name / tracked_name /
  // aliases / domains. Legacy `brand_name` stays as the user-facing
  // canonical label; matching-layer fields default from it so the
  // project is usable immediately.
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
      org_id: orgId,
      name,
      brand_name,
      website_url: normalisedUrl,
      brand_display_name: brand_name,
      brand_tracked_name: brand_name,
      brand_domains: seedDomain ? [seedDomain] : [],
      country_codes: country_codes || ["IE"],
      // google_aio is unimplemented — off by default to avoid the
      // confusing "No model adapters available" error on a fresh project.
      models: models || ["claude", "chatgpt", "perplexity", "gemini"],
    })
    .select()
    .single();

  if (error) {
    console.error("projects POST — insert failed:", {
      user_id: user.id,
      org_id: orgId,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
