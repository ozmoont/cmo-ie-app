/**
 * GET /api/admin/ops/overview
 *
 * Returns the headline KPIs for the CMO.ie super-admin dashboard:
 *   - managed_spend_usd_mtd   : sum of cost_usd where byok=false, this month
 *   - byok_spend_usd_mtd      : same but byok=true (visibility, not billing)
 *   - runs_mtd                : count of daily_runs rows created this month
 *   - briefs_mtd              : count of brief ai_usage_events this month
 *   - errors_24h              : count of ai_usage_events where success=false, last 24h
 *   - active_orgs_by_plan     : { starter: N, pro: N, advanced: N, agency: N, trial: N }
 *
 * Gated by the env allow-list via `requireAdmin`. Uses the admin
 * Supabase client to bypass RLS on ai_usage_events.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString();
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Two event aggregates: managed spend + byok spend. We select both
  // in one round-trip and bucket in memory rather than two separate
  // .sum() queries — Supabase doesn't expose sum() through the rest
  // client, so we pull the cost_usd column and add in Node.
  const { data: events } = await admin
    .from("ai_usage_events")
    .select("cost_usd, byok, feature, success, created_at")
    .gte("created_at", monthStart);

  let managed_spend_usd_mtd = 0;
  let byok_spend_usd_mtd = 0;
  let briefs_mtd = 0;
  let errors_24h = 0;
  for (const e of events ?? []) {
    const cost = Number(e.cost_usd ?? 0);
    if (e.byok) byok_spend_usd_mtd += cost;
    else managed_spend_usd_mtd += cost;
    if (e.feature === "brief") briefs_mtd += 1;
    if (!e.success && e.created_at && e.created_at >= last24h) errors_24h += 1;
  }

  // Runs this month — cheaper as a count against daily_runs than
  // trying to infer from ai_usage_events (one run fans out to dozens
  // of events).
  const { count: runs_mtd } = await admin
    .from("daily_runs")
    .select("*", { count: "exact", head: true })
    .gte("created_at", monthStart);

  // Active orgs — every plan's active count. "active" = has a row in
  // organisations (we don't soft-delete). This is the denominator for
  // per-org spend tables.
  const { data: orgs } = await admin
    .from("organisations")
    .select("plan");
  const active_orgs_by_plan: Record<string, number> = {};
  for (const o of orgs ?? []) {
    const plan = (o.plan as string | null) ?? "trial";
    active_orgs_by_plan[plan] = (active_orgs_by_plan[plan] ?? 0) + 1;
  }

  return NextResponse.json({
    managed_spend_usd_mtd: round2(managed_spend_usd_mtd),
    byok_spend_usd_mtd: round2(byok_spend_usd_mtd),
    runs_mtd: runs_mtd ?? 0,
    briefs_mtd,
    errors_24h,
    active_orgs_by_plan,
    month_start: monthStart,
    generated_at: now.toISOString(),
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
