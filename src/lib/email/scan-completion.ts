/**
 * Scan-completion email dispatcher.
 *
 * Called from the run engine when a daily_run flips to 'complete'.
 * Looks up every recipient with notify_on_scan = TRUE in the org,
 * builds a per-run summary email, and fires Resend for each. Logs
 * the outcome to scan_email_log so the same run can't double-send
 * across run-engine retries.
 *
 * Designed to be fire-and-forget from the caller's perspective —
 * any failure inside is caught + persisted on scan_email_log; the
 * run itself is already complete by the time we get here.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailDispatchEnabled } from "./dispatcher";
import type { SupabaseClient } from "@supabase/supabase-js";

interface RunSummary {
  run_id: string;
  project_id: string;
  project_name: string;
  brand_name: string;
  visibility_score: number;
  visibility_delta: number; // vs previous run, 0 if no prior
  prompt_count: number;
  mention_count: number;
  source_count: number;
  app_url: string;
}

interface Recipient {
  id: string;
  email: string;
  full_name: string | null;
}

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://www.cmo.ie";

/**
 * Public entry — fire scan-completion emails for one completed run.
 * Idempotent: a second invocation for the same runId is a no-op
 * because we mark daily_runs.scan_email_sent_at on first dispatch.
 */
export async function dispatchScanCompletionEmails(
  runId: string
): Promise<void> {
  // Cheap short-circuit when Resend isn't wired — saves a chunk of
  // queries during local dev / pre-launch.
  if (!emailDispatchEnabled()) {
    return;
  }

  const admin = createAdminClient();

  // Idempotency guard. We check + mark in two steps; the brief race
  // window is fine because run-completion isn't truly concurrent
  // (one run engine instance per run).
  const { data: runRow } = await admin
    .from("daily_runs")
    .select("id, project_id, scan_email_sent_at, status")
    .eq("id", runId)
    .maybeSingle<{
      id: string;
      project_id: string;
      scan_email_sent_at: string | null;
      status: string;
    }>();
  if (!runRow) return;
  if (runRow.scan_email_sent_at) return; // already sent
  if (runRow.status !== "complete") return; // sanity

  const summary = await buildRunSummary(admin, runRow.id, runRow.project_id);
  if (!summary) return; // missing project / nothing to summarise

  // Mark BEFORE dispatching so a parallel run-engine retry can't
  // duplicate. Failed sends still get logged to scan_email_log;
  // we'd rather under-send than spam.
  await admin
    .from("daily_runs")
    .update({ scan_email_sent_at: new Date().toISOString() })
    .eq("id", runId);

  // Pull the project's org, then every profile in that org with
  // notify_on_scan = TRUE.
  const { data: project } = await admin
    .from("projects")
    .select("org_id")
    .eq("id", summary.project_id)
    .maybeSingle<{ org_id: string }>();
  if (!project) return;

  const recipients = await loadRecipients(admin, project.org_id);
  if (recipients.length === 0) return;

  // Send + log each recipient sequentially. Volume is low (≤ 5 team
  // members per org typically); parallelism would just complicate
  // the log writes without measurable speed-up.
  for (const recipient of recipients) {
    const { subject, text } = renderScanCompletionEmail({
      summary,
      recipient,
    });
    const result = await sendEmail({
      to: recipient.email,
      subject,
      text,
      tag: "scan_completion",
    });

    await admin.from("scan_email_log").insert({
      run_id: runId,
      profile_id: recipient.id,
      recipient_email: recipient.email,
      resend_message_id:
        result.status === "sent" ? result.resend_message_id : null,
      status: result.status,
      error_message:
        result.status === "failed"
          ? result.error
          : result.status === "skipped"
            ? result.reason
            : null,
    });
  }
}

// ── Internals ─────────────────────────────────────────────────────

async function buildRunSummary(
  admin: SupabaseClient,
  runId: string,
  projectId: string
): Promise<RunSummary | null> {
  const { data: project } = await admin
    .from("projects")
    .select("id, name, brand_name, brand_tracked_name")
    .eq("id", projectId)
    .maybeSingle<{
      id: string;
      name: string | null;
      brand_name: string;
      brand_tracked_name: string | null;
    }>();
  if (!project) return null;

  // Pull this run's results + the previous completed run for delta.
  const { data: results } = await admin
    .from("results")
    .select("id, brand_mentioned, response_snippet")
    .eq("run_id", runId)
    .returns<{ id: string; brand_mentioned: boolean; response_snippet: string }[]>();
  const success = (results ?? []).filter(
    (r) => !r.response_snippet.startsWith("[Error")
  );
  const mentioned = success.filter((r) => r.brand_mentioned).length;
  const visibility = success.length
    ? Math.round((mentioned / success.length) * 100)
    : 0;

  // Previous run for delta — order by created_at desc, skip the
  // current run, take 1.
  const { data: prevRun } = await admin
    .from("daily_runs")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "complete")
    .neq("id", runId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  let prevVis = 0;
  if (prevRun) {
    const { data: prevResults } = await admin
      .from("results")
      .select("brand_mentioned, response_snippet")
      .eq("run_id", prevRun.id)
      .returns<{ brand_mentioned: boolean; response_snippet: string }[]>();
    const prevSuccess = (prevResults ?? []).filter(
      (r) => !r.response_snippet.startsWith("[Error")
    );
    const prevMentioned = prevSuccess.filter((r) => r.brand_mentioned).length;
    prevVis = prevSuccess.length
      ? Math.round((prevMentioned / prevSuccess.length) * 100)
      : 0;
  }

  const { count: promptCount } = await admin
    .from("prompts")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "active");

  let sourceCount = 0;
  if (success.length > 0) {
    const { count: cit } = await admin
      .from("citations")
      .select("id", { count: "exact", head: true })
      .in(
        "result_id",
        success.map((r) => r.id)
      );
    sourceCount = cit ?? 0;
  }

  return {
    run_id: runId,
    project_id: project.id,
    project_name: project.name ?? project.brand_name,
    brand_name: project.brand_tracked_name ?? project.brand_name,
    visibility_score: visibility,
    visibility_delta: visibility - prevVis,
    prompt_count: promptCount ?? 0,
    mention_count: mentioned,
    source_count: sourceCount,
    app_url: `${SITE_URL}/projects/${projectId}`,
  };
}

async function loadRecipients(
  admin: SupabaseClient,
  orgId: string
): Promise<Recipient[]> {
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, notify_on_scan")
    .eq("org_id", orgId)
    .eq("notify_on_scan", true)
    .returns<{ id: string; full_name: string | null; notify_on_scan: boolean }[]>();
  if (!profiles || profiles.length === 0) return [];

  // Resolve email per profile via auth.admin. listUsers paginates;
  // one page comfortably covers our scale.
  const { data: usersPage } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const byId = new Map((usersPage?.users ?? []).map((u) => [u.id, u]));

  const recipients: Recipient[] = [];
  for (const p of profiles) {
    const user = byId.get(p.id);
    if (!user?.email) continue;
    recipients.push({ id: p.id, email: user.email, full_name: p.full_name });
  }
  return recipients;
}

interface RenderInput {
  summary: RunSummary;
  recipient: Recipient;
}

function renderScanCompletionEmail(input: RenderInput): {
  subject: string;
  text: string;
} {
  const { summary, recipient } = input;
  const greeting = recipient.full_name
    ? `Hi ${recipient.full_name.split(" ")[0]},`
    : "Hi,";
  const deltaPhrase = formatDelta(summary.visibility_delta);
  const subject = `${summary.brand_name}: AI visibility ${summary.visibility_score}% (${deltaPhrase})`;

  const text = [
    greeting,
    "",
    `Today's scan for ${summary.brand_name} is complete.`,
    "",
    `  AI search visibility:    ${summary.visibility_score}% (${deltaPhrase})`,
    `  Brand mentions:          ${summary.mention_count} / ${summary.prompt_count} prompts`,
    `  Sources captured:        ${summary.source_count}`,
    "",
    `Open the dashboard for the breakdown by AI engine, the new gaps, and the recommended actions:`,
    summary.app_url,
    "",
    `Don't want this email? Settings → Notifications → 'Email me when scans complete'.`,
    "",
    `— CMO.ie`,
  ].join("\n");

  return { subject, text };
}

function formatDelta(delta: number): string {
  if (delta === 0) return "flat";
  if (delta > 0) return `+${delta} pts`;
  return `${delta} pts`;
}
