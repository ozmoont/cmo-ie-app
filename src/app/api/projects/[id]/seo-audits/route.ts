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

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSeoAuditEligibility } from "@/lib/seo-audit/eligibility";
import type { Organisation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Insert the audit row. Status='pending' until the run engine ships
  // in Phase 2b, at which point we'll flip to 'generating' here and
  // kick off the background task.
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

  return NextResponse.json({
    ok: true,
    audit,
    note:
      "Audit queued. Run engine ships in Phase 2b — once Stripe + Resend keys are wired, the row will auto-progress through generating → complete.",
  });
}
