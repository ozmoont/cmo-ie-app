/**
 * Insights page — the "validity layer" for every dashboard summary.
 *
 * Answers the questions the top-level cards refuse to answer:
 *   - "where did this 27% visibility come from?" → per-prompt table, each
 *     row flagged if the prompt itself is brand-biased.
 *   - "which domains are my 9 citations actually?" → domain table with
 *     counts + which prompts triggered each.
 *   - "what would I actually DO about a gap?" → gap-opportunities list
 *     showing prompts we missed where competitors appeared.
 *
 * Every number on this page is clickable-friendly shape — raw rows we
 * can surface deeper in follow-up iterations. For now we render them
 * as tables so the user can actually see the evidence behind the
 * summary copy.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getLatestRunId,
  getPromptBreakdown,
  getDomainBreakdown,
  getGapOpportunities,
  type PromptBreakdown,
} from "@/lib/insights";
import { checkPromptQuality } from "@/lib/prompt-quality";
import { DashboardShell } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Globe,
  MessageSquare,
  Target,
} from "lucide-react";

export default async function InsightsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) notFound();

  const runId = await getLatestRunId(supabase, projectId);

  if (!runId) {
    return (
      <DashboardShell
        orgName="CMO.ie"
        plan="pro"
        projectId={projectId}
        projectName={project.name}
      >
        <div className="py-16 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 mb-4">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Insights
          </p>
          <h1 className="text-3xl font-semibold text-text-primary tracking-tight mb-3">
            No runs yet.
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            Trigger a run from the project overview and come back here. This
            page shows the raw evidence behind every summary metric — which
            prompts mentioned your brand, which didn&apos;t, which domains AI
            cited, and where competitors appeared that you didn&apos;t.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const [breakdown, domains, gaps] = await Promise.all([
    getPromptBreakdown(supabase, runId),
    getDomainBreakdown(supabase, runId),
    getGapOpportunities(supabase, runId),
  ]);

  // Compute per-prompt quality flags on the breakdown so we can split
  // "clean" vs "biased" visibility.
  const trackedName =
    project.brand_tracked_name ?? project.brand_name ?? "";
  const aliases = project.brand_aliases ?? [];
  const regex = project.brand_regex_pattern ?? null;

  const breakdownWithQuality = breakdown.map<
    PromptBreakdown & { biased: boolean }
  >((row) => {
    const quality = checkPromptQuality(row.prompt_text, {
      tracked_name: trackedName,
      aliases,
      regex_pattern: regex,
    });
    return { ...row, quality, biased: quality.has_brand_bias };
  });

  // Split visibility: clean vs biased.
  const clean = breakdownWithQuality.filter((r) => !r.biased);
  const biased = breakdownWithQuality.filter((r) => r.biased);
  const cleanMentioned = clean.filter((r) => r.brand_mentioned).length;
  const biasedMentioned = biased.filter((r) => r.brand_mentioned).length;
  const cleanVisibility =
    clean.length > 0
      ? Math.round((cleanMentioned / clean.length) * 100)
      : null;
  const biasedVisibility =
    biased.length > 0
      ? Math.round((biasedMentioned / biased.length) * 100)
      : null;

  return (
    <DashboardShell
      orgName="CMO.ie"
      plan="pro"
      projectId={projectId}
      projectName={project.name}
    >
      {/* ── Header ── */}
      <header className="grid grid-cols-12 gap-6 items-end pb-10 border-b border-border">
        <div className="col-span-12 md:col-span-9">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Insights
            <span className="text-text-muted normal-case tracking-normal font-normal">
              Latest run · {breakdown.length} results
            </span>
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
            Where every number came from.
          </h1>
          <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
            This is the raw ground-truth behind your dashboard. Every prompt
            that ran, every brand named, every source cited — plus a flag on
            prompts that contain your own brand name (which distort the
            top-level metrics).
          </p>
        </div>
      </header>

      {/* ── Headline split: clean vs biased visibility ── */}
      {biased.length > 0 && (
        <section className="mt-8 border-l-2 border-warning pl-4 py-3 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.15em] text-warning font-semibold flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Brand-biased prompts detected
          </p>
          <p className="mt-2 text-sm text-text-primary leading-relaxed">
            <span className="font-mono tabular-nums font-semibold">
              {biased.length}
            </span>{" "}
            of your prompts contain your brand name. AI always echoes back a
            brand named in the question, so these prompts inflate visibility
            and position.
          </p>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            Visibility on{" "}
            <span className="font-mono tabular-nums">
              {biased.length}
            </span>{" "}
            biased prompts:{" "}
            <span className="font-mono tabular-nums font-semibold">
              {biasedVisibility ?? 0}%
            </span>
            .{" "}
            {cleanVisibility !== null && (
              <>
                Visibility on{" "}
                <span className="font-mono tabular-nums">{clean.length}</span>{" "}
                clean prompts:{" "}
                <span className="font-mono tabular-nums font-semibold">
                  {cleanVisibility}%
                </span>{" "}
                — this is the number that matters.
              </>
            )}
          </p>
        </section>
      )}

      {/* ── Per-prompt breakdown ── */}
      <section id="per-prompt" className="grid grid-cols-12 gap-6 md:gap-10 py-10 border-b border-border scroll-mt-24">
        <div className="col-span-12 md:col-span-3 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Per-prompt breakdown
          </p>
          <p className="text-xs text-text-muted leading-relaxed">
            One row per prompt × model from the latest run. Click a row to
            expand the response snippet.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9">
          {breakdownWithQuality.length === 0 ? (
            <p className="text-sm text-text-secondary">No results on the latest run.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {breakdownWithQuality.map((row) => (
                <li
                  key={`${row.prompt_id}-${row.model}`}
                  className="py-5"
                >
                  <details className="group">
                    <summary className="cursor-pointer list-none flex items-start gap-3">
                      <span className="mt-1 shrink-0">
                        {row.brand_mentioned ? (
                          <Eye className="h-4 w-4 text-emerald-dark" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-text-muted" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {row.biased && (
                            <Badge variant="warning" className="shrink-0">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              brand bias
                            </Badge>
                          )}
                          <span className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold font-mono">
                            {row.model}
                          </span>
                          {row.mention_position !== null && (
                            <span className="text-[11px] text-text-muted font-mono">
                              position #{row.mention_position}
                            </span>
                          )}
                          {row.sentiment && (
                            <span className="text-[11px] text-text-muted">
                              · {row.sentiment}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-text-primary leading-snug">
                          {row.prompt_text}
                        </p>
                        <div className="mt-2 flex items-center gap-4 flex-wrap text-[11px] text-text-muted font-mono tabular-nums">
                          <span>
                            sources: {row.source_count}
                            {row.inline_count > 0 &&
                              ` (${row.inline_count} inline)`}
                          </span>
                          {row.brands_named.length > 0 && (
                            <span>
                              brands named: {row.top_brand_preview.join(", ")}
                              {row.brands_named.length > 5 &&
                                ` +${row.brands_named.length - 5} more`}
                            </span>
                          )}
                        </div>
                      </div>
                    </summary>

                    {/* ── Response snippet ── */}
                    <div className="mt-4 ml-7 p-4 bg-surface-hover border-l-2 border-border">
                      <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-2">
                        Response snippet
                      </p>
                      <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap font-mono">
                        {row.response_snippet || "—"}
                      </p>
                      {row.quality &&
                        row.quality.issues.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-border space-y-1">
                            <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
                              Prompt-quality notes
                            </p>
                            {row.quality.issues.map((issue, i) => (
                              <p
                                key={i}
                                className="text-xs text-text-secondary"
                              >
                                <span className="font-mono font-semibold mr-1">
                                  {issue.kind}:
                                </span>
                                {issue.message}
                              </p>
                            ))}
                          </div>
                        )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Domains breakdown ── */}
      <section id="domains" className="grid grid-cols-12 gap-6 md:gap-10 py-10 border-b border-border scroll-mt-24">
        <div className="col-span-12 md:col-span-3 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Source domains
          </p>
          <p className="text-xs text-text-muted leading-relaxed">
            Every domain AI accessed or cited, ranked by total citations.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9">
          {domains.length === 0 ? (
            <p className="text-sm text-text-secondary">No citations recorded.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border font-mono text-sm">
              {domains.map((d) => (
                <li key={d.domain} className="py-3 flex items-center gap-4">
                  <Globe className="h-4 w-4 text-text-muted shrink-0" />
                  <span className="flex-1 truncate text-text-primary">
                    {d.domain}
                  </span>
                  {d.is_brand_domain && (
                    <Badge variant="success" className="shrink-0">
                      you
                    </Badge>
                  )}
                  {d.is_competitor_domain && (
                    <Badge variant="default" className="shrink-0">
                      competitor
                    </Badge>
                  )}
                  <span className="text-text-muted tabular-nums shrink-0">
                    {d.total_citations} cites
                  </span>
                  {d.inline_citations > 0 && (
                    <span className="text-text-muted tabular-nums shrink-0">
                      {d.inline_citations} inline
                    </span>
                  )}
                  <span className="text-text-muted tabular-nums shrink-0 hidden sm:inline">
                    {d.prompts_triggering} prompt
                    {d.prompts_triggering === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Gap opportunities ── */}
      <section id="gaps" className="grid grid-cols-12 gap-6 md:gap-10 py-10 border-b border-border scroll-mt-24">
        <div className="col-span-12 md:col-span-3 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Gap opportunities
            <Badge variant="default" className="ml-1">
              {gaps.length}
            </Badge>
          </p>
          <p className="text-xs text-text-muted leading-relaxed">
            Prompts where competitors were named and your brand wasn&apos;t —
            the highest-leverage places to act.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9">
          {gaps.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No gap opportunities in the latest run. Either you&apos;re being
              mentioned everywhere competitors are (good), or no competitors
              have been named yet (come back after a few more runs).
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {gaps.map((g) => (
                <li key={g.prompt_id} className="py-5">
                  <details className="group">
                    <summary className="cursor-pointer list-none flex items-start gap-3">
                      <Target className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary leading-snug">
                          {g.prompt_text}
                        </p>
                        <div className="mt-2 flex items-center gap-4 flex-wrap text-[11px] text-text-muted font-mono tabular-nums">
                          <span>
                            on {g.models.join(", ")}
                          </span>
                          <span>
                            competitors named:{" "}
                            {g.competitors_mentioned.join(", ")}
                          </span>
                        </div>
                      </div>
                    </summary>
                    {g.latest_snippet && (
                      <div className="mt-4 ml-7 p-4 bg-surface-hover border-l-2 border-border">
                        <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-2 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          What AI actually said
                        </p>
                        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap font-mono">
                          {g.latest_snippet}
                        </p>
                      </div>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Footer summary ── */}
      <section className="pt-10 text-xs text-text-muted">
        <p className="flex items-center gap-2">
          <Check className="h-3 w-3" />
          All numbers on this page are pulled live from the latest{" "}
          <span className="font-mono">daily_runs</span> row. No aggregation,
          no estimates.
        </p>
      </section>
    </DashboardShell>
  );
}
