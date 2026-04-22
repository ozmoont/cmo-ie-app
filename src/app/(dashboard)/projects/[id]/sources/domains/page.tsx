/**
 * Sources → Domains tab.
 *
 * Domain-level evidence for every website the AI models referenced in
 * this project's tracking window. Answers the dashboard's "9 cited
 * domains" without any further navigation.
 *
 * Data comes from /lib/queries/sources.ts (shared with the Gap Analysis
 * workstream). Classification comes from the post-run queue that fires
 * after every visibility run (migration 010). Unclassified domains
 * render in a lighter slate colour and get picked up on the next run.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProjectSourceDomains } from "@/lib/queries/sources";
import {
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_PLAYBOOK,
  type SourceType,
} from "@/lib/classifiers/types";
import { Badge } from "@/components/ui/badge";
import { SourceTypeChart } from "@/components/dashboard/source-type-chart";
import { AlertTriangle, Globe } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    source_type?: string;
    model?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function SourcesDomainsPage({
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

  const sourceTypeFilter =
    sp.source_type &&
    (isKnownSourceType(sp.source_type) || sp.source_type === "unclassified")
      ? (sp.source_type as SourceType | "unclassified")
      : undefined;

  const from = sp.from ? new Date(sp.from) : undefined;
  const to = sp.to ? new Date(sp.to) : undefined;

  const result = await getProjectSourceDomains(supabase, projectId, {
    from,
    to,
    sourceType: sourceTypeFilter,
    limit: 100,
  });

  const totalClassified = Object.entries(result.source_type_counts).reduce(
    (s, [k, v]) => (k === "unclassified" ? s : s + v),
    0
  );
  const totalDomains =
    totalClassified + result.source_type_counts.unclassified;
  const coverage =
    totalDomains > 0 ? Math.round((totalClassified / totalDomains) * 100) : 0;

  return (
    <>
      {/* ── Top metrics + donut ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 border-b border-border">
        <div className="col-span-12 md:col-span-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Source mix
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Every domain AI cited across{" "}
            <span className="font-mono tabular-nums">{result.total_chats}</span>{" "}
            chats in the selected window, bucketed by type.
          </p>
          <dl className="pt-2 space-y-1 text-xs font-mono tabular-nums">
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Distinct domains</dt>
              <dd className="text-text-primary">{totalDomains}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Classified</dt>
              <dd className="text-text-primary">
                {totalClassified} ({coverage}%)
              </dd>
            </div>
          </dl>
        </div>
        <div className="col-span-12 md:col-span-8">
          <SourceTypeChart counts={result.source_type_counts} />
        </div>
      </section>

      {/* ── Filter bar ── */}
      <section className="py-6 border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mr-2">
            Filter
          </span>
          <FilterChip
            href={`/projects/${projectId}/sources/domains`}
            active={!sourceTypeFilter}
            label={`All (${totalDomains})`}
          />
          {(
            [
              "your_own",
              "editorial",
              "corporate",
              "ugc",
              "reference",
              "social",
              "other",
              "unclassified",
            ] as const
          ).map((type) => {
            const count = result.source_type_counts[type] ?? 0;
            if (count === 0) return null;
            return (
              <FilterChip
                key={type}
                href={`/projects/${projectId}/sources/domains?source_type=${type}`}
                active={sourceTypeFilter === type}
                label={`${type === "unclassified" ? "Unclassified" : SOURCE_TYPE_LABELS[type]} (${count})`}
              />
            );
          })}
        </div>
        {sourceTypeFilter && sourceTypeFilter !== "unclassified" && (
          <p className="mt-4 text-xs text-text-secondary leading-relaxed max-w-2xl border-l-2 border-emerald-dark pl-3">
            <span className="font-semibold text-emerald-dark">Playbook:</span>{" "}
            {SOURCE_TYPE_PLAYBOOK[sourceTypeFilter]}
          </p>
        )}
      </section>

      {/* ── Domains table ── */}
      <section className="py-10">
        {result.domains.length === 0 ? (
          <div className="py-16 text-center text-sm text-text-secondary max-w-md mx-auto">
            {sourceTypeFilter
              ? `No domains match the "${sourceTypeFilter}" filter in this window.`
              : "No source data yet. Run a visibility pass to populate this table."}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 md:-mx-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold border-b border-border">
                  <th className="py-3 px-4 md:px-0 md:pr-4">Domain</th>
                  <th className="py-3 pr-4">Type</th>
                  <th className="py-3 pr-4 text-right font-mono">Retrieved</th>
                  <th className="py-3 pr-4 text-right font-mono hidden sm:table-cell">
                    Retrieval rate
                  </th>
                  <th className="py-3 pr-4 text-right font-mono hidden md:table-cell">
                    Inline rate
                  </th>
                  <th className="py-3 pr-4 text-right font-mono">Citations</th>
                </tr>
              </thead>
              <tbody>
                {result.domains.map((d) => (
                  <tr
                    key={d.domain}
                    className="border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors"
                  >
                    <td className="py-3 px-4 md:px-0 md:pr-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="h-3.5 w-3.5 text-text-muted shrink-0" />
                        <span className="text-text-primary truncate">
                          {d.domain}
                        </span>
                        {d.is_brand_domain && (
                          <Badge variant="success" className="shrink-0 text-[10px]">
                            you
                          </Badge>
                        )}
                        {d.is_competitor_domain && (
                          <Badge variant="default" className="shrink-0 text-[10px]">
                            competitor
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      {d.source_type ? (
                        <Badge variant="outline" className="text-[10px]">
                          {SOURCE_TYPE_LABELS[d.source_type]}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-text-muted flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-text-primary">
                      {d.retrieved_pct}%
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-text-muted hidden sm:table-cell">
                      {d.retrieval_rate}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-text-muted hidden md:table-cell">
                      {d.citation_rate}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-text-primary">
                      {d.total_citations}
                      {d.inline_citations > 0 && (
                        <span className="text-text-muted">
                          {" "}
                          ({d.inline_citations} inline)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <p className="py-6 text-xs text-text-muted">
        Showing top {result.domains.length} domains. Classifications run
        automatically after each visibility pass — new domains land in the
        &quot;Pending&quot; bucket until the next run populates the cache.
      </p>
    </>
  );
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1 rounded-full border text-xs transition-colors duration-150 ${
        active
          ? "border-text-primary bg-text-primary text-text-inverse"
          : "border-border text-text-secondary hover:text-text-primary hover:border-border"
      }`}
    >
      {label}
    </Link>
  );
}

function isKnownSourceType(v: string): v is SourceType {
  return (
    [
      "editorial",
      "corporate",
      "ugc",
      "reference",
      "your_own",
      "social",
      "other",
    ] as const
  ).includes(v as SourceType);
}
