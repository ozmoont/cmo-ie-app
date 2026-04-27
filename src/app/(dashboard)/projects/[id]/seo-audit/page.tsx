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

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import {
  ScanSearch,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from "lucide-react";

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
  report_summary: { seo_health_score?: number } | null;
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

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/seo-audits`);
    if (res.ok) {
      const data = await res.json();
      setAudits(data.audits ?? []);
      setEligibility(data.eligibility);
      setWebsiteUrl(data.project?.website_url ?? null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      // Success — refresh the list. The new row will be in 'pending'
      // until Phase 2b's run engine processes it.
      await fetchData();
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

      {/* ── Eligibility + run CTA ── */}
      <section className="mt-8 mb-10">
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
              <li
                key={a.id}
                className="flex items-center justify-between gap-4 py-4 group"
              >
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
                    {a.status === "failed" && a.error_message && (
                      <p className="text-xs text-danger mt-1">
                        {a.error_message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  {a.status === "complete" ? (
                    <Link
                      href={`/seo-audit/${a.id}`}
                      className="text-sm font-medium text-emerald-dark hover:text-emerald-dark/80 underline underline-offset-4"
                    >
                      View report
                    </Link>
                  ) : a.status === "pending" || a.status === "generating" ? (
                    <span className="text-xs text-text-muted">
                      Processing…
                    </span>
                  ) : null}
                </div>
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
