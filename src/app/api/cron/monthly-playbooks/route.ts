/**
 * POST /api/cron/monthly-playbooks
 *
 * Scheduled on the 1st of every month at 09:00 IE time via Vercel
 * Cron (add to `vercel.json` when wiring the deploy). Idempotent —
 * re-running within the same month is a no-op.
 *
 * Auth: Vercel Cron calls with `Authorization: Bearer <CRON_SECRET>`.
 * We accept that or the header `x-vercel-cron: 1`. Missing both => 401.
 *
 * What it does:
 *   1. List every project belonging to an org on a paid plan.
 *   2. For each, call generateMonthlyPlaybook(projectId, firstOfThisMonth).
 *   3. Aggregate the results into a single JSON response.
 *   4. Return per-project success/failure; leaves row-level state in
 *      `monthly_playbooks`.
 *
 * Generation is sequential + chunked so a concurrent burst doesn't
 * overwhelm the Anthropic API on the first of the month. Phase 3
 * rate-limiting gave us headroom; this stays conservative.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateMonthlyPlaybook } from "@/lib/monthly-playbook";

function firstOfThisMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function isAuthorisedCron(request: Request): boolean {
  // Vercel Cron always sets x-vercel-cron: 1 on scheduled invocations.
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  return false;
}

export async function POST(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const month = firstOfThisMonth();

  // Only run for orgs on paid plans. Trial orgs don't get monthly
  // emails — they'd churn before receiving value, and the Claude spend
  // isn't earned back.
  const { data: projects, error } = await admin
    .from("projects")
    .select("id, name, org_id, organisations!inner(plan)")
    .neq("organisations.plan", "trial")
    .returns<
      Array<{
        id: string;
        name: string;
        org_id: string;
        organisations: { plan: string } | { plan: string }[] | null;
      }>
    >();

  if (error) {
    console.error("cron/monthly-playbooks list projects failed:", error);
    return NextResponse.json({ error: "Failed to list projects" }, { status: 500 });
  }

  const results: Array<{
    project_id: string;
    project_name: string;
    status: "ok" | "error" | "noop";
    message?: string;
  }> = [];

  for (const p of projects ?? []) {
    try {
      const playbook = await generateMonthlyPlaybook(p.id, month);
      const created = playbook.generated_at
        ? Date.now() - new Date(playbook.generated_at).getTime() < 60_000
        : false;
      results.push({
        project_id: p.id,
        project_name: p.name,
        status: created ? "ok" : "noop",
        message: created ? "Generated" : "Already existed for this month",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `cron/monthly-playbooks ${p.id} failed:`,
        message
      );
      results.push({
        project_id: p.id,
        project_name: p.name,
        status: "error",
        message,
      });
    }
  }

  return NextResponse.json({
    month: month.toISOString().slice(0, 10),
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    noop: results.filter((r) => r.status === "noop").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  });
}
