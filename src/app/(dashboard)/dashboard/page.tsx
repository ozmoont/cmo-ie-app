import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getCurrentUser,
  getProfile,
  getProjects,
  getDailyRuns,
  getResultsForRuns,
  computeVisibilityScore,
} from "@/lib/queries";
import { MODEL_LABELS } from "@/lib/types";
import type { Organisation } from "@/lib/types";
import { relativeTime, classifyDelta } from "@/lib/format";
import { computeNextScanEta } from "@/lib/scan-schedule";
import { DashboardShell } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { ArrowRight, Plus } from "lucide-react";

export const metadata = {
  title: "Dashboard",
  description: "Your AI visibility portfolio at a glance.",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);
  const orgData = profile?.organisations;
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as
    | { name: string; plan: string; trial_ends_at: string }
    | null
    | undefined;

  const projects = await getProjects();

  // Per-project score, delta, last scan time
  const projectsWithScores = await Promise.all(
    projects.map(async (project) => {
      const runs = await getDailyRuns(project.id, 8);
      const results = await getResultsForRuns(runs.map((r) => r.id));

      const latestResults = runs[0]
        ? results.filter((r) => r.run_id === runs[0].id)
        : [];
      const weekAgoResults = runs[7]
        ? results.filter((r) => r.run_id === runs[7].id)
        : [];

      const score = computeVisibilityScore(latestResults);
      const weekAgoScore = computeVisibilityScore(weekAgoResults);
      const delta = score - weekAgoScore;
      const lastScannedAt =
        runs[0]?.completed_at ?? runs[0]?.created_at ?? null;
      const nextScan = computeNextScanEta({
        plan: (org?.plan ?? "trial") as Organisation["plan"],
        lastRunStartedAt: runs[0]?.created_at ?? null,
      });

      return { ...project, score, delta, lastScannedAt, nextScan };
    })
  );

  // Portfolio-level headline metric
  const portfolioScore =
    projectsWithScores.length > 0
      ? Math.round(
          projectsWithScores.reduce((s, p) => s + p.score, 0) /
            projectsWithScores.length
        )
      : 0;
  const portfolioDelta =
    projectsWithScores.length > 0
      ? Math.round(
          projectsWithScores.reduce((s, p) => s + p.delta, 0) /
            projectsWithScores.length
        )
      : 0;

  // Attention block - up to 3 items that matter this week.
  // Priority: declines first (worst first), then large gains, then fallback.
  const declines = projectsWithScores
    .filter((p) => p.delta <= -2)
    .sort((a, b) => a.delta - b.delta); // most negative first
  const gains = projectsWithScores
    .filter((p) => p.delta >= 5)
    .sort((a, b) => b.delta - a.delta); // biggest first

  const attentionItems = [
    ...declines.slice(0, 3).map((p) => ({
      id: p.id,
      kind: "concern" as const,
      title: p.name,
      detail: `Down ${Math.abs(p.delta)}% since last week`,
      cta: "Review gaps",
      href: `/projects/${p.id}/actions`,
    })),
    ...gains
      .slice(0, Math.max(0, 3 - Math.min(declines.length, 3)))
      .map((p) => ({
        id: p.id,
        kind: "win" as const,
        title: p.name,
        detail: `Up ${p.delta}% since last week`,
        cta: "See what changed",
        href: `/projects/${p.id}`,
      })),
  ];

  // Dublin-local date string
  const today = new Date().toLocaleDateString("en-IE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Dublin",
  });
  const firstName = user.email ? user.email.split("@")[0] : null;

  return (
    <DashboardShell
      orgName={org?.name ?? "CMO.ie"}
      plan={org?.plan ?? "trial"}
      userEmail={user.email}
    >
      {/* ── Page header ── kicker + greeting + primary action */}
      <header className="grid grid-cols-12 gap-6 items-end pb-10 md:pb-14 border-b border-border">
        <div className="col-span-12 md:col-span-9">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold">
            Dashboard · {today}
          </p>
          <h1 className="mt-3 text-3xl md:text-5xl font-semibold text-text-primary tracking-tight leading-[1.05]">
            Welcome back{firstName && `, ${firstName}`}.
          </h1>
        </div>
        <div className="col-span-12 md:col-span-3 md:flex md:justify-end">
          <Link href="/projects/new">
            <Button variant="default" size="default">
              <Plus className="h-4 w-4 mr-2" />
              New project
            </Button>
          </Link>
        </div>
      </header>

      {projectsWithScores.length > 0 ? (
        <>
          {/* ── Hero metric + attention block ──
              Left: type-led portfolio visibility number.
              Right: up to three projects worth attention this week,
              each with a direct link to the page that'll help. */}
          <section className="grid grid-cols-12 gap-6 md:gap-10 py-12 md:py-20 border-b border-border">
            {/* Kicker - a small forest mark anchors the page's single brand moment */}
            <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-6 flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
              Portfolio visibility
            </p>

            {/* Metric */}
            <div className="col-span-12 md:col-span-6">
              <div className="flex items-baseline gap-3">
                <span className="font-mono tabular-nums text-7xl md:text-8xl font-medium text-text-primary leading-none">
                  {portfolioScore}
                </span>
                <span className="font-mono tabular-nums text-3xl md:text-4xl text-text-muted leading-none">
                  %
                </span>
              </div>
              <p className="mt-6 text-base md:text-lg text-text-secondary leading-relaxed max-w-lg">
                {portfolioDelta === 0
                  ? `Flat over the past seven days across your ${projectsWithScores.length} ${projectsWithScores.length === 1 ? "project" : "projects"}.`
                  : portfolioDelta > 0
                    ? `Up ${portfolioDelta} ${portfolioDelta === 1 ? "point" : "points"} over the past seven days across your ${projectsWithScores.length} ${projectsWithScores.length === 1 ? "project" : "projects"}.`
                    : `Down ${Math.abs(portfolioDelta)} ${Math.abs(portfolioDelta) === 1 ? "point" : "points"} over the past seven days across your ${projectsWithScores.length} ${projectsWithScores.length === 1 ? "project" : "projects"}.`}
              </p>
            </div>

            {/* Attention block */}
            <div className="col-span-12 md:col-span-3">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold mb-4">
                {attentionItems.length > 0 ? "Needs attention" : "Weekly status"}
              </p>
              {attentionItems.length > 0 ? (
                <ul className="space-y-4">
                  {attentionItems.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link
                        href={item.href}
                        className="group block -mx-2 px-2 py-1 rounded-md transition-[background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-surface-muted"
                      >
                        <p className="text-sm font-semibold text-text-primary flex items-center gap-2">
                          {/* Status dot - emerald for gains, danger for concerns */}
                          <span
                            aria-hidden="true"
                            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                              item.kind === "concern"
                                ? "bg-danger"
                                : "bg-emerald-dark"
                            }`}
                          />
                          {item.title}
                        </p>
                        <p
                          className={`text-xs mt-0.5 ml-[14px] ${
                            item.kind === "concern"
                              ? "text-danger"
                              : "text-emerald-dark"
                          }`}
                        >
                          {item.detail}
                        </p>
                        <p className="text-xs text-text-muted mt-1 ml-[14px] group-hover:text-text-primary transition-colors inline-flex items-center gap-1">
                          {item.cta}
                          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]" />
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-secondary leading-relaxed">
                  All projects holding steady. Check back after tomorrow&apos;s scan.
                </p>
              )}
            </div>
          </section>

          {/* ── Projects list ── editorial rows with scan time + per-row action */}
          <section className="pt-12 md:pt-16">
            <div className="grid grid-cols-12 gap-6 pb-2">
              <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold">
                Projects · {projectsWithScores.length}
              </p>
            </div>

            <ol className="stagger-children">
              {projectsWithScores.map((project) => {
                const state = classifyDelta(project.delta);
                const modelsText = project.models
                  .map((m) => MODEL_LABELS[m])
                  .join(", ");
                return (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="grid grid-cols-12 gap-4 md:gap-6 py-6 md:py-7 border-t border-border items-center group transition-[background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-surface-muted/60 -mx-4 md:-mx-6 px-4 md:px-6"
                    >
                      {/* Name + full meta (URL · models · scanned) */}
                      <div className="col-span-12 md:col-span-5 min-w-0">
                        <h3 className="text-lg md:text-xl font-semibold text-text-primary tracking-tight truncate group-hover:underline underline-offset-4 decoration-border-strong decoration-2">
                          {project.name}
                        </h3>
                        <p className="text-sm text-text-secondary mt-1 truncate">
                          {project.website_url}
                          {modelsText && (
                            <>
                              <span className="mx-2 text-text-muted">·</span>
                              {modelsText}
                            </>
                          )}
                          <span className="mx-2 text-text-muted">·</span>
                          <span className="text-text-muted">
                            Scanned {relativeTime(project.lastScannedAt)}
                          </span>
                          {project.nextScan.next_scan_at && (
                            <>
                              <span className="mx-2 text-text-muted">·</span>
                              <span
                                className="text-text-muted"
                                title={`${project.nextScan.cadence_label} cadence on your ${org?.plan ?? "trial"} plan`}
                              >
                                Next scan {project.nextScan.relative}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* Visibility score */}
                      <div className="col-span-6 md:col-span-2">
                        <div className="flex items-baseline gap-1">
                          <span className="font-mono tabular-nums text-3xl md:text-4xl font-medium text-text-primary leading-none">
                            {project.score}
                          </span>
                          <span className="font-mono tabular-nums text-base text-text-muted">
                            %
                          </span>
                        </div>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted mt-2 font-semibold">
                          Visibility today
                        </p>
                      </div>

                      {/* 7-day delta */}
                      <div className="col-span-6 md:col-span-2">
                        <span
                          className={`font-mono tabular-nums text-lg md:text-xl font-medium ${
                            state.kind === "declining"
                              ? "text-danger"
                              : state.kind === "growing"
                                ? "text-emerald-dark"
                                : "text-text-muted"
                          }`}
                        >
                          {project.delta > 0 && "+"}
                          {project.delta}
                          <span className="text-sm text-text-muted">%</span>
                        </span>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted mt-2 font-semibold">
                          7-day trend
                        </p>
                      </div>

                      {/* Next action - replaces the plain chevron */}
                      <div className="col-span-12 md:col-span-3 md:justify-self-end md:text-right">
                        {state.kind === "steady" ? (
                          <span className="text-sm text-text-muted">
                            {state.label}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                              state.kind === "declining"
                                ? "text-danger"
                                : "text-emerald-dark"
                            }`}
                          >
                            {state.cta}
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]" />
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      ) : (
        /* ── Empty state ── teaches, doesn't just say "nothing here" */
        <section className="grid grid-cols-12 gap-6 pt-16 md:pt-24 pb-16">
          <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2">
            First steps
          </p>
          <div className="col-span-12 md:col-span-8 max-w-2xl space-y-6">
            <h2 className="text-2xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.1]">
              Let&apos;s set up your first project.
            </h2>
            <p className="text-base md:text-lg text-text-secondary leading-relaxed">
              A project is one brand you want to track. Most people start with
              their own - add your website, pick the AI engines that matter,
              and tell CMO.ie the questions your customers are likely to ask.
              We scan daily and show you where you rank, what changed, and
              what to do about it.
            </p>
            <div className="pt-2">
              <Link href="/projects/new">
                <Button variant="default" size="default">
                  <Plus className="h-4 w-4 mr-2" />
                  Create first project
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
