/**
 * Gap Analysis — Domains tab.
 *
 * Ranks domains where tracked competitors show up and the tracked
 * brand doesn't. Each row shows:
 *   - Stars (1–3) representing the Gap Score
 *   - The competitors that appeared via this domain
 *   - The source-type playbook text (once classifier has run)
 *   - A pair of drill-down links (Sources view, "Act on this")
 *
 * "Act on this" stays stubbed until P2-E lands (gap-aware brief
 * generator + Actions v2 wiring) — the button is visible but routes
 * to Actions with the gap context packed into the query string so
 * the later work can pick it up without schema changes.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, ArrowRight, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDomainGaps } from "@/lib/queries/gap-analysis";
import {
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_PLAYBOOK,
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

export default async function GapDomainsPage({
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

  const result = await getDomainGaps(supabase, projectId, {
    from,
    to,
    limit: 100,
  });

  const noCompetitors = result.total_competitors === 0;

  return (
    <>
      {/* ── Summary ── */}
      <section className="py-10 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-[2px] bg-emerald-dark"
              />
              Domain gaps
            </p>
            <p className="mt-3 text-sm text-text-secondary leading-relaxed max-w-2xl">
              {result.rows.length > 0 ? (
                <>
                  <span className="font-mono tabular-nums text-text-primary">
                    {result.rows.length}
                  </span>{" "}
                  domains AI reaches for where{" "}
                  <span className="font-mono tabular-nums text-text-primary">
                    {result.total_competitors}
                  </span>{" "}
                  tracked competitor
                  {result.total_competitors === 1 ? "" : "s"} appear and{" "}
                  {project.brand_name} doesn&apos;t. Sorted by opportunity.
                </>
              ) : noCompetitors ? (
                <>
                  Add competitors to see where they appear in AI answers but{" "}
                  {project.brand_name} doesn&apos;t. Gap Analysis compares
                  your brand&apos;s mentions against a comparison set.
                </>
              ) : (
                <>
                  No gaps detected yet. Either the run window is too narrow
                  or your brand is holding its own against the comparison
                  set — which is its own kind of win.
                </>
              )}
            </p>
          </div>
          <dl className="space-y-1 text-xs font-mono tabular-nums md:text-right">
            <div className="flex justify-between gap-8">
              <dt className="text-text-muted">Chats in window</dt>
              <dd className="text-text-primary">{result.total_chats}</dd>
            </div>
            <div className="flex justify-between gap-8">
              <dt className="text-text-muted">Tracked competitors</dt>
              <dd className="text-text-primary">{result.total_competitors}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Body ── */}
      {noCompetitors ? (
        <section className="py-16 text-center max-w-md mx-auto">
          <AlertCircle className="h-8 w-8 text-text-muted mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-text-primary">
            No competitors yet
          </h2>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            Gap Analysis compares your brand&apos;s appearance against a
            tracked set. Add competitors before running the next visibility
            pass.
          </p>
          <Link
            href={`/projects/${projectId}/competitors`}
            className="inline-flex mt-4 items-center gap-1 text-sm text-emerald-dark hover:underline"
          >
            Add competitors <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      ) : result.rows.length === 0 ? (
        <section className="py-16 text-center text-sm text-text-secondary max-w-md mx-auto">
          Nothing to rank yet. Run a visibility pass or widen the date range
          to pull in more evidence.
        </section>
      ) : (
        <section className="py-10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-text-muted">
              {result.rows.length} domain gap
              {result.rows.length === 1 ? "" : "s"}, ranked by Gap Score
            </p>
            <CsvExportButton
              csv={toCsv(result.rows, [
                { header: "Domain", get: (g) => g.domain },
                { header: "Source type", get: (g) => g.source_type ?? "" },
                { header: "Gap score", get: (g) => g.gap_score },
                { header: "Stars", get: (g) => g.stars },
                { header: "Source reach %", get: (g) => Math.round(g.source_frequency * 100) },
                { header: "Competitor breadth %", get: (g) => Math.round(g.competitor_breadth * 100) },
                { header: "Your presence %", get: (g) => Math.round(g.our_presence * 100) },
                { header: "Chats with source", get: (g) => g.chats_with_source },
                { header: "Competitors present", get: (g) => g.competitors_present },
                { header: "Competitor domain", get: (g) => g.is_competitor_domain },
                { header: "Irish publisher", get: (g) => g.is_irish_publisher },
              ])}
              filename={`${project.brand_name.toLowerCase().replace(/\W+/g, "-")}-gaps-domains-${csvFilenameStamp()}`}
            />
          </div>
          <ul className="space-y-3">
            {result.rows.map((g) => (
              <li
                key={g.domain}
                className="border border-border rounded-lg p-5 bg-surface hover:border-emerald-dark/40 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <GapStarsDisplay stars={g.stars} />
                      <Link
                        href={`/projects/${projectId}/sources/urls?domain=${encodeURIComponent(g.domain)}`}
                        className="flex items-center gap-2 min-w-0 group"
                      >
                        <Globe className="h-4 w-4 text-text-muted shrink-0" />
                        <span className="font-semibold text-text-primary truncate group-hover:underline">
                          {g.domain}
                        </span>
                      </Link>
                      {g.source_type && (
                        <Badge variant="outline" className="text-[10px]">
                          {SOURCE_TYPE_LABELS[g.source_type]}
                        </Badge>
                      )}
                      {g.is_competitor_domain && (
                        <Badge variant="default" className="text-[10px]">
                          competitor domain
                        </Badge>
                      )}
                      {g.is_irish_publisher && (
                        <Badge variant="success" className="text-[10px]">
                          Irish opportunity
                        </Badge>
                      )}
                    </div>

                    {/* Competitor chips */}
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

                    {/* Metrics row */}
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

                    {/* Playbook */}
                    {g.source_type && (
                      <Playbook sourceType={g.source_type} />
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex md:flex-col gap-2 md:items-end shrink-0">
                    <Link
                      href={actOnHref(projectId, g)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-text-primary text-text-inverse text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity"
                    >
                      Act on this <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href={`/projects/${projectId}/sources/urls?domain=${encodeURIComponent(g.domain)}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs text-text-secondary hover:text-text-primary px-3 py-2"
                    >
                      View URLs
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="py-6 text-xs text-text-muted">
        Gap Score combines source frequency, competitor breadth, and your
        current presence. Higher stars = bigger opportunity. Classifier-
        pending domains still appear — playbooks unlock once the source
        type is known.
      </p>
    </>
  );
}

function Playbook({ sourceType }: { sourceType: SourceType }) {
  return (
    <div className="mt-3 border-l-2 border-emerald-dark pl-3 text-xs text-text-secondary leading-relaxed">
      <span className="font-semibold text-emerald-dark">Playbook:</span>{" "}
      {SOURCE_TYPE_PLAYBOOK[sourceType]}
    </div>
  );
}

/**
 * Serialise the gap context into the Actions URL so P2-E (gap-aware
 * brief generator) can pick it up without schema work. The column
 * exists as a stub until migration 011 lands — a URL encoding is
 * enough to carry intent through to the next page for now.
 */
function actOnHref(
  projectId: string,
  gap: { domain: string; source_type: SourceType | null }
): string {
  const qs = new URLSearchParams({
    gap_scope: "domain",
    gap_domain: gap.domain,
  });
  if (gap.source_type) qs.set("gap_source_type", gap.source_type);
  return `/projects/${projectId}/actions/gap?${qs.toString()}`;
}
