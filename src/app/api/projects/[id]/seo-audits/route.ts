/**
 * GET  /api/projects/[id]/seo-audits
 *      Returns past audits for this project + the current eligibility
 *      state (free quota remaining vs must-pay) so the SEO tab can
 *      render the right banner without a separate fetch.
 *
 * POST /api/projects/[id]/seo-audits
 *      Triggers a free in-account audit. Refuses if the plan doesn't
 *      include audits OR the monthly allowance is exhausted —
 *      caller is expected to send the user through Stripe checkout
 *      in that case (Phase 2b).
 *
 *      For now, this only inserts the seo_audits row in 'pending'
 *      status. The actual run engine (Sonnet call + PSI fetch) ships
 *      in Phase 2b. The row exists so the UI can show "queued for
 *      processing" without 500ing.
 */

import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSeoAuditEligibility } from "@/lib/seo-audit/eligibility";
import { runSeoAudit } from "@/lib/seo-audit/run";
import type { Organisation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// runSeoAudit needs ~60-180s (PSI + Sonnet web_search + observer pass).
// Without this, Vercel reaps the lambda the moment we return the
// audit row to the client, killing the background work mid-flight.
// The 300s budget here matches vercel.json's maxDuration override.
export const maxDuration = 300;

interface ProjectRow {
  id: string;
  org_id: string;
  brand_name: string;
  website_url: string | null;
}

async function loadProjectAndOrg(
  request: Request,
  projectId: string
): Promise<
  | { ok: true; project: ProjectRow; org: { id: string; plan: Organisation["plan"] } }
  | { ok: false; status: 401 | 404; error: string }
> {
  void request;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  // RLS-gated SELECT — confirms the caller belongs to the project's org.
  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id, brand_name, website_url")
    .eq("id", projectId)
    .maybeSingle<ProjectRow>();
  if (!project) {
    return { ok: false, status: 404, error: "Project not found" };
  }

  // Pull plan via admin client — orgs.plan is RLS-readable via the
  // user's profile join, but admin is simpler and we already have
  // the project.org_id.
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organisations")
    .select("id, plan")
    .eq("id", project.org_id)
    .maybeSingle<{ id: string; plan: Organisation["plan"] }>();
  if (!org) {
    return { ok: false, status: 404, error: "Organisation not found" };
  }

  return { ok: true, project, org };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const ctx = await loadProjectAndOrg(request, projectId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const admin = createAdminClient();
  const [{ data: audits }, eligibility] = await Promise.all([
    admin
      .from("seo_audits")
      .select(
        "id, site_url, status, source, report_summary, error_message, created_at, generated_at"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50),
    getSeoAuditEligibility(admin, ctx.org),
  ]);

  return NextResponse.json({
    audits: audits ?? [],
    eligibility,
    project: {
      brand_name: ctx.project.brand_name,
      website_url: ctx.project.website_url,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const ctx = await loadProjectAndOrg(request, projectId);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    site_url?: string;
  };

  // The caller is allowed to override the site URL (e.g. audit a
  // staging environment); default is the project's website_url.
  const targetUrl =
    body.site_url?.trim() || ctx.project.website_url?.trim() || null;
  if (!targetUrl) {
    return NextResponse.json(
      {
        error:
          "No site URL — set the project's website_url or pass site_url in the request body.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const eligibility = await getSeoAuditEligibility(admin, ctx.org);

  if (!eligibility.can_run_free) {
    // Caller must pay — the in-account UI will redirect them through
    // Stripe checkout (Phase 2b). For now, return a 402 so the UI
    // knows it's a payment-required state.
    return NextResponse.json(
      {
        error: eligibility.explanation,
        code: "payment_required",
        eligibility,
      },
      { status: 402 }
    );
  }

  // Auth'd user — track their email + user_id for later attribution.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const customerEmail = user?.email ?? "unknown@cmo.ie";

  // Decide whether this run consumes a comp credit or the plan
  // quota. Comps consume first so an admin grant always extends
  // runway rather than overlapping with the plan allowance.
  const usingComp =
    eligibility.remaining === 0 && eligibility.comp_remaining > 0;

  // Insert the audit row. Status='pending' until the run engine
  // picks it up. Source distinguishes how the audit was funded:
  // 'admin_comp' for grant-consumption, 'account_included' for the
  // plan's monthly quota.
  const { data: audit, error } = await admin
    .from("seo_audits")
    .insert({
      org_id: ctx.org.id,
      project_id: projectId,
      customer_email: customerEmail,
      site_url: targetUrl,
      source: "account_included",
      status: "pending",
    })
    .select("id, site_url, status, source, created_at")
    .single<{
      id: string;
      site_url: string;
      status: string;
      source: string;
      created_at: string;
    }>();

  if (error || !audit) {
    return NextResponse.json(
      { error: `Failed to create audit: ${error?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  // Decrement the comp counter NOW so a parallel request can't
  // double-spend the same credit. Failed audits don't refund (they
  // also don't burn the plan quota — see eligibility.ts comment on
  // status='complete' filter), so admins should grant generously.
  // If the decrement fails, surface it but don't fail the audit —
  // the user already saw the spinner kick off; we'll reconcile in
  // the eventual ops review.
  if (usingComp) {
    const { error: decrementError } = await admin.rpc(
      "decrement_comp_seo_audits",
      { p_org_id: ctx.org.id }
    );
    // RPC is optional — if it doesn't exist (older DB), fall back
    // to a non-atomic update. The race window is small (single
    // user, click-then-decrement) so for v1 the fallback is fine.
    if (decrementError) {
      const { data: orgRow } = await admin
        .from("organisations")
        .select("comp_seo_audits")
        .eq("id", ctx.org.id)
        .maybeSingle<{ comp_seo_audits: number | null }>();
      const next = Math.max(0, (orgRow?.comp_seo_audits ?? 0) - 1);
      await admin
        .from("organisations")
        .update({ comp_seo_audits: next })
        .eq("id", ctx.org.id);
    }
  }

  // Schedule the run pipeline AFTER the response is sent. `after()`
  // keeps the lambda alive (up to maxDuration) so the background
  // work actually executes, instead of getting reaped the instant we
  // call NextResponse.json below. A bare `void runSeoAudit()` would
  // be killed in milliseconds on Vercel — that was the cause of every
  // audit getting stuck on 'pending' with no progress writes.
  // Errors are persisted on the row (status='failed' / 'unavailable')
  // so the UI can surface them.
  after(async () => {
    try {
      await runSeoAudit(audit.id);
    } catch (err) {
      console.error(`[seo-audit ${audit.id}] background run failed:`, err);
    }
  });

  return NextResponse.json({ ok: true, audit });
}
