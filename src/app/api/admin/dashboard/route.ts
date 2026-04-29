/**
 * GET /api/admin/dashboard
 *
 * Aggregator endpoint for the admin landing page. Pulls four
 * independent panels in parallel:
 *   • Audit Council snapshot — pending decisions, today's flags,
 *     30-day flag rate.
 *   • Customer KPIs — total active orgs, active projects, plan-tier
 *     breakdown, recent signups.
 *   • AI spend — last 30 days total + top 5 features by cost.
 *   • System health — recent failed audits, action plans, run errors.
 *
 * One request, one round-trip to the API. Each panel can fail
 * independently; missing data is surfaced as null + an error message
 * inside the relevant section so a single bad query doesn't blank
 * the whole landing.
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PanelResult<T> {
  data: T | null;
  error: string | null;
}

async function safe<T>(fn: () => Promise<T>): Promise<PanelResult<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const admin = createAdminClient();

  const [auditCouncil, customers, aiSpend, systemHealth] = await Promise.all([
    safe(() => loadAuditCouncilPanel(admin)),
    safe(() => loadCustomersPanel(admin)),
    safe(() => loadAiSpendPanel(admin)),
    safe(() => loadSystemHealthPanel(admin)),
  ]);

  return NextResponse.json({
    audit_council: auditCouncil,
    customers,
    ai_spend: aiSpend,
    system_health: systemHealth,
    generated_at: new Date().toISOString(),
  });
}

// ── Audit Council snapshot ───────────────────────────────────────

async function loadAuditCouncilPanel(admin: SupabaseClient) {
  const since30d = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const sinceToday = new Date(
    new Date().setHours(0, 0, 0, 0)
  ).toISOString();

  const [pendingRes, today30dRes, flagged30dRes, todayFlaggedRes] =
    await Promise.all([
      admin
        .from("audit_reviews")
        .select("id", { count: "exact", head: true })
        .not("chair_verdict", "is", null)
        .is("ops_decision", null),
      admin
        .from("audit_reviews")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30d)
        .eq("status", "complete"),
      admin
        .from("audit_reviews")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30d)
        .in("chair_verdict", ["flag", "fail"]),
      admin
        .from("audit_reviews")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sinceToday)
        .in("chair_verdict", ["flag", "fail"]),
    ]);

  const completed30d = today30dRes.count ?? 0;
  const flagged30d = flagged30dRes.count ?? 0;
  return {
    pending_decisions: pendingRes.count ?? 0,
    completed_30d: completed30d,
    flagged_30d: flagged30d,
    flagged_today: todayFlaggedRes.count ?? 0,
    flag_rate_30d:
      completed30d === 0 ? 0 : flagged30d / completed30d,
  };
}

// ── Customer KPIs ────────────────────────────────────────────────

async function loadCustomersPanel(admin: SupabaseClient) {
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [orgsRes, projectsRes, recentSignupsRes, plansRes] =
    await Promise.all([
      admin.from("organisations").select("id", { count: "exact", head: true }),
      admin
        .from("projects")
        .select("id", { count: "exact", head: true }),
      admin
        .from("organisations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since7d),
      admin.from("organisations").select("plan"),
    ]);

  const planBreakdown = new Map<string, number>();
  for (const r of plansRes.data ?? []) {
    const p = (r as { plan?: string }).plan ?? "unknown";
    planBreakdown.set(p, (planBreakdown.get(p) ?? 0) + 1);
  }

  return {
    total_orgs: orgsRes.count ?? 0,
    total_projects: projectsRes.count ?? 0,
    signups_last_7d: recentSignupsRes.count ?? 0,
    plan_breakdown: Array.from(planBreakdown.entries())
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ── AI spend ────────────────────────────────────────────────────

interface UsageEventSnapshot {
  feature: string;
  cost_usd: number | null;
}

async function loadAiSpendPanel(admin: SupabaseClient) {
  const since = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data } = await admin
    .from("ai_usage_events")
    .select("feature, cost_usd")
    .gte("created_at", since)
    .returns<UsageEventSnapshot[]>();

  const rows = data ?? [];
  let total = 0;
  const byFeature = new Map<string, number>();
  for (const r of rows) {
    const cost = typeof r.cost_usd === "number" ? r.cost_usd : 0;
    total += cost;
    byFeature.set(r.feature, (byFeature.get(r.feature) ?? 0) + cost);
  }

  const top_features = Array.from(byFeature.entries())
    .map(([feature, cost_usd]) => ({ feature, cost_usd }))
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .slice(0, 5);

  return {
    total_cost_30d: total,
    event_count_30d: rows.length,
    top_features,
  };
}

// ── System health ───────────────────────────────────────────────

async function loadSystemHealthPanel(admin: SupabaseClient) {
  const since24h = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const [failedAuditsRes, failedPlansRes, errorReviewsRes] = await Promise.all([
    admin
      .from("seo_audits")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "unavailable"])
      .gte("created_at", since24h),
    admin
      .from("action_plans")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", since24h),
    admin
      .from("audit_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "error")
      .gte("created_at", since24h),
  ]);

  return {
    failed_seo_audits_24h: failedAuditsRes.count ?? 0,
    failed_action_plans_24h: failedPlansRes.count ?? 0,
    failed_audit_reviews_24h: errorReviewsRes.count ?? 0,
  };
}
