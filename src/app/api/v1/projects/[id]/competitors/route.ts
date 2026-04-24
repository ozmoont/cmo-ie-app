/**
 * GET /api/v1/projects/[id]/competitors
 *
 * Full competitor list for the project with aliases + domains + colour.
 * Scope: competitors.read.
 */

import { requireApiKey } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, ok } from "@/lib/api/envelope";
import { requireProjectScope } from "@/lib/api/project-scope";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(request, "competitors.read");
  if (!auth.ok) return auth.response;

  const { id: projectId } = await params;
  const scope = await requireProjectScope(auth.apiKey.org_id, projectId);
  if (!scope.ok) return scope.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("competitors")
    .select(
      "id, name, display_name, tracked_name, aliases, regex_pattern, color, domains, website_url, created_at"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("v1/competitors failed:", error);
    return apiError(500, "internal", "Failed to load competitors");
  }
  return ok(data ?? []);
}
