/**
 * Phase 6 helper — load a project + its brand profile in one shot for
 * the prompt-related API routes (generate / score / mirror).
 *
 * All three routes need the same thing: confirm the caller is auth'd,
 * confirm they belong to the project (via RLS-gated SELECT), and pull
 * the stored brand profile for the model prompt. Centralising the
 * lookup keeps the routes thin and consistent.
 */

import { createClient } from "@/lib/supabase/server";
import type { BrandProfile } from "@/lib/brand-profile";

export interface PromptProjectContext {
  project: {
    id: string;
    org_id: string;
    brand_name: string;
    brand_tracked_name: string | null;
    website_url: string | null;
  };
  /** Display name for prompts — uses tracked name if set, else brand name. */
  brandName: string;
  websiteUrl: string | null;
  /** Stored profile, or null if the project hasn't been profiled yet. */
  profile: BrandProfile | null;
  user: { id: string; email?: string | null } | null;
}

interface ProjectRow {
  id: string;
  org_id: string;
  brand_name: string;
  brand_tracked_name: string | null;
  website_url: string | null;
  profile_short_description: string | null;
  profile_market_segment: string | null;
  profile_brand_identity: string | null;
  profile_target_audience: string | null;
  profile_products_services:
    | { name: string; description: string }[]
    | null;
}

export type LoadProjectResult =
  | { ok: true; ctx: PromptProjectContext }
  | { ok: false; status: 401 | 404; error: string };

export async function loadPromptProjectContext(
  projectId: string
): Promise<LoadProjectResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  // RLS-gated SELECT — confirms the caller belongs to the org.
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, org_id, brand_name, brand_tracked_name, website_url, profile_short_description, profile_market_segment, profile_brand_identity, profile_target_audience, profile_products_services"
    )
    .eq("id", projectId)
    .maybeSingle<ProjectRow>();

  if (!project) {
    return { ok: false, status: 404, error: "Project not found" };
  }

  const profile: BrandProfile | null =
    project.profile_short_description &&
    project.profile_short_description.trim().length > 0
      ? {
          short_description: project.profile_short_description ?? "",
          market_segment: project.profile_market_segment ?? "",
          brand_identity: project.profile_brand_identity ?? "",
          target_audience: project.profile_target_audience ?? "",
          products_services: project.profile_products_services ?? [],
        }
      : null;

  return {
    ok: true,
    ctx: {
      project: {
        id: project.id,
        org_id: project.org_id,
        brand_name: project.brand_name,
        brand_tracked_name: project.brand_tracked_name,
        website_url: project.website_url,
      },
      brandName: project.brand_tracked_name || project.brand_name,
      websiteUrl: project.website_url,
      profile,
      user: { id: user.id, email: user.email },
    },
  };
}
