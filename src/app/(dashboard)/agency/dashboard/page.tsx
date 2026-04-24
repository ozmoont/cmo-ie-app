/**
 * /agency/dashboard — every project under an agency org at a glance.
 *
 * One card per project with:
 *   - 30-day visibility %
 *   - 14-day sparkline (inline SVG, no Recharts dep)
 *   - Domain gap count (approx)
 *   - Last run timestamp
 *   - Click-through to the project's overview
 *
 * Server-rendered. Only surfaces when org.plan === 'agency'. Any other
 * plan gets the same "upgrade" panel as /agency/billing.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, AlertCircle, Globe } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser, getProfile, getOrgBriefCredits } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { getAgencyRollup, type AgencyRollupRow } from "@/lib/queries/agency-rollup";

export const metadata = {
  title: "Agency dashboard — CMO.ie",
  description:
    "Every client project in your organisation, ranked by visibility and urgency.",
};

export default async function AgencyDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  if (!profile) redirect("/login");

  const org = Array.isArray(profile.organisations)
    ? profile.organisations[0]
    : (profile.organisations as { id: string; name: string; plan: string } | null);
  if (!org?.id) redirect("/login");

  const pool = await getOrgBriefCredits(org.id);

  return (
    <DashboardShell orgName={org.name} userEmail={user.email}>
      <header className="pb-8 border-b border-border">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Back to projects
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Agency dashboard
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          Every client, on one page.
        </h1>
        <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
          Thirty-day visibility and active gaps for every project you run.
          Click into any client for the full drill-down.
        </p>
      </header>

      {pool.plan !== "agency" ? (
        <section className="py-10">
          <div className="max-w-2xl border-l-2 border-warning pl-4 py-3">
            <p className="text-xs uppercase tracking-[0.15em] text-warning font-semibold flex items-center gap-2 mb-2">
              <AlertCircle className="h-3.5 w-3.5" /> Agency plan required
            </p>
            <p className="text-sm text-text-primary leading-relaxed">
              The roll-up dashboard is part of the <strong>Agency</strong> plan.
              You&apos;re on <strong className="capitalize">{pool.plan}</strong>.{" "}
              <Link href="/agency" className="underline text-text-primary">
                See agency features
              </Link>
              .
            </p>
          </div>
        </section>
      ) : (
        <AgencyProjectsList orgId={org.id} />
      )}
    </DashboardShell>
  );
}

async function AgencyProjectsList({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const { rows } = await getAgencyRollup(supabase, orgId);

  if (rows.length === 0) {
    return (
      <section className="py-16 text-center max-w-md mx-auto">
        <p className="text-sm text-text-secondary leading-relaxed">
          No projects yet.{" "}
          <Link href="/projects/new" className="underline text-text-primary">
            Create your first client project
          </Link>{" "}
          to see it appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="py-10">
      <ul className="space-y-3">
        {rows.map((row) => (
          <AgencyRow key={row.project_id} row={row} />
        ))}
      </ul>
    </section>
  );
}

function AgencyRow({ row }: { row: AgencyRollupRow }) {
  const visColour =
    row.visibility_30d === null
      ? "text-text-muted"
      : row.visibility_30d >= 50
        ? "text-emerald-dark"
        : row.visibility_30d >= 20
          ? "text-warning"
          : "text-danger";

  return (
    <li className="border border-border rounded-lg bg-surface hover:border-emerald-dark/40 transition-colors">
      <Link
        href={`/projects/${row.project_id}`}
        className="grid grid-cols-12 gap-4 p-5 items-center"
      >
        {/* Brand */}
        <div className="col-span-12 md:col-span-4 min-w-0">
          <p className="text-base font-semibold text-text-primary truncate">
            {row.brand_display_name ?? row.brand_name}
          </p>
          {row.website_url && (
            <p className="mt-0.5 text-[11px] font-mono text-text-muted truncate flex items-center gap-1">
              <Globe className="h-3 w-3 shrink-0" />
              {new URL(row.website_url).host.replace(/^www\./, "")}
            </p>
          )}
        </div>

        {/* Visibility number */}
        <div className="col-span-4 md:col-span-2 text-left md:text-right">
          <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted font-semibold">
            30d visibility
          </p>
          <p
            className={`font-mono tabular-nums text-2xl md:text-3xl font-medium leading-none mt-1 ${visColour}`}
          >
            {row.visibility_30d === null ? "—" : `${row.visibility_30d}%`}
          </p>
        </div>

        {/* Gap count */}
        <div className="col-span-4 md:col-span-2 text-left md:text-right">
          <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted font-semibold">
            Gaps
          </p>
          <p className="font-mono tabular-nums text-2xl md:text-3xl font-medium text-text-primary leading-none mt-1">
            {row.domain_gap_count}
          </p>
        </div>

        {/* Sparkline */}
        <div className="col-span-4 md:col-span-3 hidden md:block">
          <Sparkline points={row.trend_14d} />
        </div>

        {/* Arrow */}
        <div className="col-span-12 md:col-span-1 md:text-right">
          <ArrowRight className="h-4 w-4 text-text-muted ml-auto" />
        </div>

        {/* Meta row */}
        <div className="col-span-12 text-[11px] font-mono text-text-muted tabular-nums">
          {row.last_run_at ? (
            <>
              Last run{" "}
              {new Date(row.last_run_at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </>
          ) : (
            <>Never run — click to set up.</>
          )}
        </div>
      </Link>
    </li>
  );
}

function Sparkline({ points }: { points: { date: string; visibility_pct: number }[] }) {
  if (points.length < 2) {
    return (
      <div className="text-[11px] font-mono text-text-muted text-right">
        Not enough data
      </div>
    );
  }
  const width = 160;
  const height = 36;
  const pad = 2;
  const step = (width - pad * 2) / Math.max(points.length - 1, 1);
  const yFor = (v: number) =>
    pad + (height - pad * 2) - (Math.max(0, Math.min(100, v)) / 100) * (height - pad * 2);
  const line = points
    .map(
      (p, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)} ${yFor(p.visibility_pct).toFixed(1)}`
    )
    .join(" ");
  const latest = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-9">
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-emerald-dark"
      />
      <circle
        cx={pad + (points.length - 1) * step}
        cy={yFor(latest.visibility_pct)}
        r={1.8}
        className="fill-emerald-dark"
      />
    </svg>
  );
}
