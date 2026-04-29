"use client";

/**
 * Phase 7c — client renderer for the Audit Council metrics page.
 * Reads /api/admin/audit-council/metrics on mount and shapes the
 * data into the charts the doc spec'd.
 */

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

interface MetricsPayload {
  window: { since: string; days: number };
  totals: {
    total_reviews: number;
    completed_reviews: number;
    decisions_recorded: number;
  };
  flag_rate_by_type: Array<{
    artifact_type: string;
    total: number;
    flagged: number;
    flag_rate: number;
  }>;
  agreement_matrix: Array<{
    pair: string;
    comparable: number;
    same: number;
    agreement_rate: number;
  }>;
  issue_category_histogram: Array<{ category: string; count: number }>;
  median_decision_time_hours: number | null;
}

export function AuditCouncilMetrics() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/audit-council/metrics");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : `HTTP ${res.status}`
          );
        }
        if (!cancelled) setData((await res.json()) as MetricsPayload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Network error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="py-12 flex items-center gap-2 text-sm text-text-muted justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="border-l-2 border-danger pl-4 py-3 max-w-2xl mt-8">
        <p className="text-xs uppercase tracking-[0.15em] text-danger font-semibold flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" /> Failed to load metrics
        </p>
        <p className="mt-2 text-sm text-text-primary leading-relaxed">
          {error ?? "No data"}
        </p>
      </div>
    );
  }

  return (
    <section className="py-8 space-y-12">
      {/* ── Totals strip ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Reviews kicked off" value={data.totals.total_reviews} />
        <Stat
          label="Completed"
          value={data.totals.completed_reviews}
        />
        <Stat
          label="Ops decisions recorded"
          value={data.totals.decisions_recorded}
        />
        <Stat
          label="Median decision time"
          value={
            data.median_decision_time_hours === null
              ? "—"
              : `${data.median_decision_time_hours.toFixed(1)}h`
          }
        />
      </div>

      {/* ── Flag rate by type ──────────────────────────────────── */}
      <Section
        title="Flag rate by artifact type"
        description="Share of completed reviews where the chair verdict was flag or fail."
      >
        {data.flag_rate_by_type.length === 0 ? (
          <p className="text-sm text-text-muted">No completed reviews yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.flag_rate_by_type.map((row) => (
              <li
                key={row.artifact_type}
                className="grid grid-cols-12 items-center gap-3"
              >
                <span className="col-span-3 text-sm text-text-primary font-medium">
                  {prettyArtifactType(row.artifact_type)}
                </span>
                <div className="col-span-7 h-2 rounded-full bg-text-muted/15 overflow-hidden">
                  <div
                    className="h-full bg-emerald-dark"
                    style={{
                      width: `${Math.min(100, row.flag_rate * 100)}%`,
                    }}
                  />
                </div>
                <span className="col-span-2 text-xs font-mono text-text-muted text-right">
                  {(row.flag_rate * 100).toFixed(0)}% · {row.flagged}/{row.total}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Auditor agreement ──────────────────────────────────── */}
      <Section
        title="Auditor agreement (pairwise)"
        description="How often each pair of auditors landed on the same verdict. Lower numbers = more disagreement = more split-decision rows in the inbox."
      >
        {data.agreement_matrix.length === 0 ? (
          <p className="text-sm text-text-muted">No data yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.agreement_matrix.map((row) => (
              <li
                key={row.pair}
                className="grid grid-cols-12 items-center gap-3"
              >
                <span className="col-span-3 text-sm text-text-primary font-medium font-mono">
                  {row.pair}
                </span>
                <div className="col-span-7 h-2 rounded-full bg-text-muted/15 overflow-hidden">
                  <div
                    className="h-full bg-emerald-dark"
                    style={{
                      width: `${Math.min(100, row.agreement_rate * 100)}%`,
                    }}
                  />
                </div>
                <span className="col-span-2 text-xs font-mono text-text-muted text-right">
                  {(row.agreement_rate * 100).toFixed(0)}% · {row.same}/{row.comparable}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Issue category histogram ───────────────────────────── */}
      <Section
        title="Issues by category"
        description="Total issues raised across all auditors, last 30 days. Tells you where the auditors most often pick fights."
      >
        {data.issue_category_histogram.length === 0 ? (
          <p className="text-sm text-text-muted">No issues raised yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.issue_category_histogram.map((row) => {
              const max = data.issue_category_histogram[0]?.count ?? 1;
              return (
                <li
                  key={row.category}
                  className="grid grid-cols-12 items-center gap-3"
                >
                  <span className="col-span-3 text-sm text-text-primary font-medium">
                    {prettyCategory(row.category)}
                  </span>
                  <div className="col-span-7 h-2 rounded-full bg-text-muted/15 overflow-hidden">
                    <div
                      className="h-full bg-emerald-dark"
                      style={{ width: `${(row.count / max) * 100}%` }}
                    />
                  </div>
                  <span className="col-span-2 text-xs font-mono text-text-muted text-right">
                    {row.count}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-border rounded-md p-4">
      <p className="text-xs uppercase tracking-[0.15em] text-text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-text-primary tabular-nums">
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-12 gap-6">
      <div className="col-span-12 md:col-span-3">
        <p className="text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold">
          {title}
        </p>
        <p className="mt-1 text-xs text-text-muted leading-relaxed">
          {description}
        </p>
      </div>
      <div className="col-span-12 md:col-span-9">{children}</div>
    </section>
  );
}

function prettyArtifactType(t: string): string {
  switch (t) {
    case "seo_audit":
      return "SEO audit";
    case "monthly_playbook":
      return "Playbook";
    case "action_plan":
      return "Action plan";
    case "brief":
      return "Brief";
    case "brand_profile":
      return "Brand profile";
    case "prompt_batch":
      return "Prompt batch";
    default:
      return t;
  }
}

function prettyCategory(c: string): string {
  switch (c) {
    case "factual":
      return "Factual";
    case "industry_lock":
      return "Industry lock";
    case "specificity":
      return "Specificity";
    case "consistency":
      return "Consistency";
    case "citation":
      return "Citation";
    case "date":
      return "Date";
    case "scope":
      return "Scope";
    case "brand_voice":
      return "Brand voice";
    default:
      return c;
  }
}
