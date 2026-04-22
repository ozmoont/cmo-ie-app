/**
 * POST /api/projects/[id]/profile/regenerate
 *
 * Force a fresh extraction of the brand profile from the project's
 * website, overwriting whatever's currently stored. Escape hatch for
 * when the first auto-extraction got the brand wrong (most common
 * cause: Claude saw a case study / client reference on the homepage
 * and misclassified the tracked brand as being in the client's
 * industry).
 *
 * Separate from PUT /profile because PUT accepts user-supplied fields,
 * whereas this endpoint always fetches fresh from the website.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractBrandProfile } from "@/lib/brand-profile";

export async function POST(
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

  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, brand_name, brand_tracked_name, website_url"
    )
    .eq("id", projectId)
    .maybeSingle<{
      id: string;
      brand_name: string;
      brand_tracked_name: string | null;
      website_url: string | null;
    }>();

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!project.website_url) {
    return NextResponse.json(
      {
        error:
          "Project has no website_url — cannot re-extract. Edit the profile manually instead.",
      },
      { status: 400 }
    );
  }

  const extracted = await extractBrandProfile(
    project.brand_tracked_name || project.brand_name,
    project.website_url
  );

  if (!extracted || !extracted.short_description) {
    return NextResponse.json(
      {
        error:
          "Couldn't auto-extract the brand profile from " +
          project.website_url +
          ". Most likely cause: your site is blocking our fetch (Cloudflare bot-protection, Webflow rate limit, JS-rendered content with no server HTML) or the page came back empty. Check your server terminal for the exact reason — log lines like 'fetchSiteSnapshot: ... returned HTTP 403' or '... too thin (X chars)' will tell you. Fix by filling the profile manually via Edit below — that's faster than unblocking a bot.",
      },
      { status: 502 }
    );
  }

  // Persist via admin — RLS can block server-side writes in some
  // Supabase configs. Admin bypasses RLS cleanly for this trusted op.
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("projects")
    .update({
      profile_short_description: extracted.short_description,
      profile_market_segment: extracted.market_segment,
      profile_brand_identity: extracted.brand_identity,
      profile_target_audience: extracted.target_audience,
      profile_products_services: extracted.products_services,
      profile_updated_at: now,
    })
    .eq("id", projectId);

  if (updateError) {
    console.error("profile regenerate: update failed:", updateError);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({
    profile: extracted,
    profile_updated_at: now,
    re_extracted: true,
  });
}
