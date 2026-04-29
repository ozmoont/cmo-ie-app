/**
 * POST /api/admin/audit-council/reviews/[id]/decide
 *
 * Phase 7b — record the ops decision on a council review. The chair
 * already produced a verdict; this endpoint captures whether the ops
 * team agreed (approved), disagreed (overridden), or wants to flag
 * the review for follow-up after fixing the underlying generator
 * (mark_regenerate).
 *
 * Body: { decision: "approved" | "overridden" | "mark_regenerate", notes?: string }
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_DECISIONS = new Set([
  "approved",
  "overridden",
  "mark_regenerate",
]);

interface RequestBody {
  decision?: string;
  notes?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const { id } = await params;
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.decision || !VALID_DECISIONS.has(body.decision)) {
    return NextResponse.json(
      {
        error:
          "decision is required and must be one of: approved, overridden, mark_regenerate",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Confirm the row exists + belongs to a complete review (you can't
  // decide on a still-running or errored review — hit Trigger to
  // re-run if you want to re-decide).
  const { data: existing } = await admin
    .from("audit_reviews")
    .select("id, status, chair_verdict")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; chair_verdict: string | null }>();
  if (!existing) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }
  if (existing.status !== "complete" || !existing.chair_verdict) {
    return NextResponse.json(
      {
        error:
          "Cannot record a decision on a review that's not complete. Wait for the chair verdict, or re-run the council via /trigger.",
      },
      { status: 400 }
    );
  }

  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim().slice(0, 2000)
      : null;

  const { data: updated, error } = await admin
    .from("audit_reviews")
    .update({
      ops_decision: body.decision,
      ops_decision_at: new Date().toISOString(),
      ops_decision_by: auth.user.id,
      ops_notes: notes,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: `Failed to record decision: ${error?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, review: updated });
}
