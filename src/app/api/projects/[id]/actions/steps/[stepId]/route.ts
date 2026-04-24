/**
 * PATCH /api/projects/[id]/actions/steps/[stepId]
 *
 * Updates one step's status and/or user_notes. Drives the per-action
 * state tracking on the Actions page: "mark done", "in progress",
 * "dismiss", or attach a private note.
 *
 * Only the project's owner org can update — RLS handles the guard.
 * The step's item/plan relationship to the project is verified
 * explicitly to prevent a user patching a step belonging to someone
 * else's project by guessing its UUID.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ActionStep, ActionStepStatus } from "@/lib/types";

const VALID_STATUS: ActionStepStatus[] = [
  "pending",
  "in_progress",
  "done",
  "dismissed",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id: projectId, stepId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { status, user_notes } = body as {
    status?: unknown;
    user_notes?: unknown;
  };

  // Validate at least one legit field was supplied.
  const validStatus =
    typeof status === "string" && VALID_STATUS.includes(status as ActionStepStatus)
      ? (status as ActionStepStatus)
      : null;
  const validNotes =
    user_notes === null
      ? null
      : typeof user_notes === "string"
        ? user_notes
        : undefined;

  if (validStatus === null && validNotes === undefined) {
    return NextResponse.json(
      {
        error:
          "Nothing to update. Supply a status (pending/in_progress/done/dismissed) or user_notes (string or null to clear).",
      },
      { status: 400 }
    );
  }

  // Ownership check — confirm the step belongs to a plan inside this
  // project. Three joins but small N so cheap. Prevents horizontal
  // access across projects even if RLS isn't tight enough on steps.
  const { data: stepRow, error: stepErr } = await supabase
    .from("action_steps")
    .select(
      "id, item_id, action_items!inner(plan_id, action_plans!inner(project_id))"
    )
    .eq("id", stepId)
    .maybeSingle();

  if (stepErr || !stepRow) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  // Embedded relation unwrapping — Supabase returns the nested objects
  // either as a single object or an array depending on version.
  const items = (
    stepRow as unknown as {
      action_items:
        | { action_plans: { project_id: string } | { project_id: string }[] }
        | { action_plans: { project_id: string } | { project_id: string }[] }[];
    }
  ).action_items;
  const itemsObj = Array.isArray(items) ? items[0] : items;
  const plans = itemsObj?.action_plans;
  const plansObj = Array.isArray(plans) ? plans[0] : plans;
  const linkedProjectId = plansObj?.project_id;

  if (linkedProjectId !== projectId) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  // Build patch — only include fields the caller supplied, so we don't
  // accidentally wipe user_notes when the caller only toggled status.
  // updated_at is set here in the API layer (migration 012 originally
  // had a DB trigger for this, but Supabase's SQL editor mishandled the
  // dollar-quoted function body).
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (validStatus !== null) {
    patch.status = validStatus;
    // Timestamp the completion transition so the UI can sort by
    // "recently completed".
    patch.completed_at = validStatus === "done" ? new Date().toISOString() : null;
  }
  if (validNotes !== undefined) {
    patch.user_notes = validNotes;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("action_steps")
    .update(patch)
    .eq("id", stepId)
    .select()
    .single<ActionStep>();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Update failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ step: updated });
}
