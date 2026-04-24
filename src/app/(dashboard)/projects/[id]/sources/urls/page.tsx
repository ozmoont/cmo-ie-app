/**
 * Sources → URLs tab (P2-C).
 *
 * Every URL the AI models cited in this project's window, with
 * page-type classification, per-URL aggregate metrics, and a
 * drill-in drawer showing the prompts that triggered each URL.
 *
 * The drawer is driven by the `?url=` query param — fully SSR, no
 * client JS required, sharable by link. `?domain=` + `?page_type=`
 * scope the list.
 *
 * Data comes from lib/queries/sources.ts. Page-type classifications
 * land lazily from the post-run classifier queue (migration 010).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getProjectSourceUrls,
  getProjectSourceUrlDetail,
  type SourceUrlDetail,
} from "@/lib/queries/sources";
import {
  PAGE_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_PLAYBOOK,
  type PageType,
} from "@/lib/classifiers/types";
import { Badge } from "@/components/ui/badge";
import { CsvExportButton } from "@/components/dashboard/csv-export-button";
import { toCsv, csvFilenameStamp } from "@/lib/csv";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    domain?: string;
    page_type?: string;
    model?: string;
    from?: string;
    to?: string;
    url?: string;
  }>;
}

export default async function SourcesUrlsPage({
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

  const pageTypeFilter =
    sp.page_type &&
    (isKnownPageType(sp.page_type) || sp.page_type === "unclassified")
      ? (sp.page_type as PageType | "unclassified")
      : undefined;

  const from = sp.from ? new Date(sp.from) : undefined;
  const to = sp.to ? new Date(sp.to) : undefined;
  const domain = sp.domain;

  const result = await getProjectSourceUrls(supabase, projectId, {
    from,
    to,
    domain,
    pageType: pageTypeFilter,
    limit: 200,
  });

  const detail = sp.url
    ? await getProjectSourceUrlDetail(supabase, projectId, sp.url, {
        from,
        to,
      })
    : null;

  const totalClassified = Object.entries(result.page_type_counts).reduce(
    (s, [k, v]) => (k === "unclassified" ? s : s + v),
    0
  );
  const totalUrls =
    totalClassified + result.page_type_counts.unclassified;
  const coverage =
    totalUrls > 0 ? Math.round((totalClassified / totalUrls) * 100) : 0;

  // Build the preserved-query helper — when a user clicks a filter,
  // we keep `domain` / `from` / `to` intact but replace `page_type`.
  const baseParams: Record<string, string> = {};
  if (domain) baseParams.domain = domain;
  if (sp.from) baseParams.from = sp.from;
  if (sp.to) baseParams.to = sp.to;
  if (sp.model) baseParams.model = sp.model;

  const urlWithParams = (extra: Record<string, string>) => {
    const qs = new URLSearchParams({ ...baseParams, ...extra });
    return `/projects/${projectId}/sources/urls?${qs.toString()}`;
  };

  return (
    <>
      {/* ── Header row: scope / coverage ── */}
      <section className="py-10 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-[2px] bg-emerald-dark"
              />
              URL-level view
            </p>
            <p className="mt-3 text-sm text-text-secondary leading-relaxed max-w-2xl">
              Every URL cited across{" "}
              <span className="font-mono tabular-nums">
                {result.total_chats}
              </span>{" "}
              chats in the selected window.{" "}
              {domain && (
                <>
                  Scoped to{" "}
                  <span className="font-mono text-text-primary">{domain}</span>{" "}
                  —{" "}
                  <Link
                    href={`/projects/${projectId}/sources/urls`}
                    className="underline text-text-primary"
                  >
                    clear
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
          <dl className="space-y-1 text-xs font-mono tabular-nums md:text-right">
            <div className="flex justify-between gap-8">
              <dt className="text-text-muted">URLs</dt>
              <dd className="text-text-primary">{totalUrls}</dd>
            </div>
            <div className="flex justify-between gap-8">
              <dt className="text-text-muted">Classified</dt>
              <dd className="text-text-primary">
                {totalClassified} ({coverage}%)
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Page-type filter bar ── */}
      <section className="py-6 border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mr-2">
            Page type
          </span>
          <FilterChip
            href={urlWithParams({})}
            active={!pageTypeFilter}
            label={`All (${totalUrls})`}
          />
          {(
            [
              "article",
              "listicle",
              "how_to",
              "comparison",
              "review",
              "product_page",
              "landing",
              "directory",
              "forum_thread",
              "faq",
              "other",
              "unclassified",
            ] as const
          ).map((type) => {
            const count = result.page_type_counts[type] ?? 0;
            if (count === 0) return null;
            return (
              <FilterChip
                key={type}
                href={urlWithParams({ page_type: type })}
                active={pageTypeFilter === type}
                label={`${
                  type === "unclassified" ? "Unclassified" : PAGE_TYPE_LABELS[type]
                } (${count})`}
              />
            );
          })}
        </div>
      </section>

      {/* ── URLs table ── */}
      <section className="py-10">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-text-muted">
            Top {result.urls.length} URLs
            {domain ? ` · ${domain}` : ""}
            {pageTypeFilter ? ` · ${pageTypeFilter}` : ""}
          </p>
          <CsvExportButton
            csv={toCsv(result.urls, [
              { header: "URL", get: (u) => u.url },
              { header: "Domain", get: (u) => u.domain },
              { header: "Page type", get: (u) => u.page_type ?? "unclassified" },
              { header: "Page title", get: (u) => u.page_title ?? "" },
              { header: "Source type", get: (u) => u.source_type ?? "" },
              { header: "Total citations", get: (u) => u.total_citations },
              { header: "Inline citations", get: (u) => u.inline_citations },
              { header: "Distinct prompts", get: (u) => u.distinct_prompts },
              { header: "First seen", get: (u) => u.first_seen ?? "" },
              { header: "Last seen", get: (u) => u.last_seen ?? "" },
              { header: "Brand domain", get: (u) => u.is_brand_domain },
              { header: "Competitor domain", get: (u) => u.is_competitor_domain },
            ])}
            filename={`${project.brand_name.toLowerCase().replace(/\W+/g, "-")}-sources-urls-${csvFilenameStamp()}`}
          />
        </div>
        {result.urls.length === 0 ? (
          <div className="py-16 text-center text-sm text-text-secondary max-w-md mx-auto">
            {pageTypeFilter || domain
              ? "No URLs match the current filters in this window."
              : "No URL data yet. Run a visibility pass to populate this table."}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 md:-mx-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold border-b border-border">
                  <th className="py-3 px-4 md:px-0 md:pr-4">URL</th>
                  <th className="py-3 pr-4">Type</th>
                  <th className="py-3 pr-4 text-right font-mono hidden sm:table-cell">
                    Prompts
                  </th>
                  <th className="py-3 pr-4 text-right font-mono">Citations</th>
                  <th className="py-3 pr-4" />
                </tr>
              </thead>
              <tbody>
                {result.urls.map((u) => {
                  const drawerHref = urlWithParams({
                    url: u.url,
                    ...(pageTypeFilter ? { page_type: pageTypeFilter } : {}),
                  });
                  const label = u.page_title ?? shortPath(u.url);
                  return (
                    <tr
                      key={u.url}
                      className="border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors"
                    >
                      <td className="py-3 px-4 md:px-0 md:pr-4 max-w-[28rem]">
                        <Link
                          href={drawerHref}
                          className="block group min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-text-primary truncate group-hover:underline">
                              {label}
                            </span>
                            {u.is_brand_domain && (
                              <Badge
                                variant="success"
                                className="shrink-0 text-[10px]"
                              >
                                you
                              </Badge>
                            )}
                            {u.is_competitor_domain && (
                              <Badge
                                variant="default"
                                className="shrink-0 text-[10px]"
                              >
                                competitor
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono text-text-muted truncate">
                            {u.domain}
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        {u.page_type ? (
                          <Badge variant="outline" className="text-[10px]">
                            {PAGE_TYPE_LABELS[u.page_type]}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-text-muted flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-text-muted hidden sm:table-cell">
                        {u.distinct_prompts}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-text-primary">
                        {u.total_citations}
                        {u.inline_citations > 0 && (
                          <span className="text-text-muted">
                            {" "}
                            ({u.inline_citations} inline)
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <Link
                          href={drawerHref}
                          aria-label="Open URL details"
                          className="inline-flex items-center text-text-muted hover:text-text-primary"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <p className="py-6 text-xs text-text-muted">
        Showing top {result.urls.length} URLs. Classifications run
        automatically after each visibility pass — new URLs land in the
        &quot;Pending&quot; bucket until the next run populates the cache.
      </p>

      {/* ── Drawer (driven by ?url=) ── */}
      {sp.url && (
        <UrlDrawer
          detail={detail}
          url={sp.url}
          closeHref={(() => {
            const cleaned = new URLSearchParams(baseParams);
            if (pageTypeFilter) cleaned.set("page_type", pageTypeFilter);
            const qs = cleaned.toString();
            return qs
              ? `/projects/${projectId}/sources/urls?${qs}`
              : `/projects/${projectId}/sources/urls`;
          })()}
        />
      )}
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

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
          : "border-border text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
    </Link>
  );
}

function isKnownPageType(v: string): v is PageType {
  return (
    [
      "article",
      "listicle",
      "how_to",
      "comparison",
      "review",
      "product_page",
      "landing",
      "directory",
      "forum_thread",
      "faq",
      "other",
    ] as const
  ).includes(v as PageType);
}

function shortPath(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/$/, "");
    if (!path || path === "") return u.host;
    // Trim very long paths so the table stays scannable.
    return path.length > 64 ? path.slice(0, 61) + "…" : path;
  } catch {
    return raw.slice(0, 80);
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
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

// ── Drawer ───────────────────────────────────────────────────────────

function UrlDrawer({
  detail,
  url,
  closeHref,
}: {
  detail: SourceUrlDetail | null;
  url: string;
  closeHref: string;
}) {
  return (
    <>
      {/* Backdrop (click to close — a plain Link, no client JS). */}
      <Link
        href={closeHref}
        aria-label="Close detail panel"
        className="fixed inset-0 bg-black/30 z-40"
      />
      <aside
        role="dialog"
        aria-label="URL detail"
        className="fixed right-0 top-0 bottom-0 z-50 w-full md:w-[480px] bg-surface border-l border-border overflow-y-auto shadow-xl"
      >
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-semibold">
              URL detail
            </p>
            <h2 className="mt-1 text-base font-semibold text-text-primary truncate">
              {detail?.page_title ?? shortPath(url)}
            </h2>
            <p className="text-[11px] font-mono text-text-muted truncate mt-0.5">
              {detail?.domain ?? new URL(url).host.replace(/^www\./, "")}
            </p>
          </div>
          <Link
            href={closeHref}
            aria-label="Close"
            className="shrink-0 text-text-muted hover:text-text-primary p-1"
          >
            <X className="h-5 w-5" />
          </Link>
        </div>

        <div className="px-6 py-5 space-y-6">
          {!detail ? (
            <div className="text-sm text-text-secondary">
              No citation data for this URL in the current window.
              <div className="mt-2 text-[11px] font-mono text-text-muted break-all">
                {url}
              </div>
            </div>
          ) : (
            <>
              {/* Metadata strip */}
              <div className="flex flex-wrap gap-2 items-center">
                {detail.page_type && (
                  <Badge variant="outline" className="text-[10px]">
                    {PAGE_TYPE_LABELS[detail.page_type]}
                  </Badge>
                )}
                {detail.source_type && (
                  <Badge variant="outline" className="text-[10px]">
                    {SOURCE_TYPE_LABELS[detail.source_type]}
                  </Badge>
                )}
                {detail.is_brand_domain && (
                  <Badge variant="success" className="text-[10px]">
                    your domain
                  </Badge>
                )}
                {detail.is_competitor_domain && (
                  <Badge variant="default" className="text-[10px]">
                    competitor
                  </Badge>
                )}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Metrics */}
              <dl className="grid grid-cols-2 gap-y-2 text-xs font-mono tabular-nums">
                <dt className="text-text-muted">Total citations</dt>
                <dd className="text-text-primary text-right">
                  {detail.total_citations}
                </dd>
                <dt className="text-text-muted">Inline</dt>
                <dd className="text-text-primary text-right">
                  {detail.inline_citations}
                </dd>
                <dt className="text-text-muted">First seen</dt>
                <dd className="text-text-primary text-right">
                  {formatDate(detail.first_seen)}
                </dd>
                <dt className="text-text-muted">Last seen</dt>
                <dd className="text-text-primary text-right">
                  {formatDate(detail.last_seen)}
                </dd>
              </dl>

              {/* Playbook for the parent domain's source type */}
              {detail.source_type && (
                <div className="border-l-2 border-emerald-dark pl-3 text-xs text-text-secondary leading-relaxed">
                  <span className="font-semibold text-emerald-dark">
                    Playbook:
                  </span>{" "}
                  {SOURCE_TYPE_PLAYBOOK[detail.source_type]}
                </div>
              )}

              {/* Triggering prompts */}
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold mb-3">
                  Triggered by {detail.prompts.length} prompt
                  {detail.prompts.length === 1 ? "" : "s"}
                </p>
                <ul className="space-y-4">
                  {detail.prompts.map((p) => (
                    <li
                      key={p.prompt_id}
                      className="border-b border-border last:border-b-0 pb-4 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-text-primary leading-snug">
                          {p.prompt_text}
                        </p>
                        <span className="text-[11px] font-mono tabular-nums text-text-muted shrink-0">
                          ×{p.citation_count}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
                        {p.models.length > 0 && (
                          <span className="font-mono">
                            {p.models.join(" · ")}
                          </span>
                        )}
                        {p.latest_at && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatDate(p.latest_at)}</span>
                          </>
                        )}
                      </div>
                      {p.latest_snippet && (
                        <blockquote className="mt-2 text-xs text-text-secondary leading-relaxed border-l border-border pl-3 italic line-clamp-4">
                          {p.latest_snippet}
                        </blockquote>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
