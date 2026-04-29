"use client";

/**
 * Admin landing client component. Polls /api/admin/dashboard on
 * mount, renders the four panels (Audit Council, customers, AI
 * spend, system health), each independently failable.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  ScanSearch,
  Users,
  Receipt,
  Activity,
  ArrowRight,
} from "lucide-react";

interface PanelResult<T> {
  data: T | null;
  error: string | null;
}

interface DashboardPayload {
  audit_council: PanelResult<{
    pending_decisions: number;
    completed_30d: number;
    flagged_30d: number;
    flagged_today: number;
    flag_rate_30d: number;
  }>;
  customers: PanelResult<{
    total_orgs: number;
    total_projects: number;
    signups_last_7d: number;
    plan_breakdown: Array<{ plan: string; count: number }>;
  }>;
  ai_spend: PanelResult<{
    total_cost_30d: number;
    event_count_30d: number;
    top_features: Array<{ feature: string; cost_usd: number }>;
  }>;
  system_health: PanelResult<{
    failed_seo_audits_24h: number;
    failed_action_plans_24h: number;
    failed_audit_reviews_24h: number;
  }>;
  generated_at: string;
}

export function AdminDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : `HTTP ${res.status}`
          );
        }
        if (!cancelled) setData((await res.json()) as DashboardPayload);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Network error");
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
        <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="border-l-2 border-danger pl-4 py-3 max-w-2xl mt-8">
        <p className="text-xs uppercase tracking-[0.15em] text-danger font-semibold flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" /> Failed to load dashboard
        </p>
        <p className="mt-2 text-sm text-text-primary leading-relaxed">
          {error ?? "No data"}
        </p>
      </div>
    );
  }

  return (
    <section className="py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
      <AuditCouncilPanel result={data.audit_council} />
      <CustomersPanel result={data.customers} />
      <AiSpendPanel result={data.ai_spend} />
      <SystemHealthPanel result={data.system_health} />
    </section>
  );
}

// ── Panels ───────────────────────────────────────────────────────

function AuditCouncilPanel({
  result,
}: {
  result: DashboardPayload["audit_council"];
}) {
  return (
    <Panel
      icon={<ScanSearch className="h-4 w-4" />}
      title="Audit Council"
      href="/admin/audit-council"
      hrefLabel="Open inbox"
      error={result.error}
    >
      {result.data && (
        <>
          <Stat
            label="Pending decisions"
            value={result.data.pending_decisions}
            highlight={result.data.pending_decisions > 0}
          />
          <Stat label="Flagged today" value={result.data.flagged_today} />
          <Stat label="Reviews in last 30d" value={result.data.completed_30d} />
          <Stat
            label="Flag rate (30d)"
            value={`${(result.data.flag_rate_30d * 100).toFixed(1)}%`}
          />
        </>
      )}
    </Panel>
  );
}

function CustomersPanel({
  result,
}: {
  result: DashboardPayload["customers"];
}) {
  return (
    <Panel
      icon={<Users className="h-4 w-4" />}
      title="Customers"
      href="/admin/playbooks"
      hrefLabel="View playbooks"
      error={result.error}
    >
      {result.data && (
        <>
          <Stat label="Total orgs" value={result.data.total_orgs} />
          <Stat label="Total projects" value={result.data.total_projects} />
          <Stat
            label="Signups last 7d"
            value={result.data.signups_last_7d}
          />
          <div className="col-span-2 text-xs text-text-muted">
            <p className="mb-1 uppercase tracking-[0.15em]">
              Plan breakdown
            </p>
            <ul className="grid grid-cols-2 gap-1 font-mono">
              {result.data.plan_breakdown.map((p) => (
                <li key={p.plan} className="flex justify-between">
                  <span>{p.plan}</span>
                  <span className="text-text-primary">{p.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Panel>
  );
}

function AiSpendPanel({
  result,
}: {
  result: DashboardPayload["ai_spend"];
}) {
  return (
    <Panel
      icon={<Receipt className="h-4 w-4" />}
      title="AI spend (30d)"
      error={result.error}
    >
      {result.data && (
        <>
          <Stat
            label="Total cost"
            value={`$${result.data.total_cost_30d.toFixed(2)}`}
          />
          <Stat label="Events" value={result.data.event_count_30d} />
          <div className="col-span-2 text-xs text-text-muted mt-2">
            <p className="mb-1 uppercase tracking-[0.15em]">
              Top features by spend
            </p>
            <ul className="space-y-1 font-mono">
              {result.data.top_features.map((f) => (
                <li key={f.feature} className="flex justify-between">
                  <span>{f.feature}</span>
                  <span className="text-text-primary">
                    ${f.cost_usd.toFixed(3)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Panel>
  );
}

function SystemHealthPanel({
  result,
}: {
  result: DashboardPayload["system_health"];
}) {
  return (
    <Panel
      icon={<Activity className="h-4 w-4" />}
      title="System health (24h)"
      error={result.error}
    >
      {result.data && (
        <>
          <Stat
            label="Failed SEO audits"
            value={result.data.failed_seo_audits_24h}
            highlight={result.data.failed_seo_audits_24h > 0}
          />
          <Stat
            label="Failed action plans"
            value={result.data.failed_action_plans_24h}
            highlight={result.data.failed_action_plans_24h > 0}
          />
          <Stat
            label="Failed council reviews"
            value={result.data.failed_audit_reviews_24h}
            highlight={result.data.failed_audit_reviews_24h > 0}
          />
        </>
      )}
    </Panel>
  );
}

// ── Building blocks ─────────────────────────────────────────────

function Panel({
  icon,
  title,
  href,
  hrefLabel,
  error,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href?: string;
  hrefLabel?: string;
  error: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-md p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-text-primary inline-flex items-center gap-2">
          <span className="text-emerald-dark">{icon}</span>
          {title}
        </p>
        {href && (
          <Link
            href={href}
            className="text-xs text-emerald-dark hover:opacity-80 inline-flex items-center gap-1"
          >
            {hrefLabel ?? "Open"}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {error ? (
        <p className="text-xs text-danger flex items-start gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          {error}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">{children}</div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.15em] text-text-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          highlight ? "text-warning" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
