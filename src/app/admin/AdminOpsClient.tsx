"use client";

/**
 * Client shell for the admin ops dashboard.
 *
 * Fetches /api/admin/ops/{overview,spend,orgs,events} in parallel on
 * mount. Renders KPIs, a stacked-area-ish SVG chart (inline, no lib
 * so we stay bundle-lean), the top-orgs table and a recent-errors
 * feed.
 *
 * Keep this presentational — any query logic should live in the API
 * route. We pull strings, we render strings.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

interface Overview {
  managed_spend_usd_mtd: number;
  byok_spend_usd_mtd: number;
  runs_mtd: number;
  briefs_mtd: number;
  errors_24h: number;
  active_orgs_by_plan: Record<string, number>;
  month_start: string;
  generated_at: string;
}

interface SpendResponse {
  days: string[];
  series: Record<string, number[]>;
  totals_per_day: number[];
  byok_mode: string;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  managed_spend_mtd: number;
  byok_spend_mtd: number;
  runs_mtd: number;
  last_event_at: string | null;
}

interface EventRow {
  id: string;
  created_at: string;
  provider: string;
  model: string;
  feature: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  byok: boolean;
  success: boolean;
  error_code: string | null;
  duration_ms: number | null;
  org_id: string | null;
  project_id: string | null;
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "var(--color-emerald-dark, #047857)",
  openai: "#10b981",
  perplexity: "#6366f1",
  gemini: "#f59e0b",
  grok: "#ec4899",
  copilot: "#3b82f6",
};

export function AdminOpsClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [spend, setSpend] = useState<SpendResponse | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [errors, setErrors] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [oRes, sRes, orgsRes, errRes] = await Promise.all([
          fetch("/api/admin/ops/overview", { cache: "no-store" }),
          fetch("/api/admin/ops/spend?days=30", { cache: "no-store" }),
          fetch("/api/admin/ops/orgs?limit=25", { cache: "no-store" }),
          fetch("/api/admin/ops/events?success=false&limit=15", {
            cache: "no-store",
          }),
        ]);
        if (!oRes.ok) throw new Error(`overview: ${oRes.status}`);
        if (!sRes.ok) throw new Error(`spend: ${sRes.status}`);
        if (!orgsRes.ok) throw new Error(`orgs: ${orgsRes.status}`);
        if (!errRes.ok) throw new Error(`errors: ${errRes.status}`);
        const oj = (await oRes.json()) as Overview;
        const sj = (await sRes.json()) as SpendResponse;
        const orgsJ = (await orgsRes.json()) as { orgs: OrgRow[] };
        const errJ = (await errRes.json()) as { events: EventRow[] };
        if (cancelled) return;
        setOverview(oj);
        setSpend(sj);
        setOrgs(orgsJ.orgs);
        setErrors(errJ.events);
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : "Load failed");
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
      <p className="mt-8 text-sm text-text-muted">Loading ops data...</p>
    );
  }
  if (loadErr) {
    return (
      <p className="mt-8 text-sm text-red-600">
        Failed to load ops data: {loadErr}
      </p>
    );
  }

  return (
    <>
      {overview && <KpiGrid o={overview} />}
      {spend && <SpendChart s={spend} />}
      <OrgsTable orgs={orgs} />
      <RecentErrors events={errors} />
    </>
  );
}

function KpiGrid({ o }: { o: Overview }) {
  const managed = formatUsd(o.managed_spend_usd_mtd);
  const byok = formatUsd(o.byok_spend_usd_mtd);
  // Rough burn projection assuming linear spend from 1st → today → 30th.
  const day = new Date().getUTCDate();
  const projected =
    day > 0 ? (o.managed_spend_usd_mtd / day) * 30 : o.managed_spend_usd_mtd;

  const totalOrgs = Object.values(o.active_orgs_by_plan).reduce(
    (s, n) => s + n,
    0
  );
  const paid =
    (o.active_orgs_by_plan.starter ?? 0) +
    (o.active_orgs_by_plan.pro ?? 0) +
    (o.active_orgs_by_plan.advanced ?? 0) +
    (o.active_orgs_by_plan.agency ?? 0);

  return (
    <section className="mt-8 grid md:grid-cols-4 gap-4">
      <Kpi
        label="Managed spend MTD"
        value={managed}
        sub={`Projected end-of-month: ${formatUsd(projected)}`}
      />
      <Kpi
        label="BYOK spend MTD"
        value={byok}
        sub="Billed to customers' own keys"
      />
      <Kpi
        label="Runs this month"
        value={o.runs_mtd.toLocaleString()}
        sub={`${o.briefs_mtd.toLocaleString()} briefs generated`}
      />
      <Kpi
        label="Active orgs"
        value={`${totalOrgs.toLocaleString()}`}
        sub={`${paid} paid · ${(o.active_orgs_by_plan.trial ?? 0)} on trial`}
        tone={o.errors_24h > 5 ? "warn" : "default"}
      />
      {o.errors_24h > 0 && (
        <div className="md:col-span-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {o.errors_24h} AI call error{o.errors_24h === 1 ? "" : "s"} in the
          last 24h. See the Recent errors feed below.
        </div>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "warn"
          ? "border-amber-300 bg-amber-50/30"
          : "border-border bg-surface"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.15em] font-semibold text-text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-text-secondary">{sub}</p>}
    </div>
  );
}

function SpendChart({ s }: { s: SpendResponse }) {
  const width = 920;
  const height = 220;
  const padX = 36;
  const padY = 24;
  const n = s.days.length;

  const maxY = Math.max(0.001, ...s.totals_per_day);
  const xAt = (i: number) =>
    padX + ((width - padX * 2) * i) / Math.max(1, n - 1);
  const yAt = (v: number) =>
    height - padY - ((height - padY * 2) * v) / maxY;

  const providers = Object.keys(s.series);
  const totalSpend = s.totals_per_day.reduce((a, b) => a + b, 0);

  return (
    <section className="mt-10 rounded-lg border border-border p-5 bg-surface">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Daily managed spend — last 30 days
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Total: {formatUsd(totalSpend)} · Peak day:{" "}
            {formatUsd(maxY)}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {providers.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 text-xs text-text-secondary"
            >
              <span
                aria-hidden="true"
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: PROVIDER_COLORS[p] ?? "#888" }}
              />
              {p}
            </span>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Daily AI spend by provider"
        className="mt-4 w-full"
      >
        {/* horizontal gridlines at 25/50/75/100% of max */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={padX}
            x2={width - padX}
            y1={yAt(maxY * f)}
            y2={yAt(maxY * f)}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
          />
        ))}
        {/* Each provider as a line */}
        {providers.map((p) => {
          const pts = s.series[p]
            .map((v, i) => `${xAt(i)},${yAt(v)}`)
            .join(" ");
          return (
            <polyline
              key={p}
              points={pts}
              fill="none"
              stroke={PROVIDER_COLORS[p] ?? "#888"}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {/* daily total markers */}
        {s.totals_per_day.map((v, i) => (
          <circle
            key={i}
            cx={xAt(i)}
            cy={yAt(v)}
            r={2}
            fill="currentColor"
            className="text-text-muted"
          >
            <title>{`${s.days[i]}: ${formatUsd(v)}`}</title>
          </circle>
        ))}
        {/* x-axis labels: first, middle, last */}
        <text x={padX} y={height - 4} className="text-[10px] fill-current text-text-muted">
          {s.days[0]}
        </text>
        <text
          x={width / 2}
          y={height - 4}
          textAnchor="middle"
          className="text-[10px] fill-current text-text-muted"
        >
          {s.days[Math.floor(n / 2)]}
        </text>
        <text
          x={width - padX}
          y={height - 4}
          textAnchor="end"
          className="text-[10px] fill-current text-text-muted"
        >
          {s.days[n - 1]}
        </text>
      </svg>
    </section>
  );
}

function OrgsTable({ orgs }: { orgs: OrgRow[] }) {
  if (orgs.length === 0) {
    return (
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">
          Top orgs by managed spend this month
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          No usage events yet. Once the first run lands, this table lights up.
        </p>
      </section>
    );
  }
  return (
    <section className="mt-10 rounded-lg border border-border bg-surface overflow-hidden">
      <header className="px-5 py-4 border-b border-border">
        <h2 className="text-lg font-semibold tracking-tight">
          Top orgs by managed spend this month
        </h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="text-left px-5 py-3 font-semibold">Org</th>
              <th className="text-left px-3 py-3 font-semibold">Plan</th>
              <th className="text-right px-3 py-3 font-semibold">
                Managed spend
              </th>
              <th className="text-right px-3 py-3 font-semibold">BYOK spend</th>
              <th className="text-right px-3 py-3 font-semibold">Runs</th>
              <th className="text-right px-5 py-3 font-semibold">Last active</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="px-5 py-3">
                  <div className="font-medium">{o.name}</div>
                  <div className="text-xs text-text-muted">{o.slug}</div>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-text-primary/5 text-text-primary font-medium">
                    {o.plan}
                  </span>
                </td>
                <td className="text-right px-3 py-3 font-medium tabular-nums">
                  {formatUsd(o.managed_spend_mtd)}
                </td>
                <td className="text-right px-3 py-3 text-text-secondary tabular-nums">
                  {formatUsd(o.byok_spend_mtd)}
                </td>
                <td className="text-right px-3 py-3 tabular-nums">
                  {o.runs_mtd.toLocaleString()}
                </td>
                <td className="text-right px-5 py-3 text-text-muted text-xs">
                  {o.last_event_at ? relTime(o.last_event_at) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentErrors({ events }: { events: EventRow[] }) {
  return (
    <section className="mt-10 rounded-lg border border-border bg-surface overflow-hidden">
      <header className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          Recent errors (24h)
        </h2>
        <Link
          href="/api/admin/ops/events?success=false&limit=100"
          className="text-xs text-text-secondary hover:text-text-primary underline underline-offset-4"
          target="_blank"
        >
          Raw JSON
        </Link>
      </header>
      {events.length === 0 ? (
        <p className="px-5 py-6 text-sm text-text-muted">
          No AI call errors in the last 24 hours. Nice.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((e) => (
            <li key={e.id} className="px-5 py-3 text-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-medium">{e.provider}</span>
                  <span className="text-text-muted"> · {e.feature}</span>
                  <span className="text-text-muted"> · {e.model}</span>
                </div>
                <div className="text-xs text-text-muted tabular-nums">
                  {relTime(e.created_at)}
                </div>
              </div>
              {e.error_code && (
                <p className="mt-1 text-xs text-red-600 break-words">
                  {e.error_code}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatUsd(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
