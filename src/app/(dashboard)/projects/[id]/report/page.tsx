/**
 * /projects/[id]/report — printable one-pager.
 *
 * Deliberately not wrapped in DashboardShell. We want an empty canvas
 * so the browser's "Save as PDF" dialog produces a clean document
 * without us fighting the sticky header, sidebar, and SubNav.
 *
 * Sections (in order):
 *   1. Cover — brand, window, date generated
 *   2. Headline visibility %
 *   3. Per-model snapshot
 *   4. Top 5 gap domains (Irish-weighted when IE is tracked)
 *   5. Top cited sources
 *   6. Recent response snippets (up to 3)
 *
 * Every section uses `.print-avoid-break` to stop a row getting
 * split across pages. The cover gets a visual divider via margin
 * alone — no page-break before section 2, so short reports fit on
 * one page where possible.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/dashboard/print-button";
import { Badge } from "@/components/ui/badge";
import { getDomainGaps } from "@/lib/queries/gap-analysis";
import { getProjectSourceDomains } from "@/lib/queries/sources";
import { computeShareOfVoice } from "@/lib/format";
import { MODEL_LABELS, type AIModel } from "@/lib/types";
import { SOURCE_TYPE_LABELS } from "@/lib/classifiers/types";

const WINDOW_DAYS = 30;

export const metadata = {
  title: "Report — CMO.ie",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, brand_name, brand_display_name, website_url, country_codes, models"
    )
    .eq("id", projectId)
    .maybeSingle<{
      id: string;
      name: string;
      brand_name: string;
      brand_display_name: string | null;
      website_url: string | null;
      country_codes: string[] | null;
      models: AIModel[] | null;
    }>();
  if (!project) notFound();

  // Server component — each render IS a fresh report for "now". The
  // impurity lint rule fires for client components that might re-render
  // unpredictably; it doesn't apply here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const windowStart = new Date(now - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now);

  // Pull metrics in parallel.
  const [resultsRes, gapRes, sourcesRes, recentRes] = await Promise.all([
    supabase
      .from("results")
      .select(
        "id, model, brand_mentioned, mention_position, sentiment, prompts!inner(project_id)"
      )
      .eq("prompts.project_id", projectId)
      .gte("created_at", windowStart.toISOString()),
    getDomainGaps(supabase, projectId, { limit: 5 }),
    getProjectSourceDomains(supabase, projectId, {
      from: windowStart,
      to: windowEnd,
      limit: 10,
    }),
    supabase
      .from("results")
      .select(
        "id, model, brand_mentioned, mention_position, response_snippet, created_at, prompts!inner(text, project_id)"
      )
      .eq("prompts.project_id", projectId)
      .eq("brand_mentioned", true)
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const results = (resultsRes.data ?? []) as Array<{
    id: string;
    model: string;
    brand_mentioned: boolean;
    mention_position: number | null;
    sentiment: string | null;
  }>;
  const total = results.length;
  const mentioned = results.filter((r) => r.brand_mentioned).length;
  const visibility = total > 0 ? Math.round((mentioned / total) * 100) : 0;

  // Share of Voice — optional, but a key sales-narrative number.
  const resultIds = results.map((r) => r.id);
  let trackedMentions = 0;
  let totalMentions = 0;
  if (resultIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < resultIds.length; i += CHUNK) {
      const slice = resultIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from("result_brand_mentions")
        .select("is_tracked_brand")
        .in("result_id", slice);
      for (const m of data ?? []) {
        totalMentions += 1;
        if (m.is_tracked_brand) trackedMentions += 1;
      }
    }
  }
  const sov = computeShareOfVoice(trackedMentions, totalMentions);

  // Per-model snapshot.
  const byModel = new Map<
    string,
    { total: number; mentioned: number; positions: number[] }
  >();
  for (const r of results) {
    const entry = byModel.get(r.model) ?? {
      total: 0,
      mentioned: 0,
      positions: [],
    };
    entry.total += 1;
    if (r.brand_mentioned) entry.mentioned += 1;
    if (typeof r.mention_position === "number")
      entry.positions.push(r.mention_position);
    byModel.set(r.model, entry);
  }

  const recentChats = (recentRes.data ?? []) as Array<{
    id: string;
    model: string;
    mention_position: number | null;
    response_snippet: string | null;
    created_at: string;
    prompts: { text: string } | { text: string }[] | null;
  }>;

  return (
    <div className="min-h-screen bg-background text-text-primary">
      {/* Action bar — hidden in print */}
      <div className="no-print border-b border-border bg-surface">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between">
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-3 w-3" /> Back to project
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* Report body */}
      <main className="max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-16 space-y-12">
        {/* ── Cover ── */}
        <section className="print-avoid-break">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            AI visibility report
          </p>
          <h1 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1]">
            {project.brand_display_name ?? project.brand_name}
          </h1>
          <p className="mt-2 text-sm text-text-secondary font-mono tabular-nums">
            Window: {fmtDate(windowStart)} → {fmtDate(windowEnd)} ·
            Generated {fmtDate(new Date())} · CMO.ie
          </p>
          {project.website_url && (
            <p className="mt-1 text-xs font-mono text-text-muted">
              {project.website_url}
            </p>
          )}
        </section>

        {/* ── Headline ── */}
        <section className="print-avoid-break border-t border-border pt-8">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
            Visibility (30 days)
          </p>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-mono tabular-nums text-6xl md:text-7xl font-medium leading-none">
              {visibility}
            </span>
            <span className="text-3xl text-text-muted">%</span>
            <span className="ml-4 text-sm text-text-secondary">
              Mentioned in {mentioned} of {total} checks
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Metric label="Share of voice" value={`${sov}%`} />
            <Metric
              label="Tracked mentions"
              value={trackedMentions.toString()}
            />
            <Metric label="All mentions" value={totalMentions.toString()} />
            <Metric
              label="Avg position"
              value={avgPosition(results) ?? "—"}
            />
          </div>
        </section>

        {/* ── Per-model ── */}
        {byModel.size > 0 && (
          <section className="print-avoid-break border-t border-border pt-8">
            <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold mb-3">
              By model
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold border-b border-border">
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4 text-right font-mono">Checks</th>
                  <th className="py-2 pr-4 text-right font-mono">Mentioned</th>
                  <th className="py-2 pr-4 text-right font-mono">
                    Visibility
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byModel.entries())
                  .sort((a, b) => (a[0] < b[0] ? -1 : 1))
                  .map(([model, stats]) => {
                    const pct =
                      stats.total > 0
                        ? Math.round((stats.mentioned / stats.total) * 100)
                        : 0;
                    return (
                      <tr key={model} className="border-b border-border">
                        <td className="py-2 pr-4">
                          {MODEL_LABELS[model as AIModel] ?? model}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">
                          {stats.total}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">
                          {stats.mentioned}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">
                          {pct}%
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        )}

        {/* ── Top gaps ── */}
        <section className="border-t border-border pt-8">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
            Top opportunities
          </p>
          <p className="mt-1 text-sm text-text-secondary leading-relaxed">
            Where tracked competitors appear and{" "}
            {project.brand_display_name ?? project.brand_name} doesn&apos;t.
            Ranked by Gap Score{project.country_codes?.includes("IE") &&
              ", Irish-publisher-weighted"}
            .
          </p>
          {gapRes.rows.length === 0 ? (
            <p className="mt-4 text-sm text-text-secondary">
              No gap data available yet for this window.
            </p>
          ) : (
            <ol className="mt-4 space-y-3">
              {gapRes.rows.map((g, i) => (
                <li
                  key={g.domain}
                  className="print-avoid-break grid grid-cols-[24px_1fr_auto] gap-3 items-start border-b border-border pb-3 last:border-b-0"
                >
                  <span className="font-mono tabular-nums text-sm text-text-muted pt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text-primary">
                        {g.domain}
                      </span>
                      {g.source_type && (
                        <Badge variant="outline" className="text-[10px]">
                          {SOURCE_TYPE_LABELS[g.source_type]}
                        </Badge>
                      )}
                      {g.is_irish_publisher && (
                        <Badge variant="success" className="text-[10px]">
                          Irish opportunity
                        </Badge>
                      )}
                    </div>
                    {g.competitors_present.length > 0 && (
                      <p className="mt-1 text-xs text-text-secondary">
                        Competitors present: {g.competitors_present.join(", ")}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] font-mono tabular-nums text-text-muted">
                      Reach {Math.round(g.source_frequency * 100)}% · Breadth{" "}
                      {Math.round(g.competitor_breadth * 100)}% · Your
                      presence {Math.round(g.our_presence * 100)}%
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums text-xs">
                    <div className="text-emerald-dark">
                      {"★".repeat(g.stars)}
                      {"☆".repeat(3 - g.stars)}
                    </div>
                    <div className="text-text-muted">
                      score {g.gap_score.toFixed(2)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ── Sources ── */}
        <section className="border-t border-border pt-8 print-page-break">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
            Top cited sources
          </p>
          <p className="mt-1 text-sm text-text-secondary leading-relaxed">
            Domains the AI models reached for when answering this project&apos;s
            prompts. Appearing here means AI trusts the source — which is
            how you get recommended.
          </p>
          {sourcesRes.domains.length === 0 ? (
            <p className="mt-4 text-sm text-text-secondary">
              No citations recorded yet.
            </p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold border-b border-border">
                  <th className="py-2 pr-4">Domain</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4 text-right font-mono">
                    Retrieved
                  </th>
                  <th className="py-2 pr-4 text-right font-mono">Citations</th>
                </tr>
              </thead>
              <tbody>
                {sourcesRes.domains.map((d) => (
                  <tr
                    key={d.domain}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="py-2 pr-4">
                      <span className="font-medium">{d.domain}</span>
                      {d.is_brand_domain && (
                        <Badge
                          variant="success"
                          className="ml-2 text-[10px]"
                        >
                          you
                        </Badge>
                      )}
                      {d.is_competitor_domain && (
                        <Badge
                          variant="default"
                          className="ml-2 text-[10px]"
                        >
                          competitor
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-text-muted">
                      {d.source_type
                        ? SOURCE_TYPE_LABELS[d.source_type]
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">
                      {d.retrieved_pct}%
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">
                      {d.total_citations}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── Recent responses ── */}
        {recentChats.length > 0 && (
          <section className="border-t border-border pt-8 print-avoid-break">
            <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
              Sample responses
            </p>
            <p className="mt-1 text-sm text-text-secondary leading-relaxed">
              Three recent AI responses where{" "}
              {project.brand_display_name ?? project.brand_name} was
              mentioned. Verbatim, trimmed for length.
            </p>
            <ul className="mt-4 space-y-5">
              {recentChats.map((c) => {
                const prompt = Array.isArray(c.prompts)
                  ? c.prompts[0]?.text
                  : c.prompts?.text;
                return (
                  <li
                    key={c.id}
                    className="print-avoid-break border-l-2 border-emerald-dark pl-4"
                  >
                    <p className="text-[11px] uppercase tracking-[0.1em] text-text-muted font-mono">
                      {MODEL_LABELS[c.model as AIModel] ?? c.model}
                      {c.mention_position
                        ? ` · position #${c.mention_position}`
                        : ""}{" "}
                      · {fmtDate(new Date(c.created_at))}
                    </p>
                    {prompt && (
                      <p className="mt-1 text-sm font-semibold text-text-primary">
                        &ldquo;{prompt}&rdquo;
                      </p>
                    )}
                    {c.response_snippet && (
                      <p className="mt-2 text-sm text-text-secondary leading-relaxed italic">
                        {c.response_snippet.slice(0, 400)}
                        {(c.response_snippet.length ?? 0) > 400 ? "…" : ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ── Footer ── */}
        <footer className="border-t border-border pt-6 text-xs text-text-muted">
          <p>
            This report was generated by CMO.ie on{" "}
            {fmtDate(new Date())}. For a live, filterable view of every
            metric above, visit the project dashboard at cmo.ie.
          </p>
        </footer>
      </main>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold">
        {label}
      </p>
      <p className="mt-1 font-mono tabular-nums text-xl font-medium text-text-primary">
        {value}
      </p>
    </div>
  );
}

function fmtDate(d: Date): string {
  try {
    return d.toLocaleDateString("en-IE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function avgPosition(
  results: Array<{ mention_position: number | null }>
): string | null {
  const positions = results
    .map((r) => r.mention_position)
    .filter((p): p is number => typeof p === "number" && p > 0);
  if (positions.length === 0) return null;
  const avg = positions.reduce((a, b) => a + b, 0) / positions.length;
  return `#${avg.toFixed(1)}`;
}
