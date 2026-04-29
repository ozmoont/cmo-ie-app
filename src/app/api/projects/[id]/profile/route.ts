/**
 * Brand profile CRUD.
 *
 * GET /api/projects/[id]/profile
 *   Returns the stored BrandProfile. If nothing is stored yet and a
 *   website is available, attempts to extract and persist one before
 *   returning. On extraction failure, returns nulls — the UI then shows
 *   an empty editable form.
 *
 * PUT /api/projects/[id]/profile
 *   Body: { short_description, market_segment, brand_identity,
 *   target_audience, products_services }. Updates the stored profile
 *   and bumps profile_updated_at. User corrections go here.
 */

import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractBrandProfile,
  normaliseProfile,
  type BrandProfile,
} from "@/lib/brand-profile";
import { enqueueAuditReview } from "@/lib/audit-council/enqueue";

interface ProfileRow {
  id: string;
  org_id: string;
  brand_name: string;
  website_url: string | null;
  brand_tracked_name: string | null;
  profile_short_description: string | null;
  profile_market_segment: string | null;
  profile_brand_identity: string | null;
  profile_target_audience: string | null;
  profile_products_services:
    | { name: string; description: string }[]
    | null;
  profile_updated_at: string | null;
}

function rowToProfile(row: ProfileRow): BrandProfile {
  return {
    short_description: row.profile_short_description ?? "",
    market_segment: row.profile_market_segment ?? "",
    brand_identity: row.profile_brand_identity ?? "",
    target_audience: row.profile_target_audience ?? "",
    products_services: row.profile_products_services ?? [],
  };
}

function profileIsPopulated(row: ProfileRow): boolean {
  return Boolean(
    row.profile_short_description &&
      row.profile_short_description.trim().length > 0
  );
}

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

  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, org_id, brand_name, website_url, brand_tracked_name, profile_short_description, profile_market_segment, profile_brand_identity, profile_target_audience, profile_products_services, profile_updated_at"
    )
    .eq("id", projectId)
    .maybeSingle<ProfileRow>();

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // If profile exists already, return it directly.
  if (profileIsPopulated(project)) {
    return NextResponse.json({
      profile: rowToProfile(project),
      profile_updated_at: project.profile_updated_at,
      auto_extracted: false,
    });
  }

  // Else: attempt a one-off extraction and persist it. Surface
  // auto_extracted=true so the UI can prompt the user to review.
  if (project.website_url) {
    const extracted = await extractBrandProfile(
      project.brand_tracked_name || project.brand_name,
      project.website_url
    );
    if (extracted && extracted.short_description) {
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
        console.error("profile GET: failed to persist extraction:", updateError);
      }

      // Phase 7b — Audit Council on the auto-extracted profile.
      // First-time extraction is the high-risk path (Claude inferring
      // industry from page content); a council review catches segment
      // mismatches at the root before any prompts/plans are derived.
      after(async () => {
        await enqueueAuditReview({
          artifactType: "brand_profile",
          artifactId: project.id,
          orgId: project.org_id,
          projectId: project.id,
        });
      });

      return NextResponse.json({
        profile: extracted,
        profile_updated_at: now,
        auto_extracted: true,
      });
    }
  }

  // Nothing to return. This happens when: (a) no website_url on the
  // project, (b) extractBrandProfile returned null (site blocked our
  // fetch, returned non-HTML, or came back too thin). Either way, hand
  // back an empty-but-valid profile plus an `extraction_failed` flag
  // so the UI tells the user "fill this in manually" instead of
  // silently showing "Unknown" like it did yesterday.
  return NextResponse.json({
    profile: {
      short_description: "",
      market_segment: "",
      brand_identity: "",
      target_audience: "",
      products_services: [],
    } as BrandProfile,
    profile_updated_at: null,
    auto_extracted: false,
    extraction_failed: Boolean(project.website_url),
    website_url: project.website_url,
  });
}

export async function PUT(
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
  const profile = normaliseProfile(body);

  const { data, error } = await supabase
    .from("projects")
    .update({
      profile_short_description: profile.short_description,
      profile_market_segment: profile.market_segment,
      profile_brand_identity: profile.brand_identity,
      profile_target_audience: profile.target_audience,
      profile_products_services: profile.products_services,
      profile_updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .select(
      "profile_short_description, profile_market_segment, profile_brand_identity, profile_target_audience, profile_products_services, profile_updated_at"
    )
    .maybeSingle();

  if (error || !data) {
    console.error("profile PUT failed:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({
    profile: {
      short_description: data.profile_short_description ?? "",
      market_segment: data.profile_market_segment ?? "",
      brand_identity: data.profile_brand_identity ?? "",
      target_audience: data.profile_target_audience ?? "",
      products_services: data.profile_products_services ?? [],
    } as BrandProfile,
    profile_updated_at: data.profile_updated_at,
  });
}
