/**
 * Gap Analysis — URLs tab.
 *
 * Higher-resolution than the Domains tab: per-URL opportunity ranking.
 * Each row links back to the Sources/URLs drawer (for deeper evidence)
 * and to Actions (for the "Act on this" flow, gap context passed via
 * query string until migration 011 lands).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink, FileText, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUrlGaps } from "@/lib/queries/gap-analysis";
import {
  PAGE_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  type PageType,
  type SourceType,
} from "@/lib/classifiers/types";
import { Badge } from "@/components/ui/badge";
import { GapStarsDisplay } from "@/components/dashboard/gap-stars";
import { CsvExportButton } from "@/components/dashboard/csv-export-button";
import { toCsv, csvFilenameStamp } from "@/lib/csv";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; model?: string }>;
}

export default async function GapUrlsPage({
  params,
  searchParams,
}: PageProps) {
  const { id: projectId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, brand_name")
    .eq("id", projectId)
    .maybeSingle<{ id: string; brand_name: string }>();
  if (!project) notFound();

  const from = sp.from ? new Date(sp.from) : undefined;
  const to = sp.to ? new Date(sp.to) : undefined;

  const result = await getUrlGaps(supabase, projectId, {
    from,
    to,
    limit: 100,
  });

  const noCompetitors = result.total_competitors === 0;

  return (
    <>
      <section className="py-10 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-[2px] bg-emerald-dark"
              />
              URL gaps
            </p>
            <p className="mt-3 text-sm text-text-secondary leading-relaxed max-w-2xl">
              {result.rows.length > 0 ? (
                <>
                  Specific pages AI cites for your prompts where{" "}
                  {project.brand_name} is absent and competitors are named.
                  Higher resolution than the Domains tab — useful when the
                  action is pitching one specific editor or submitting to
                  one specific directory.
                </>
              ) : noCompetitors ? (
                <>
                  Add competitors to see where their content out-ranks
                  yours at URL level.
                </>
              ) : (
                <>
                  Nothing to rank yet. The URLs tab needs classification
                  data to hit full strength — run a visibility pass if the
                  cache is warm, or widen the window.
                </>
              )}
            </p>
          </div>
          <dl className="space-y-1 text-xs font-mono tabular-nums md:text-right">
            <div className="flex justify-between gap-8">
              <dt className="text-text-muted">URLs ranked</dt>
              <dd className="text-text-primary">{result.rows.length}</dd>
            </div>
            <div className="flex justify-between gap-8">
              <dt className="text-text-muted">Tracked competitors</dt>
              <dd className="text-text-primary">{result.total_competitors}</dd>
            </div>
          </dl>
        </div>
      </section>

      {noCompetitors ? (
        <section className="py-16 text-center max-w-md mx-auto">
          <AlertCircle className="h-8 w-8 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary leading-relaxed">
            Add competitors on the{" "}
            <Link
              href={`/projects/${projectId}/competitors`}
              className="underline text-text-primary"
            >
              Competitors
            </Link>{" "}
            tab first.
          </p>
        </section>
      ) : result.rows.length === 0 ? (
        <section className="py-16 text-center text-sm text-text-secondary max-w-md mx-auto">
          No URL-level gaps detected in this window.
        </section>
      ) : (
        <section className="py-10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-text-muted">
              {result.rows.length} URL gap
              {result.rows.length === 1 ? "" : "s"}, ranked by Gap Score
            </p>
            <CsvExportButton
              csv={toCsv(result.rows, [
                { header: "URL", get: (g) => g.url },
                { header: "Domain", get: (g) => g.domain },
                { header: "Page type", get: (g) => g.page_type ?? "" },
                { header: "Page title", get: (g) => g.page_title ?? "" },
                { header: "Source type", get: (g) => g.source_type ?? "" },
                { header: "Gap score", get: (g) => g.gap_score },
                { header: "Stars", get: (g) => g.stars },
                { header: "Source reach %", get: (g) => Math.round(g.source_frequency * 100) },
                { header: "Competitor breadth %", get: (g) => Math.round(g.competitor_breadth * 100) },
                { header: "Your presence %", get: (g) => Math.round(g.our_presence * 100) },
                { header: "Chats with source", get: (g) => g.chats_with_source },
                { header: "Competitors present", get: (g) => g.competitors_present },
                { header: "Irish publisher", get: (g) => g.is_irish_publisher },
              ])}
              filename={`${project.brand_name.toLowerCase().replace(/\W+/g, "-")}-gaps-urls-${csvFilenameStamp()}`}
            />
          </div>
          <ul className="space-y-3">
            {result.rows.map((g) => (
              <li
                key={g.url}
                className="border border-border rounded-lg p-5 bg-surface hover:border-emerald-dark/40 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <GapStarsDisplay stars={g.stars} />
                      <Link
                        href={`/projects/${projectId}/sources/urls?url=${encodeURIComponent(g.url)}`}
                        className="flex items-center gap-2 min-w-0 group"
                      >
                        <FileText className="h-4 w-4 text-text-muted shrink-0" />
                        <span className="font-semibold text-text-primary truncate group-hover:underline">
                          {g.page_title ?? shortPath(g.url)}
                        </span>
                      </Link>
                      {g.page_type && (
                        <Badge variant="outline" className="text-[10px]">
                          {PAGE_TYPE_LABELS[g.page_type]}
                        </Badge>
                      )}
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

                    <p className="mt-1 text-[11px] font-mono text-text-muted truncate">
                      {g.domain}
                    </p>

                    {g.competitors_present.length > 0 && (
                      <p className="mt-2 text-xs text-text-secondary">
                        <span className="text-text-muted">
                          Competitors present:
                        </span>{" "}
                        <span className="text-text-primary">
                          {g.competitors_present.join(", ")}
                        </span>
                      </p>
                    )}

                    <dl className="mt-3 grid grid-cols-3 gap-4 text-[11px] font-mono tabular-nums">
                      <div>
                        <dt className="text-text-muted">Source reach</dt>
                        <dd className="text-text-primary">
                          {Math.round(g.source_frequency * 100)}%
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-muted">Competitor breadth</dt>
                        <dd className="text-text-primary">
                          {Math.round(g.competitor_breadth * 100)}%
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-muted">Your presence</dt>
                        <dd className="text-text-primary">
                          {Math.round(g.our_presence * 100)}%
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex md:flex-col gap-2 md:items-end shrink-0">
                    <Link
                      href={actOnHref(projectId, g)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-text-primary text-text-inverse text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity"
                    >
                      Act on this <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs text-text-secondary hover:text-text-primary px-3 py-2"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="py-6 text-xs text-text-muted">
        URL-level gaps are the most actionable — each row points at one
        concrete piece of work (pitch that editor, submit to that
        directory, answer that Reddit thread).
      </p>
    </>
  );
}

function shortPath(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/$/, "");
    if (!path) return u.host.replace(/^www\./, "");
    return path.length > 64 ? path.slice(0, 61) + "…" : path;
  } catch {
    return raw.slice(0, 80);
  }
}

function actOnHref(
  projectId: string,
  gap: { url: string; source_type: SourceType | null; page_type: PageType | null }
): string {
  const qs = new URLSearchParams({
    gap_scope: "url",
    gap_url: gap.url,
  });
  if (gap.source_type) qs.set("gap_source_type", gap.source_type);
  if (gap.page_type) qs.set("gap_page_type", gap.page_type);
  return `/projects/${projectId}/actions/gap?${qs.toString()}`;
}
