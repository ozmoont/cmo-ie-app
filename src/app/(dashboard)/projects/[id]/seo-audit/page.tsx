"use client";

/**
 * /projects/[id]/seo-audit — in-account SEO audit tab.
 *
 * Three states the page handles:
 *   1. No audits yet, plan includes free quota → CTA: "Run audit"
 *   2. No audits yet, plan must pay → CTA: "Buy audit (€49)" (disabled
 *      in 2a; wires up to Stripe in 2b)
 *   3. Past audits exist → list them with status + report links
 *
 * The eligibility banner explains the customer's current state in
 * one line so the CTA never has to second-guess. Source of truth for
 * the explanation is `lib/seo-audit/eligibility` — UI just renders.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import {
  ScanSearch,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ChevronDown,
  Trash2,
} from "lucide-react";

// Rotating thinking phrases shown while an audit is generating.
// Cycle every 2.5s — fast enough that the UI feels alive, slow enough
// that users can read each one. The actual progress_step from the
// server replaces this when available; the rotation is the fallback.
const SEO_THINKING_PHRASES = [
  "Crawling the site…",
  "Reading meta tags + schema…",
  "Auditing on-page SEO…",
  "Checking Core Web Vitals…",
  "Mapping the keyword landscape…",
  "Hunting content gaps…",
  "Scoring AI search resilience…",
  "Comparing against competitors…",
  "Sniffing out technical issues…",
  "Calibrating for the Irish market…",
  "Prioritising the action plan…",
  "Writing it up properly…",
];

interface Eligibility {
  monthly_allowance: number;
  used_this_month: number;
  remaining: number;
  can_run_free: boolean;
  must_pay: boolean;
  explanation: string;
}

interface Audit {
  id: string;
  site_url: string;
  status:
    | "pending"
    | "paid"
    | "generating"
    | "complete"
    | "failed"
    | "unavailable";
  source: "public_paid" | "account_paid" | "account_included";
  report_summary: {
    seo_health_score?: number;
    overall_assessment?: string;
    top_3_priorities?: string[];
    ai_resilience_score?: number;
  } | null;
  report_markdown?: string | null;
  progress_step?: string | null;
  progress_percent?: number | null;
  error_message: string | null;
  created_at: string;
  generated_at: string | null;
}

type ActionState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; message: string };

export default function SeoAuditPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [audits, setAudits] = useState<Audit[]>([]);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<ActionState>({ kind: "idle" });
  // The audit currently in flight (post-click, while it streams progress).
  // We poll its status every 1.5s until it lands at complete/failed.
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [activeAudit, setActiveAudit] = useState<Audit | null>(null);
  // Index into SEO_THINKING_PHRASES — rotates every 2.5s during generation.
  const [phraseIdx, setPhraseIdx] = useState(0);
  // Which past audit's report is expanded inline. Click a row to toggle.
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Per-row deletion state — disables the trash button while the
  // request is in flight and avoids double-deletes from rapid clicks.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/seo-audits`);
    if (res.ok) {
      const data = await res.json();
      const list = (data.audits ?? []) as Audit[];
      setAudits(list);
      setEligibility(data.eligibility);
      setWebsiteUrl(data.project?.website_url ?? null);

      // Resume the thinking UI if there's an audit still in flight.
      // Without this, refreshing during a generating run would hide
      // the progress bar and leave the user staring at a "Queued"
      // badge with no feedback.
      const inFlight = list.find(
        (a) => a.status === "pending" || a.status === "generating"
      );
      if (inFlight) {
        setActiveAuditId((current) => current ?? inFlight.id);
      }
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // ── In-flight audit polling ──────────────────────────────────
  // When activeAuditId is set, we poll its status every 1.5s. Once
  // it hits a terminal state we stop polling, refresh the list to
  // pick up the row's final shape, and clear the active state.
  useEffect(() => {
    if (!activeAuditId) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }
    const tick = async () => {
      const res = await fetch(
        `/api/projects/${projectId}/seo-audits/${activeAuditId}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const a = data.audit as Audit | undefined;
      if (!a) return;
      setActiveAudit(a);
      const terminal = ["complete", "failed", "unavailable"].includes(a.status);
      if (terminal) {
        // Audit done — refresh the past-audits list to capture the
        // completed row, then clear the in-flight state. Auto-expand
        // the just-completed report so the user sees it inline.
        await fetchData();
        if (a.status === "complete") setExpandedAuditId(a.id);
        setActiveAuditId(null);
        setActiveAudit(null);
      }
    };
    pollIntervalRef.current = setInterval(tick, 1500);
    // Kick the first poll immediately so the UI doesn't sit empty
    // for the first 1.5s.
    tick();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeAuditId, projectId, fetchData]);

  // ── Thinking phrase rotator ──────────────────────────────────
  // Cycles SEO_THINKING_PHRASES every 2.5s while an audit is running.
  // Used as a fallback when the server's progress_step is empty.
  useEffect(() => {
    if (!activeAuditId) return;
    const id = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % SEO_THINKING_PHRASES.length);
    }, 2500);
    return () => clearInterval(id);
  }, [activeAuditId]);

  // Delete an audit row. Optimistically removes from the list so the
  // UI feels instant; rolls back on server error.
  const deleteAudit = async (auditId: string) => {
    if (deletingId) return; // de-dupe rapid clicks
    if (
      !window.confirm(
        "Delete this audit? This removes the row and any generated report — this can't be undone."
      )
    ) {
      return;
    }
    setDeletingId(auditId);
    const previous = audits;
    setAudits((list) => list.filter((a) => a.id !== auditId));
    // If the deleted audit was expanded or in flight, close those.
    setExpandedAuditId((id) => (id === auditId ? null : id));
    if (activeAuditId === auditId) {
      setActiveAuditId(null);
      setActiveAudit(null);
    }
    try {
      const res = await fetch(
        `/api/projects/${projectId}/seo-audits/${auditId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        // Roll back on failure so the user knows it didn't go through.
        setAudits(previous);
        const data = await res.json().catch(() => ({}));
        setActionState({
          kind: "error",
          message: data.error ?? `Delete failed (HTTP ${res.status})`,
        });
      }
    } catch (err) {
      setAudits(previous);
      setActionState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const runFreeAudit = async () => {
    setActionState({ kind: "running" });
    try {
      const res = await fetch(`/api/projects/${projectId}/seo-audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionState({
          kind: "error",
          message: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      // Success — start polling the new audit's progress. The poller
      // updates activeAudit in state, which drives the thinking UI.
      setActiveAuditId(data.audit.id);
      setActionState({ kind: "idle" });
    } catch (err) {
      setActionState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  };

  return (
    <DashboardShell
      orgName="CMO.ie"
      plan="trial"
      projectId={projectId}
      projectName="Project"
    >
      {/* ── Page header ── */}
      <header className="grid grid-cols-12 gap-6 items-end pb-10 md:pb-14 border-b border-border">
        <div className="col-span-12 md:col-span-9">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            <ScanSearch className="h-3 w-3" />
            SEO audit
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
            Get a deep SEO audit for{" "}
            {websiteUrl ? (
              <span className="font-mono text-2xl md:text-3xl text-text-secondary">
                {hostnameOf(websiteUrl)}
              </span>
            ) : (
              "your site"
            )}
            .
          </h1>
          <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
            A 9-phase audit covering keyword landscape, on-page SEO, content
            gaps, technical SEO, AI search resilience, competitor comparison,
            backlinks, and local SEO. Powered by the Howl.ie SEO Auditor skill,
            calibrated to your brand profile and Irish market context.
          </p>
        </div>
      </header>

      {/* ── In-flight audit thinking UI ── */}
      {/* When activeAuditId is set, the user just clicked Run audit
          and the pipeline is firing. We hide the eligibility CTA and
          show a progress card with rotating SEO-themed phrases + the
          server-reported step + a progress bar. */}
      {activeAuditId && (
        <section className="mt-8 mb-10 rounded-lg border border-emerald-dark/30 bg-emerald-dark/5 p-6">
          <div className="flex items-start gap-3">
            <Loader2 className="h-5 w-5 text-emerald-dark mt-0.5 shrink-0 animate-spin" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">
                {activeAudit?.progress_step ?? SEO_THINKING_PHRASES[phraseIdx]}
              </p>
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                Running the 9-phase Howl.ie SEO audit on{" "}
                <span className="font-mono text-xs">
                  {hostnameOf(activeAudit?.site_url ?? websiteUrl ?? "")}
                </span>
                . Takes 60-90 seconds. You can close this tab — the
                audit keeps running and you&apos;ll see it in the list
                when you come back.
              </p>
              {/* Progress bar — uses the server's progress_percent
                  when available, falls back to an indeterminate
                  pulse-like bar based on the rotating phrase index. */}
              <div className="mt-4 h-1.5 w-full bg-emerald-dark/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-dark transition-all duration-700 ease-out"
                  style={{
                    width: `${
                      activeAudit?.progress_percent ??
                      Math.min(
                        90,
                        ((phraseIdx + 1) / SEO_THINKING_PHRASES.length) * 100
                      )
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Eligibility + run CTA ── */}
      {/* Hidden while an audit is in flight (the thinking UI takes over). */}
      <section className={`mt-8 mb-10 ${activeAuditId ? "hidden" : ""}`}>
        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : eligibility ? (
          <div
            className={`rounded-lg border p-5 flex items-start gap-3 ${
              eligibility.can_run_free
                ? "border-emerald-dark/30 bg-emerald-dark/5"
                : "border-warning/30 bg-warning/5"
            }`}
          >
            {eligibility.can_run_free ? (
              <Sparkles className="h-5 w-5 text-emerald-dark mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">
                {eligibility.can_run_free
                  ? "Included in your plan"
                  : "Pay-per-audit"}
              </p>
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                {eligibility.explanation}
              </p>
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                {eligibility.can_run_free ? (
                  <Button
                    onClick={runFreeAudit}
                    disabled={actionState.kind === "running" || !websiteUrl}
                  >
                    {actionState.kind === "running" ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Queueing…
                      </>
                    ) : (
                      <>
                        Run audit
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </Button>
                ) : (
                  <Button disabled title="Stripe checkout ships in Phase 2b">
                    Buy audit (€49) — coming soon
                  </Button>
                )}
                {!websiteUrl && (
                  <p className="text-xs text-text-muted">
                    Set your project&apos;s website URL first.
                  </p>
                )}
              </div>
              {actionState.kind === "error" && (
                <p className="mt-3 text-sm text-danger flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {actionState.message}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Past audits ── */}
      <section className="mt-12">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Past audits · {audits.length}
        </p>
        {audits.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary max-w-xl">
            No audits yet. Run your first to get a prioritised action plan
            covering technical SEO, content gaps, and AI search resilience.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-border border-y border-border">
            {audits.map((a) => (
              <li key={a.id} className="py-4">
                <div className="flex items-center justify-between gap-4 group">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <StatusBadge status={a.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {hostnameOf(a.site_url)}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {new Date(a.created_at).toLocaleDateString("en-IE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {" · "}
                        <SourceLabel source={a.source} />
                        {a.report_summary?.seo_health_score !== undefined && (
                          <>
                            {" · "}
                            Health score{" "}
                            <span className="text-text-primary font-medium">
                              {a.report_summary.seo_health_score}
                            </span>
                            /100
                          </>
                        )}
                      </p>
                      {(a.status === "failed" ||
                        a.status === "unavailable") &&
                        a.error_message && (
                          <p className="text-xs text-danger mt-1">
                            {a.error_message}
                          </p>
                        )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    {a.status === "complete" ? (
                      <button
                        onClick={() =>
                          setExpandedAuditId(
                            expandedAuditId === a.id ? null : a.id
                          )
                        }
                        className="text-sm font-medium text-emerald-dark hover:text-emerald-dark/80 underline underline-offset-4 inline-flex items-center gap-1"
                      >
                        {expandedAuditId === a.id ? "Hide" : "View"} report
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            expandedAuditId === a.id ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    ) : a.status === "pending" || a.status === "generating" ? (
                      <span className="text-xs text-text-muted inline-flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {a.progress_step ?? "Processing…"}
                      </span>
                    ) : null}
                    <button
                      onClick={() => deleteAudit(a.id)}
                      disabled={deletingId === a.id}
                      title="Delete audit"
                      aria-label="Delete audit"
                      className="text-text-muted hover:text-danger transition-colors p-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deletingId === a.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                {expandedAuditId === a.id && (
                  <ExpandedReport projectId={projectId} auditId={a.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}

function StatusBadge({ status }: { status: Audit["status"] }) {
  const styles: Record<Audit["status"], { bg: string; label: string }> = {
    pending: { bg: "bg-text-muted/10 text-text-muted", label: "Queued" },
    paid: { bg: "bg-text-muted/10 text-text-muted", label: "Paid" },
    generating: {
      bg: "bg-warning/10 text-warning",
      label: "Generating",
    },
    complete: {
      bg: "bg-emerald-dark/10 text-emerald-dark",
      label: "Complete",
    },
    failed: { bg: "bg-danger/10 text-danger", label: "Failed" },
    unavailable: {
      bg: "bg-danger/10 text-danger",
      label: "Site blocked",
    },
  };
  const s = styles[status];
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider ${s.bg} flex items-center gap-1 shrink-0 mt-1`}
    >
      {status === "complete" && <CheckCircle2 className="h-3 w-3" />}
      {s.label}
    </span>
  );
}

function SourceLabel({ source }: { source: Audit["source"] }) {
  const labels = {
    public_paid: "Public · €49",
    account_paid: "Paid · €49",
    account_included: "Included in plan",
  };
  return <span>{labels[source]}</span>;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Inline report viewer — fetches the full audit (including the
 * markdown body, which the list endpoint doesn't include) on demand.
 * Renders the markdown as a `<pre>` for now; rich rendering with a
 * proper markdown library is a follow-up polish task.
 */
function ExpandedReport({
  projectId,
  auditId,
}: {
  projectId: string;
  auditId: string;
}) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/projects/${projectId}/seo-audits/${auditId}`
      );
      if (!cancelled && res.ok) {
        const data = await res.json();
        setAudit(data.audit);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, auditId]);

  if (loading) {
    return (
      <div className="mt-4 ml-12 text-sm text-text-muted flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading report…
      </div>
    );
  }
  if (!audit?.report_markdown) {
    return (
      <p className="mt-4 ml-12 text-sm text-text-muted">
        No report content yet.
      </p>
    );
  }
  return (
    <div className="mt-5 ml-12 max-w-3xl border-l-2 border-emerald-dark/20 pl-6 py-2">
      {/* Top-3 priorities banner from the JSON summary, if present. */}
      {Array.isArray(audit.report_summary?.top_3_priorities) &&
        audit.report_summary.top_3_priorities.length > 0 && (
          <div className="mb-5 rounded-md bg-emerald-dark/5 border border-emerald-dark/20 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold">
              Top priorities
            </p>
            <ul className="mt-3 space-y-2">
              {audit.report_summary.top_3_priorities.map(
                (p: string, i: number) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-text-primary"
                  >
                    <span className="font-mono text-text-muted mt-0.5">
                      {i + 1}.
                    </span>
                    <span>{p}</span>
                  </li>
                )
              )}
            </ul>
          </div>
        )}
      {/* Markdown body. Plain pre for now; we can swap in a markdown
          renderer (react-markdown) in a follow-up. */}
      <pre className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap font-sans">
        {audit.report_markdown}
      </pre>
    </div>
  );
}
