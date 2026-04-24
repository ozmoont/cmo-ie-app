/**
 * GET /api/admin/ops/events
 *
 * Recent AI usage events feed. Supports light filtering so the
 * dashboard can show a "recent errors" view alongside "most
 * expensive calls today".
 *
 * Query params:
 *   limit   — 1..200, default 50
 *   success — "true" | "false" | unset (all)
 *   feature — one of the feature enum values or unset (all)
 *   since   — ISO timestamp; default 24h ago
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50))
  );
  const successParam = url.searchParams.get("success");
  const feature = url.searchParams.get("feature");
  const since =
    url.searchParams.get("since") ??
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const admin = createAdminClient();
  let query = admin
    .from("ai_usage_events")
    .select(
      "id, created_at, provider, model, feature, input_tokens, output_tokens, cost_usd, byok, success, error_code, duration_ms, org_id, project_id"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (successParam === "true") query = query.eq("success", true);
  else if (successParam === "false") query = query.eq("success", false);
  if (feature) query = query.eq("feature", feature);

  const { data: events, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ events: events ?? [] });
}
