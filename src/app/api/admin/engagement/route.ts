/**
 * GET /api/admin/engagement
 *
 * Per-org account-management snapshot. Returns each customer org
 * with: last completed scan, next-scan ETA, 7-day visibility delta,
 * recent audit + playbook count, owner email. Used by /admin/engagement
 * to surface customers worth reaching out to (low usage, regressions).
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { computeNextScanEta } from "@/lib/scan-schedule";
import type { Organisation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trial_ends_at: string | null;
  created_at: string;
}

interface ProjectRow {
  id: string;
  org_id: string;
}

interface RunRow {
  id: string;
  project_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface ResultRow {
  run_id: string;
  brand_mentioned: boolean;
  response_snippet: string;
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
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Pull every org + project + recent runs + results in parallel.
  // For our scale (< 1000 orgs in v1), one round-trip per table is
  // fine; we'll add cursored pagination if it ever bites.
  const [orgsRes, projectsRes, runsRes, auditsRes, playbooksRes] =
    await Promise.all([
      admin
        .from("organisations")
        .select("id, name, slug, plan, trial_ends_at, created_at")
        .order("created_at", { ascending: false })
        .returns<OrgRow[]>(),
      admin
        .from("projects")
        .select("id, org_id")
        .returns<ProjectRow[]>(),
      admin
        .from("daily_runs")
        .select("id, project_id, status, created_at, completed_at")
        .eq("status", "complete")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .returns<RunRow[]>(),
      admin
        .from("seo_audits")
        .select("id, project_id, status, created_at")
        .eq("status", "complete")
        .gte("created_at", thirtyDaysAgo),
      admin
        .from("monthly_playbooks")
        .select("id, project_id, generated_at")
        .gte("generated_at", thirtyDaysAgo),
    ]);

  const orgs = orgsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const runs = runsRes.data ?? [];

  // Index projects by org for fast lookup.
  const projectsByOrg = new Map<string, string[]>();
  for (const p of projects) {
    const list = projectsByOrg.get(p.org_id) ?? [];
    list.push(p.id);
    projectsByOrg.set(p.org_id, list);
  }
  const orgByProject = new Map<string, string>();
  for (const p of projects) orgByProject.set(p.id, p.org_id);

  // Group runs by project so we can pluck the latest + 7-day-ago run.
  const runsByProject = new Map<string, RunRow[]>();
  for (const r of runs) {
    const list = runsByProject.get(r.project_id) ?? [];
    list.push(r);
    runsByProject.set(r.project_id, list);
  }

  // Pull every result for the runs we care about (latest + 7d-ago
  // per project). Cap result reads by joining run_ids in batches.
  const trackedRunIds: string[] = [];
  for (const [, projectRuns] of runsByProject) {
    if (projectRuns[0]) trackedRunIds.push(projectRuns[0].id);
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const old = projectRuns.find(
      (r) => new Date(r.created_at).getTime() <= sevenDaysAgoMs
    );
    if (old) trackedRunIds.push(old.id);
  }

  let results: ResultRow[] = [];
  if (trackedRunIds.length > 0) {
    const { data } = await admin
      .from("results")
      .select("run_id, brand_mentioned, response_snippet")
      .in("run_id", trackedRunIds)
      .returns<ResultRow[]>();
    results = data ?? [];
  }

  function visForRun(runId: string): number {
    const rs = results.filter(
      (r) => r.run_id === runId && !r.response_snippet.startsWith("[Error")
    );
    if (rs.length === 0) return 0;
    return Math.round(
      (rs.filter((r) => r.brand_mentioned).length / rs.length) * 100
    );
  }

  // Audits + playbooks counts per org, last 30d.
  const auditsByOrg = new Map<string, number>();
  for (const a of auditsRes.data ?? []) {
    const orgId = orgByProject.get(a.project_id as string);
    if (!orgId) continue;
    auditsByOrg.set(orgId, (auditsByOrg.get(orgId) ?? 0) + 1);
  }
  const playbooksByOrg = new Map<string, number>();
  for (const p of playbooksRes.data ?? []) {
    const orgId = orgByProject.get(p.project_id as string);
    if (!orgId) continue;
    playbooksByOrg.set(orgId, (playbooksByOrg.get(orgId) ?? 0) + 1);
  }

  // Resolve owner emails via auth.admin.listUsers + profiles.
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, org_id, role");
  const ownerByOrg = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p.role === "owner") ownerByOrg.set(p.org_id as string, p.id as string);
  }
  const { data: usersPage } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const userById = new Map((usersPage?.users ?? []).map((u) => [u.id, u]));

  // Final shape per org.
  const entries = orgs.map((org) => {
    const projectIds = projectsByOrg.get(org.id) ?? [];

    // Best last-scan + next-scan ETA across all projects in the org.
    let lastScanAt: string | null = null;
    let lastRunStartedAt: string | null = null;
    let scanCount30d = 0;
    let visToday = 0;
    let vis7dAgo = 0;
    let projectsWithRuns = 0;

    for (const projectId of projectIds) {
      const projectRuns = runsByProject.get(projectId) ?? [];
      scanCount30d += projectRuns.length;
      if (projectRuns.length === 0) continue;
      const latest = projectRuns[0];
      if (!lastScanAt || (latest.completed_at ?? latest.created_at) > lastScanAt) {
        lastScanAt = latest.completed_at ?? latest.created_at;
        lastRunStartedAt = latest.created_at;
      }
      // Average visibility across each project's latest + 7d-ago run.
      const todayVis = visForRun(latest.id);
      visToday += todayVis;
      const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const old = projectRuns.find(
        (r) => new Date(r.created_at).getTime() <= sevenDaysAgoMs
      );
      vis7dAgo += old ? visForRun(old.id) : todayVis;
      projectsWithRuns += 1;
    }

    const visToday_avg = projectsWithRuns
      ? Math.round(visToday / projectsWithRuns)
      : 0;
    const vis7dAgo_avg = projectsWithRuns
      ? Math.round(vis7dAgo / projectsWithRuns)
      : 0;
    const visDelta = visToday_avg - vis7dAgo_avg;

    const nextScan = computeNextScanEta({
      plan: (org.plan ?? "trial") as Organisation["plan"],
      lastRunStartedAt,
    });

    const ownerProfileId = ownerByOrg.get(org.id);
    const ownerEmail = ownerProfileId
      ? userById.get(ownerProfileId)?.email ?? null
      : null;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      owner_email: ownerEmail,
      project_count: projectIds.length,
      scan_count_30d: scanCount30d,
      audit_count_30d: auditsByOrg.get(org.id) ?? 0,
      playbook_count_30d: playbooksByOrg.get(org.id) ?? 0,
      last_scan_at: lastScanAt,
      next_scan_at: nextScan.next_scan_at,
      next_scan_relative: nextScan.relative,
      visibility_today: visToday_avg,
      visibility_delta_7d: visDelta,
      trial_ends_at: org.trial_ends_at,
      created_at: org.created_at,
    };
  });

  return NextResponse.json({
    orgs: entries,
    total: entries.length,
    generated_at: new Date().toISOString(),
  });
}
