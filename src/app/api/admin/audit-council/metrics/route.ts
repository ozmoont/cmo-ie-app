/**
 * GET /api/admin/audit-council/metrics
 *
 * Phase 7c — aggregate metrics for the Audit Council. Returns:
 *   • Flag rate (% of completed reviews where verdict was flag/fail)
 *     broken down by artifact type, last 30 days.
 *   • Pairwise auditor-agreement matrix (% of reviews where each pair
 *     of auditors gave the same verdict).
 *   • Issue category histogram (count of issues per category, last
 *     30 days).
 *   • Median ops-decision time (hours from completed_at →
 *     ops_decision_at) over the last 30 days.
 *
 * All numbers are computed in-process from raw rows. We intentionally
 * don't push these into a materialised view yet — at v1 volume the
 * cost is a few hundred ms per query, and the rules are still
 * shifting (we'll redefine "flag rate" once we have real data).
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Verdict = "approve" | "approve_with_caveats" | "flag" | "fail";

interface ReviewSnapshot {
  id: string;
  artifact_type: string;
  status: string;
  chair_verdict: Verdict | null;
  claude_report: { verdict?: Verdict; issues?: { category?: string }[] } | null;
  chatgpt_report: { verdict?: Verdict; issues?: { category?: string }[] } | null;
  gemini_report: { verdict?: Verdict; issues?: { category?: string }[] } | null;
  created_at: string;
  completed_at: string | null;
  ops_decision_at: string | null;
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
  const since = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await admin
    .from("audit_reviews")
    .select(
      "id, artifact_type, status, chair_verdict, claude_report, chatgpt_report, gemini_report, created_at, completed_at, ops_decision_at"
    )
    .gte("created_at", since)
    .returns<ReviewSnapshot[]>();

  if (error) {
    return NextResponse.json(
      { error: `Failed to load metrics: ${error.message}` },
      { status: 500 }
    );
  }

  const rows = data ?? [];
  const completed = rows.filter(
    (r) => r.status === "complete" && r.chair_verdict
  );

  // ── Flag rate by artifact type ─────────────────────────────────
  const byType = new Map<string, { total: number; flagged: number }>();
  for (const r of completed) {
    const bucket = byType.get(r.artifact_type) ?? { total: 0, flagged: 0 };
    bucket.total += 1;
    if (r.chair_verdict === "flag" || r.chair_verdict === "fail") {
      bucket.flagged += 1;
    }
    byType.set(r.artifact_type, bucket);
  }
  const flag_rate_by_type = Array.from(byType.entries())
    .map(([artifact_type, { total, flagged }]) => ({
      artifact_type,
      total,
      flagged,
      flag_rate: total === 0 ? 0 : flagged / total,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Pairwise auditor agreement ─────────────────────────────────
  const pairs: ReadonlyArray<["claude" | "chatgpt" | "gemini", "claude" | "chatgpt" | "gemini"]> = [
    ["claude", "chatgpt"],
    ["claude", "gemini"],
    ["chatgpt", "gemini"],
  ];
  const reportFor = (
    r: ReviewSnapshot,
    auditor: "claude" | "chatgpt" | "gemini"
  ): ReviewSnapshot["claude_report"] => {
    if (auditor === "claude") return r.claude_report;
    if (auditor === "chatgpt") return r.chatgpt_report;
    return r.gemini_report;
  };
  const agreement_matrix = pairs.map(([a, b]) => {
    let same = 0;
    let comparable = 0;
    for (const r of completed) {
      const va = reportFor(r, a)?.verdict;
      const vb = reportFor(r, b)?.verdict;
      if (!va || !vb) continue;
      comparable += 1;
      if (va === vb) same += 1;
    }
    return {
      pair: `${a}+${b}` as const,
      comparable,
      same,
      agreement_rate: comparable === 0 ? 0 : same / comparable,
    };
  });

  // ── Issue category histogram ───────────────────────────────────
  const categoryCounts = new Map<string, number>();
  for (const r of completed) {
    for (const report of [r.claude_report, r.chatgpt_report, r.gemini_report]) {
      const issues = report?.issues ?? [];
      for (const issue of issues) {
        const cat = issue.category ?? "other";
        categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
      }
    }
  }
  const issue_category_histogram = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // ── Median ops-decision time ───────────────────────────────────
  const decisionTimesMs: number[] = [];
  for (const r of completed) {
    if (!r.completed_at || !r.ops_decision_at) continue;
    decisionTimesMs.push(
      new Date(r.ops_decision_at).getTime() - new Date(r.completed_at).getTime()
    );
  }
  decisionTimesMs.sort((a, b) => a - b);
  const median_decision_time_hours =
    decisionTimesMs.length === 0
      ? null
      : decisionTimesMs[Math.floor(decisionTimesMs.length / 2)] / 3_600_000;

  return NextResponse.json({
    window: { since, days: 30 },
    totals: {
      total_reviews: rows.length,
      completed_reviews: completed.length,
      decisions_recorded: decisionTimesMs.length,
    },
    flag_rate_by_type,
    agreement_matrix,
    issue_category_histogram,
    median_decision_time_hours,
  });
}
