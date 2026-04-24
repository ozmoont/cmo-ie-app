/**
 * GET /api/v1/projects
 *
 * Lists every project the authenticated key's org owns. Paginated.
 * Scope: visibility.read.
 */

import { requireApiKey } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  makePaginationMeta,
  ok,
  parsePagination,
} from "@/lib/api/envelope";

export async function GET(request: Request) {
  const auth = await requireApiKey(request, "visibility.read");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const p = parsePagination(url);

  const admin = createAdminClient();
  const from = (p.page - 1) * p.page_size;
  const to = from + p.page_size - 1;

  const { data, count, error } = await admin
    .from("projects")
    .select(
      "id, name, website_url, brand_name, brand_display_name, country_codes, models, created_at",
      { count: "exact" }
    )
    .eq("org_id", auth.apiKey.org_id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("v1/projects failed:", error);
    return apiError(500, "internal", "Failed to load projects");
  }

  return ok(data ?? [], makePaginationMeta(p, count ?? 0));
}
