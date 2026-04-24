/**
 * GET /api/admin/ops/orgs
 *
 * Per-organisation snapshot for the ops dashboard table. One row per
 * org with:
 *   - plan + slug + name
 *   - managed_spend_mtd / byok_spend_mtd (USD)
 *   - runs_mtd (count of daily_runs for the org this month)
 *   - last_event_at (last ai_usage_events row for the org — proxy for
 *     last active)
 *
 * Sorted by managed_spend_mtd DESC. Default limit 50.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
}

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

  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString();

  const { data: orgs } = await admin
    .from("organisations")
    .select("id, name, slug, plan, created_at")
    .order("created_at", { ascending: false })
    .limit(500); // cap wide enough to cover normal growth for years

  const orgRows: OrgRow[] = (orgs ?? []) as OrgRow[];
  const orgIds = orgRows.map((o) => o.id);
  if (orgIds.length === 0) {
    return NextResponse.json({ orgs: [] });
  }

  // Pull this month's spend events for all orgs in one trip. For a
  // handful of orgs × thousands of events this is fine; when we have
  // 100+ orgs we'll want a SQL view with sum() — add migration then.
  const { data: events } = await admin
    .from("ai_usage_events")
    .select("org_id, cost_usd, byok, created_at")
    .gte("created_at", monthStart)
    .in("org_id", orgIds);

  const managed = new Map<string, number>();
  const byok = new Map<string, number>();
  const lastEvent = new Map<string, string>();
  for (const e of events ?? []) {
    const orgId = e.org_id as string | null;
    if (!orgId) continue;
    const cost = Number(e.cost_usd ?? 0);
    if (e.byok) byok.set(orgId, (byok.get(orgId) ?? 0) + cost);
    else managed.set(orgId, (managed.get(orgId) ?? 0) + cost);

    const createdAt = e.created_at as string | null;
    if (createdAt) {
      const prev = lastEvent.get(orgId);
      if (!prev || createdAt > prev) lastEvent.set(orgId, createdAt);
    }
  }

  // daily_runs count this month, per org. Supabase count() with
  // group-by isn't exposed through the REST client, so we fetch a
  // lean projection and count in-memory.
  const { data: runs } = await admin
    .from("daily_runs")
    .select("project_id, projects!inner(org_id)")
    .gte("created_at", monthStart)
    .in("projects.org_id", orgIds);
  const runsPerOrg = new Map<string, number>();
  for (const r of runs ?? []) {
    const orgId = (r as unknown as { projects: { org_id: string } }).projects
      ?.org_id;
    if (!orgId) continue;
    runsPerOrg.set(orgId, (runsPerOrg.get(orgId) ?? 0) + 1);
  }

  const shaped = orgRows.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    plan: o.plan,
    created_at: o.created_at,
    managed_spend_mtd: round6(managed.get(o.id) ?? 0),
    byok_spend_mtd: round6(byok.get(o.id) ?? 0),
    runs_mtd: runsPerOrg.get(o.id) ?? 0,
    last_event_at: lastEvent.get(o.id) ?? null,
  }));

  shaped.sort((a, b) => b.managed_spend_mtd - a.managed_spend_mtd);
  return NextResponse.json({ orgs: shaped.slice(0, limit) });
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
