/**
 * Per-prompt detail page (P2-F2).
 *
 * The "where exactly did this number come from?" view for one specific
 * tracked prompt. Covers:
 *   - Visibility % over the last 90 days (single number + sparkline)
 *   - Latest per-model snapshot (who said what most recently)
 *   - Sources cited in responses to this prompt
 *   - Brands named in responses to this prompt (tracked brand first,
 *     then competitors, then other)
 *   - Response history (collapsible, full snippet per check)
 *
 * Server-rendered — the sparkline is an inline SVG so we don't pull in
 * Recharts for one chart.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Globe,
  Users,
  MessageSquare,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { createClient } from "@/lib/supabase/server";
import { getPromptDetail } from "@/lib/queries/prompt-detail";
import { MODEL_LABELS, CATEGORY_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface PageProps {
  params: Promise<{ id: string; promptId: string }>;
}

export default async function PromptDetailPage({ params }: PageProps) {
  const { id: projectId, promptId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, brand_name")
    .eq("id", projectId)
    .maybeSingle<{ id: string; name: string; brand_name: string }>();
  if (!project) notFound();

  const detail = await getPromptDetail(supabase, projectId, promptId);
  if (!detail) notFound();

  return (
    <DashboardShell
      orgName="CMO.ie"
      plan="pro"
      projectId={projectId}
      projectName={project.name}
    >
      {/* ── Header ── */}
      <header className="pb-8 border-b border-border">
        <Link
          href={`/projects/${projectId}/prompts`}
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Back to prompts
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="text-[10px]">
            {CATEGORY_LABELS[
              detail.prompt.category as keyof typeof CATEGORY_LABELS
            ] ?? detail.prompt.category}
          </Badge>
          {detail.prompt.country_code && (
            <Badge variant="outline" className="text-[10px]">
              {detail.prompt.country_code}
            </Badge>
          )}
          {detail.prompt.status !== "active" && (
            <Badge variant="warning" className="text-[10px]">
              {detail.prompt.status}
            </Badge>
          )}
        </div>
        <h1 className="mt-4 text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.2]">
          &ldquo;{detail.prompt.text}&rdquo;
        </h1>
      </header>

      {/* ── Headline metric + sparkline ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 border-b border-border">
        <div className="col-span-12 md:col-span-5 space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Visibility (last 90d)
          </p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-6xl font-medium text-text-primary leading-none">
              {detail.visibility_pct}
            </span>
            <span className="font-mono tabular-nums text-2xl text-text-muted leading-none">
              %
            </span>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            Mentioned in{" "}
            <span className="font-mono tabular-nums text-text-primary">
              {detail.total_mentions}
            </span>{" "}
            of{" "}
            <span className="font-mono tabular-nums text-text-primary">
              {detail.total_runs}
            </span>{" "}
            checks on this prompt.
          </p>
        </div>
        <div className="col-span-12 md:col-span-7 flex items-end">
          <TrendSparkline points={detail.trend} brandName={project.brand_name} />
        </div>
      </section>

      {/* ── Latest per-model ── */}
      {detail.latest_per_model.length > 0 && (
        <section className="py-10 border-b border-border">
          <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 mb-4">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Latest per model
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {detail.latest_per_model.map((r) => (
              <div
                key={r.model}
                className="border border-border rounded-lg p-4 bg-surface"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {MODEL_LABELS[r.model]}
                  </span>
                  {r.brand_mentioned ? (
                    <Badge variant="success" className="text-[10px] gap-1">
                      <Eye className="h-3 w-3" /> Mentioned
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-[10px] gap-1">
                      <EyeOff className="h-3 w-3" /> Absent
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] font-mono text-text-muted tabular-nums mb-2">
                  {formatDate(r.created_at)}
                  {r.mention_position !== null && (
                    <> · position #{r.mention_position}</>
                  )}
                  {r.sentiment && <> · {r.sentiment}</>}
                </div>
                {r.response_snippet && (
                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
                    {r.response_snippet}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Sources + Brands side by side ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-10 py-10 border-b border-border">
        <div>
          <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 mb-4">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Sources cited
          </h2>
          {detail.sources.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No citations recorded for this prompt yet.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {detail.sources.slice(0, 15).map((s) => (
                <li
                  key={s.domain}
                  className="py-2.5 flex items-center gap-3 text-sm"
                >
                  <Globe className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <Link
                    href={`/projects/${projectId}/sources/urls?domain=${encodeURIComponent(s.domain)}`}
                    className="text-text-primary truncate hover:underline flex-1 min-w-0"
                  >
                    {s.domain}
                  </Link>
                  {s.is_brand_domain && (
                    <Badge
                      variant="success"
                      className="shrink-0 text-[10px]"
                    >
                      you
                    </Badge>
                  )}
                  {s.is_competitor_domain && (
                    <Badge
                      variant="default"
                      className="shrink-0 text-[10px]"
                    >
                      competitor
                    </Badge>
                  )}
                  <span className="text-text-muted tabular-nums shrink-0 text-xs">
                    {s.total_citations}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 mb-4">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Brands named
          </h2>
          {detail.brands.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No brand mentions extracted from responses to this prompt yet.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {detail.brands.slice(0, 15).map((b) => (
                <li
                  key={b.brand_name}
                  className="py-2.5 flex items-center gap-3 text-sm"
                >
                  <Users className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <span
                    className={`truncate flex-1 min-w-0 ${
                      b.is_tracked_brand
                        ? "text-emerald-dark font-semibold"
                        : "text-text-primary"
                    }`}
                  >
                    {b.brand_name}
                  </span>
                  {b.is_tracked_brand && (
                    <Badge
                      variant="success"
                      className="shrink-0 text-[10px]"
                    >
                      you
                    </Badge>
                  )}
                  {b.competitor_id && (
                    <Badge
                      variant="default"
                      className="shrink-0 text-[10px]"
                    >
                      competitor
                    </Badge>
                  )}
                  {b.best_position !== null && (
                    <span className="text-text-muted tabular-nums shrink-0 text-xs">
                      best #{b.best_position}
                    </span>
                  )}
                  <span className="text-text-muted tabular-nums shrink-0 text-xs">
                    {b.mentions}×
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Response history ── */}
      <section className="py-10">
        <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 mb-4">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Response history ({detail.results.length})
        </h2>
        {detail.results.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No checks yet — run a visibility pass to populate this history.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {detail.results.map((r) => (
              <li key={r.result_id} className="py-4">
                <details className="group">
                  <summary className="cursor-pointer list-none flex items-start gap-3">
                    <span className="mt-1 shrink-0">
                      {r.brand_mentioned ? (
                        <Eye className="h-4 w-4 text-emerald-dark" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-text-muted" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs uppercase tracking-[0.1em] font-mono text-text-muted">
                          {MODEL_LABELS[r.model]}
                        </span>
                        <span className="text-[11px] font-mono text-text-muted tabular-nums">
                          {formatDate(r.created_at)}
                        </span>
                        {r.mention_position !== null && (
                          <span className="text-[11px] font-mono text-text-muted tabular-nums">
                            position #{r.mention_position}
                          </span>
                        )}
                        {r.sentiment && (
                          <span className="text-[11px] text-text-muted">
                            · {r.sentiment}
                          </span>
                        )}
                      </div>
                      {r.response_snippet && (
                        <p className="mt-1 text-xs text-text-secondary line-clamp-2 group-open:hidden">
                          {r.response_snippet}
                        </p>
                      )}
                    </div>
                  </summary>
                  <div className="mt-3 ml-7 p-4 bg-surface-hover border-l-2 border-border">
                    <p className="text-xs uppercase tracking-[0.1em] text-text-muted font-semibold mb-2">
                      Full snippet
                    </p>
                    <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap font-mono">
                      {r.response_snippet || "—"}
                    </p>
                    <p className="mt-3 text-[11px] font-mono text-text-muted">
                      <Link
                        href={`/projects/${projectId}/insights`}
                        className="inline-flex items-center gap-1 hover:text-text-primary"
                      >
                        <MessageSquare className="h-3 w-3" /> View in Insights
                      </Link>
                      {r.model_version && (
                        <>
                          {" · "}
                          <span>{r.model_version}</span>
                        </>
                      )}
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

interface TrendSparklineProps {
  points: { date: string; visibility_pct: number; total: number }[];
  brandName: string;
}

function TrendSparkline({ points, brandName }: TrendSparklineProps) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-text-muted">
        Not enough history for a trend yet. Run a couple more visibility
        passes to see the arc of {brandName}&apos;s visibility on this prompt.
      </p>
    );
  }

  const width = 600;
  const height = 120;
  const paddingX = 12;
  const paddingY = 20;
  const innerW = width - paddingX * 2;
  const innerH = height - paddingY * 2;

  const xStep = innerW / Math.max(points.length - 1, 1);
  const yFor = (v: number) =>
    paddingY + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;

  const line = points
    .map((p, i) => {
      const x = paddingX + i * xStep;
      const y = yFor(p.visibility_pct);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  // Simple filled area under the curve.
  const area = `${line} L${(paddingX + (points.length - 1) * xStep).toFixed(2)} ${(paddingY + innerH).toFixed(2)} L${paddingX.toFixed(2)} ${(paddingY + innerH).toFixed(2)} Z`;

  const latest = points[points.length - 1];
  const earliest = points[0];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Visibility trend from ${earliest.date} to ${latest.date}`}
        className="w-full h-[120px]"
      >
        <path
          d={area}
          fill="currentColor"
          className="text-emerald-dark/10"
        />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-emerald-dark"
        />
        {/* baseline */}
        <line
          x1={paddingX}
          x2={width - paddingX}
          y1={yFor(0)}
          y2={yFor(0)}
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-border"
        />
        {/* latest marker */}
        <circle
          cx={paddingX + (points.length - 1) * xStep}
          cy={yFor(latest.visibility_pct)}
          r={3}
          className="fill-emerald-dark"
        />
      </svg>
      <div className="flex justify-between text-[11px] font-mono text-text-muted tabular-nums mt-1">
        <span>{earliest.date}</span>
        <span>{latest.date}</span>
      </div>
    </div>
  );
}

