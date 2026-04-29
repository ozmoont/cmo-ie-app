/**
 * POST /api/admin/orgs/[id]/grant
 *
 * Grant comp SEO audits, comp brief credits, and/or extend the trial
 * for a specific org. All three are optional — pass any subset.
 *
 * Body shape:
 *   {
 *     comp_seo_audits?:    number  // total to ADD to existing balance
 *     comp_brief_credits?: number  // total to ADD to existing balance
 *     extend_trial_days?:  number  // adds N days to NOW() for trial_ends_at
 *     notes?:              string  // free text reason; appended to comp_notes
 *   }
 *
 * Comp counters are additive — granting 5 audits when 3 are already
 * available leaves the org with 8. Trial extension is absolute —
 * trial_ends_at moves to NOW() + extend_trial_days, but only if that
 * lands later than the current trial_ends_at (we never shorten).
 *
 * Source-of-truth schema: supabase/migrations/027_comp_credits.sql
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RequestBody {
  comp_seo_audits?: number;
  comp_brief_credits?: number;
  extend_trial_days?: number;
  notes?: string;
}

function clampInt(raw: unknown, max: number): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.round(raw);
  if (n < 0 || n > max) return null;
  return n;
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

  // Sanity-clamp every numeric input. Caps are deliberately permissive
  // — operator typos are bounded but legitimate large grants
  // (e.g. 100 brief credits for an agency pilot) still go through.
  const audits = clampInt(body.comp_seo_audits, 100);
  const briefs = clampInt(body.comp_brief_credits, 500);
  const trialDays = clampInt(body.extend_trial_days, 365);
  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim().slice(0, 1000)
      : null;

  const granted =
    [audits, briefs, trialDays].some((v) => v !== null && v > 0) ||
    notes !== null;
  if (!granted) {
    return NextResponse.json(
      {
        error:
          "Provide at least one of comp_seo_audits, comp_brief_credits, extend_trial_days, or notes.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Fetch the existing row so we can do additive updates correctly.
  const { data: existing } = await admin
    .from("organisations")
    .select(
      "id, name, comp_seo_audits, comp_brief_credits, trial_ends_at, comp_notes"
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      name: string;
      comp_seo_audits: number | null;
      comp_brief_credits: number | null;
      trial_ends_at: string | null;
      comp_notes: string | null;
    }>();
  if (!existing) {
    return NextResponse.json(
      { error: "Organisation not found" },
      { status: 404 }
    );
  }

  // Compute the post-grant state.
  const updates: Record<string, unknown> = {
    comp_granted_at: new Date().toISOString(),
    comp_granted_by: auth.user.id,
  };

  if (audits !== null && audits > 0) {
    updates.comp_seo_audits = (existing.comp_seo_audits ?? 0) + audits;
  }
  if (briefs !== null && briefs > 0) {
    updates.comp_brief_credits = (existing.comp_brief_credits ?? 0) + briefs;
  }
  if (trialDays !== null && trialDays > 0) {
    const candidate = new Date(Date.now() + trialDays * 86400_000);
    const current = existing.trial_ends_at
      ? new Date(existing.trial_ends_at)
      : null;
    // Never shorten — only extend if the candidate is later than what's there.
    const winner =
      current && current > candidate ? current : candidate;
    updates.trial_ends_at = winner.toISOString();
    updates.trial_extended_to = winner.toISOString();
  }
  if (notes !== null) {
    // Append to existing notes with a timestamp + granter, so the
    // history of grants is visible without a separate audit table.
    const ts = new Date().toISOString().slice(0, 10);
    const granterEmail = auth.user.email ?? "unknown";
    const newEntry = `[${ts} by ${granterEmail}] ${notes}`;
    updates.comp_notes = existing.comp_notes
      ? `${existing.comp_notes}\n\n${newEntry}`
      : newEntry;
  }

  const { data: updated, error } = await admin
    .from("organisations")
    .update(updates)
    .eq("id", id)
    .select(
      "id, name, comp_seo_audits, comp_brief_credits, trial_ends_at, trial_extended_to, comp_notes"
    )
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: `Grant failed: ${error?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    org: updated,
  });
}
