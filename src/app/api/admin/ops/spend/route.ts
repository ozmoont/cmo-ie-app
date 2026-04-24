/**
 * GET /api/admin/ops/spend
 *
 * Returns daily managed-key spend bucketed by provider, for the last
 * N days (default 30). Shape:
 *
 *   {
 *     days: ["2026-03-25", "2026-03-26", ...],
 *     series: {
 *       anthropic: [0.12, 0.43, ...],
 *       openai:    [0.04, 0.00, ...],
 *       ...
 *     },
 *     totals_per_day: [0.16, 0.43, ...]
 *   }
 *
 * Query params:
 *   days  — lookback window, 1-90. Default 30.
 *   byok  — "include" | "exclude" (default "exclude"). When included,
 *           BYOK costs are added to the series. Normally we exclude
 *           them because they're not OUR spend.
 *
 * All admin calls — gated via requireAdmin.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const PROVIDERS = [
  "anthropic",
  "openai",
  "perplexity",
  "gemini",
  "grok",
  "copilot",
] as const;

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") ?? 30);
  const days = Math.min(90, Math.max(1, Number.isFinite(daysParam) ? daysParam : 30));
  const byokMode =
    url.searchParams.get("byok") === "include" ? "include" : "exclude";

  const admin = createAdminClient();
  const windowStart = new Date(
    Date.now() - (days - 1) * 24 * 60 * 60 * 1000
  );
  // Align to UTC-midnight so bucket keys are stable day-over-day.
  const windowStartMidnight = new Date(
    Date.UTC(
      windowStart.getUTCFullYear(),
      windowStart.getUTCMonth(),
      windowStart.getUTCDate()
    )
  );

  const { data: events } = await admin
    .from("ai_usage_events")
    .select("provider, cost_usd, byok, created_at")
    .gte("created_at", windowStartMidnight.toISOString());

  // Bucket by yyyy-mm-dd × provider. We initialise every day in the
  // window first so the chart has zero values for empty days instead
  // of holes.
  const dayKeys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(windowStartMidnight.getTime() + i * 24 * 60 * 60 * 1000);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));

  const series: Record<string, number[]> = {};
  for (const p of PROVIDERS) series[p] = Array(days).fill(0);

  for (const e of events ?? []) {
    if (byokMode === "exclude" && e.byok) continue;
    const key =
      typeof e.created_at === "string" ? e.created_at.slice(0, 10) : null;
    if (!key) continue;
    const i = dayIndex.get(key);
    if (i === undefined) continue;
    const provider = e.provider as (typeof PROVIDERS)[number];
    if (!series[provider]) continue;
    series[provider][i] += Number(e.cost_usd ?? 0);
  }

  // Round once at the end — no need for every inner loop.
  for (const p of PROVIDERS) {
    series[p] = series[p].map((n) => Math.round(n * 1_000_000) / 1_000_000);
  }
  const totals_per_day = dayKeys.map((_, i) => {
    let s = 0;
    for (const p of PROVIDERS) s += series[p][i];
    return Math.round(s * 1_000_000) / 1_000_000;
  });

  return NextResponse.json({
    days: dayKeys,
    series,
    totals_per_day,
    byok_mode: byokMode,
  });
}
