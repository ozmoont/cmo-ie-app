/**
 * Helper: confirm the authenticated api_key's org owns the project_id
 * in the request URL. Every per-project v1 endpoint calls this before
 * running any query, so the key can't be used to peek at another org's
 * data even if it knows the UUID.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/api/envelope";
import type { NextResponse } from "next/server";

export interface ProjectScope {
  ok: true;
  project: {
    id: string;
    org_id: string;
    brand_name: string;
  };
}
export interface ProjectScopeFail {
  ok: false;
  response: NextResponse;
}
export type ProjectScopeResult = ProjectScope | ProjectScopeFail;

export async function requireProjectScope(
  orgId: string,
  projectId: string
): Promise<ProjectScopeResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("id, org_id, brand_name")
    .eq("id", projectId)
    .maybeSingle<{ id: string; org_id: string; brand_name: string }>();
  if (error) {
    console.error("project-scope lookup failed:", error);
    return { ok: false, response: apiError(500, "internal", "Project lookup failed") };
  }
  if (!data) {
    return { ok: false, response: apiError(404, "not_found", "Project not found") };
  }
  if (data.org_id !== orgId) {
    // Deliberately return 404 (not 403) so a probing caller can't
    // enumerate project UUIDs belonging to other orgs.
    return { ok: false, response: apiError(404, "not_found", "Project not found") };
  }
  return { ok: true, project: data };
}
