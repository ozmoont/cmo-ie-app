/**
 * GET /api/admin/audit-council/reviews
 *
 * Phase 7a admin inbox — paged list of audit_reviews rows with
 * filters for status, verdict, artifact type, and pending-decision.
 *
 * Admin-only via lib/admin-auth.requireAdmin (CMO_ADMIN_EMAILS env).
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["pending", "running", "complete", "error"]);
const VALID_VERDICTS = new Set([
  "approve",
  "approve_with_caveats",
  "flag",
  "fail",
]);
const VALID_ARTIFACT_TYPES = new Set([
  "seo_audit",
  "monthly_playbook",
  "action_plan",
  "brief",
  "brand_profile",
  "prompt_batch",
]);

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const verdict = url.searchParams.get("verdict");
  const artifactType = url.searchParams.get("artifact_type");
  const orgId = url.searchParams.get("org_id");
  const hasOpsDecision = url.searchParams.get("has_ops_decision");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  const admin = createAdminClient();
  let query = admin
    .from("audit_reviews")
    .select(
      "id, artifact_type, artifact_id, org_id, project_id, status, sampled, " +
        "chair_verdict, chair_summary, agreement_score, cost_usd, duration_ms, " +
        "error_message, ops_decision, ops_decision_at, ops_notes, " +
        "created_at, completed_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && VALID_STATUSES.has(status)) {
    query = query.eq("status", status);
  }
  if (verdict && VALID_VERDICTS.has(verdict)) {
    query = query.eq("chair_verdict", verdict);
  }
  if (artifactType && VALID_ARTIFACT_TYPES.has(artifactType)) {
    query = query.eq("artifact_type", artifactType);
  }
  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  if (hasOpsDecision === "true") {
    query = query.not("ops_decision", "is", null);
  } else if (hasOpsDecision === "false") {
    query = query.is("ops_decision", null);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json(
      { error: `Failed to load reviews: ${error.message}` },
      { status: 500 }
    );
  }

  // Aggregate counters for the inbox tab badges. Single round-trip
  // via separate light queries; can be optimised later if it shows
  // up in a slow query log.
  const [pendingDecisionRes, flaggedRes] = await Promise.all([
    admin
      .from("audit_reviews")
      .select("id", { count: "exact", head: true })
      .not("chair_verdict", "is", null)
      .is("ops_decision", null),
    admin
      .from("audit_reviews")
      .select("id", { count: "exact", head: true })
      .in("chair_verdict", ["flag", "fail"]),
  ]);

  return NextResponse.json({
    reviews: data ?? [],
    total: count ?? 0,
    counters: {
      pending_decision: pendingDecisionRes.count ?? 0,
      flagged: flaggedRes.count ?? 0,
    },
    pagination: { limit, offset },
  });
}
