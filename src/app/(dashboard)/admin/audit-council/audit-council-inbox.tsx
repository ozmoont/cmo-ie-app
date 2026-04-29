"use client";

/**
 * Phase 7a Audit Council inbox — client component.
 *
 * Polls /api/admin/audit-council/reviews on mount + tab change.
 * Renders a table grouped by chair_verdict. v1 has no drill-down
 * (shows the chair_summary inline + a "view artifact" link); the
 * three-column drill-down lands in 7b.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, CheckCircle2, Flag, Skull } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Verdict = "approve" | "approve_with_caveats" | "flag" | "fail";
type ReviewStatus = "pending" | "running" | "complete" | "error";

interface ReviewRow {
  id: string;
  artifact_type: string;
  artifact_id: string;
  org_id: string;
  project_id: string | null;
  status: ReviewStatus;
  sampled: boolean;
  chair_verdict: Verdict | null;
  chair_summary: string | null;
  agreement_score: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  error_message: string | null;
  ops_decision: "approved" | "overridden" | "mark_regenerate" | null;
  ops_decision_at: string | null;
  ops_notes: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Counters {
  pending_decision: number;
  flagged: number;
}

type TabKey =
  | "pending_decision"
  | "flagged"
  | "approved"
  | "errored"
  | "all";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pending_decision", label: "Pending decision" },
  { key: "flagged", label: "Flagged" },
  { key: "approved", label: "Approved" },
  { key: "errored", label: "Errored" },
  { key: "all", label: "All" },
];

function tabToQuery(tab: TabKey): URLSearchParams {
  const params = new URLSearchParams();
  switch (tab) {
    case "pending_decision":
      params.set("has_ops_decision", "false");
      break;
    case "flagged":
      params.set("verdict", "flag");
      break;
    case "approved":
      params.set("verdict", "approve");
      break;
    case "errored":
      params.set("status", "error");
      break;
    case "all":
      // no filter
      break;
  }
  return params;
}

export function AuditCouncilInbox() {
  const [tab, setTab] = useState<TabKey>("pending_decision");
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [counters, setCounters] = useState<Counters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (currentTab: TabKey) => {
    setLoading(true);
    setError(null);
    try {
      const params = tabToQuery(currentTab);
      const res = await fetch(
        `/api/admin/audit-council/reviews?${params.toString()}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `HTTP ${res.status}`
        );
      }
      const data = await res.json();
      setReviews(data.reviews ?? []);
      setCounters(data.counters ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(tab);
  }, [tab, load]);

  return (
    <section className="py-8">
      {/* ── Tabs ─────────────────────────────────────────────── */}
      <nav className="flex flex-wrap gap-1 border-b border-border mb-6">
        {TABS.map((t) => {
          const isActive = tab === t.key;
          const badgeCount =
            t.key === "pending_decision"
              ? counters?.pending_decision
              : t.key === "flagged"
                ? counters?.flagged
                : null;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors ${
                isActive
                  ? "border-emerald-dark text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
              {typeof badgeCount === "number" && badgeCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-text-muted/15 text-xs font-mono text-text-secondary">
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── States ───────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-text-muted py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reviews…
        </div>
      )}
      {!loading && error && (
        <div className="border-l-2 border-danger pl-4 py-3 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.15em] text-danger font-semibold flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" />
            Failed to load reviews
          </p>
          <p className="mt-2 text-sm text-text-primary leading-relaxed">
            {error}
          </p>
        </div>
      )}
      {!loading && !error && reviews.length === 0 && (
        <p className="text-sm text-text-secondary py-12 text-center max-w-md mx-auto">
          No reviews in this tab yet. Once SEO audits start completing in
          production, rows will appear here.
        </p>
      )}

      {/* ── Table ────────────────────────────────────────────── */}
      {!loading && !error && reviews.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {reviews.map((r) => (
            <li key={r.id} className="group">
              <Link
                href={`/admin/audit-council/${r.id}`}
                className="grid grid-cols-12 gap-4 py-4 items-start hover:bg-surface-muted/30 transition-colors -mx-2 px-2 rounded"
              >
                <div className="col-span-12 md:col-span-2 flex items-start gap-2">
                  <VerdictBadge verdict={r.chair_verdict} status={r.status} />
                </div>
                <div className="col-span-12 md:col-span-7 min-w-0">
                  <p className="text-sm text-text-primary font-medium group-hover:text-emerald-dark">
                    {prettyArtifactType(r.artifact_type)}
                    {r.sampled && (
                      <span className="ml-2 text-xs text-text-muted font-normal">
                        · sampled
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary leading-snug line-clamp-2">
                    {r.chair_summary ??
                      r.error_message ??
                      (r.status === "pending" || r.status === "running"
                        ? "Council is running…"
                        : "No summary yet.")}
                  </p>
                  <p className="mt-1 text-xs text-text-muted font-mono">
                    {new Date(r.created_at).toLocaleString("en-IE", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {r.cost_usd !== null && r.cost_usd > 0 && (
                      <> · ${r.cost_usd.toFixed(3)}</>
                    )}
                    {r.agreement_score !== null && (
                      <> · agreement {Math.round(r.agreement_score * 100)}%</>
                    )}
                    {r.duration_ms !== null && (
                      <> · {(r.duration_ms / 1000).toFixed(1)}s</>
                    )}
                  </p>
                </div>
                <div className="col-span-12 md:col-span-3 text-xs text-right">
                  {r.ops_decision ? (
                    <Badge variant="awareness" className="ml-auto">
                      Ops: {r.ops_decision}
                    </Badge>
                  ) : r.chair_verdict ? (
                    <span className="text-text-muted">Awaiting decision</span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VerdictBadge({
  verdict,
  status,
}: {
  verdict: Verdict | null;
  status: ReviewStatus;
}) {
  if (status === "pending" || status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-text-muted/10 text-text-muted">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-danger/10 text-danger">
        <AlertCircle className="h-3 w-3" />
        error
      </span>
    );
  }
  switch (verdict) {
    case "approve":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-emerald-dark/10 text-emerald-dark">
          <CheckCircle2 className="h-3 w-3" />
          approve
        </span>
      );
    case "approve_with_caveats":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-warning/10 text-warning">
          <CheckCircle2 className="h-3 w-3" />
          caveats
        </span>
      );
    case "flag":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-warning/15 text-warning">
          <Flag className="h-3 w-3" />
          flag
        </span>
      );
    case "fail":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-danger/15 text-danger">
          <Skull className="h-3 w-3" />
          fail
        </span>
      );
    default:
      return null;
  }
}

function prettyArtifactType(t: string): string {
  switch (t) {
    case "seo_audit":
      return "SEO audit";
    case "monthly_playbook":
      return "Monthly playbook";
    case "action_plan":
      return "Action plan";
    case "brief":
      return "Brief";
    case "brand_profile":
      return "Brand profile";
    case "prompt_batch":
      return "Phase 6 prompt batch";
    default:
      return t;
  }
}
