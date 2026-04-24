/**
 * /projects/[id]/actions/gap — the "Act on this" destination.
 *
 * Reads the gap context from query params, looks up the matching gap
 * row server-side to enrich with competitor names + score, and
 * renders the gap-act flow (server component shell + client flow
 * widget).
 *
 * This sits alongside the existing /actions page rather than replacing
 * it. Action plans are the long-running "here's the plan" view;
 * /actions/gap is the short-loop "help me act on this one gap right
 * now" flow.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { createClient } from "@/lib/supabase/server";
import { getDomainGaps, getUrlGaps } from "@/lib/queries/gap-analysis";
import { canonicaliseDomain } from "@/lib/classifiers/types";
import type { SourceGap } from "@/lib/types";
import type { PageType, SourceType } from "@/lib/classifiers/types";
import { GapActFlow } from "./gap-act-flow";

const VALID_SOURCE_TYPES: readonly SourceType[] = [
  "editorial",
  "corporate",
  "ugc",
  "reference",
  "your_own",
  "social",
  "other",
];
const VALID_PAGE_TYPES: readonly PageType[] = [
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
];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    gap_scope?: string;
    gap_domain?: string;
    gap_url?: string;
    gap_source_type?: string;
    gap_page_type?: string;
  }>;
}

export default async function GapActPage({ params, searchParams }: PageProps) {
  const { id: projectId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, brand_name")
    .eq("id", projectId)
    .maybeSingle<{ id: string; name: string; brand_name: string }>();
  if (!project) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const userEmail = user?.email ?? undefined;

  const scope = sp.gap_scope === "url" ? "url" : "domain";
  const domainRaw =
    sp.gap_domain ?? (sp.gap_url ? safeHost(sp.gap_url) : undefined);
  if (!domainRaw) {
    return <MissingScopePanel projectId={projectId} />;
  }
  const domain = canonicaliseDomain(domainRaw);

  const sourceTypeParam = sp.gap_source_type;
  const sourceType =
    sourceTypeParam && (VALID_SOURCE_TYPES as readonly string[]).includes(sourceTypeParam)
      ? (sourceTypeParam as SourceType)
      : null;

  const pageTypeParam = sp.gap_page_type;
  const pageType =
    pageTypeParam && (VALID_PAGE_TYPES as readonly string[]).includes(pageTypeParam)
      ? (pageTypeParam as PageType)
      : null;

  // Enrich with the live gap row (competitors, gap_score). This may
  // return nothing if the run window's shifted — the flow still works
  // without it, but the UI signals "snapshot only" to the user.
  let competitors: string[] = [];
  let gapScore: number | null = null;
  let pageTitle: string | null = null;

  try {
    if (scope === "url" && sp.gap_url) {
      const urlGaps = await getUrlGaps(supabase, projectId, { limit: 500 });
      const hit = urlGaps.rows.find((r) => r.url === sp.gap_url);
      if (hit) {
        competitors = hit.competitors_present;
        gapScore = hit.gap_score;
        pageTitle = hit.page_title;
      }
    } else {
      const domainGaps = await getDomainGaps(supabase, projectId, {
        limit: 500,
      });
      const hit = domainGaps.rows.find((r) => r.domain === domain);
      if (hit) {
        competitors = hit.competitors_present;
        gapScore = hit.gap_score;
      }
    }
  } catch (err) {
    // Enrichment is best-effort — non-fatal.
    console.error("Gap enrichment failed:", err);
  }

  const gap: SourceGap = {
    scope,
    domain,
    url: scope === "url" ? sp.gap_url : undefined,
    source_type: sourceType,
    page_type: pageType,
    competitors,
    gap_score: gapScore ?? undefined,
    captured_at: new Date().toISOString(),
  };

  return (
    <DashboardShell
      orgName="CMO.ie"
      plan="pro"
      projectId={projectId}
      projectName={project.name}
    >
      <header className="pb-6 border-b border-border">
        <Link
          href={`/projects/${projectId}/gaps/${scope === "url" ? "urls" : "domains"}`}
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Back to gaps
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Act on a gap
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          {gap.scope === "url"
            ? pageTitle ?? displayPath(gap.url ?? "")
            : gap.domain}
        </h1>
        <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
          Generate a tailored brief for this gap. The brief is shaped by the
          source type — editorial pitch, community reply, directory
          submission, self-audit — so you can hand it straight to a writer
          or an agency partner.
        </p>
      </header>

      <GapActFlow
        projectId={projectId}
        brandName={project.brand_name}
        gap={gap}
        defaultContactEmail={userEmail}
      />
    </DashboardShell>
  );
}

function MissingScopePanel({ projectId }: { projectId: string }) {
  return (
    <DashboardShell orgName="CMO.ie" plan="pro" projectId={projectId}>
      <section className="py-16 max-w-lg mx-auto text-center">
        <p className="text-sm text-text-secondary">
          This page needs a gap domain or URL. Start from{" "}
          <Link
            href={`/projects/${projectId}/gaps`}
            className="underline text-text-primary"
          >
            Gap analysis
          </Link>{" "}
          and click &quot;Act on this&quot; on any row.
        </p>
      </section>
    </DashboardShell>
  );
}

function safeHost(raw: string): string | undefined {
  try {
    return new URL(raw).host;
  } catch {
    return undefined;
  }
}

function displayPath(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/$/, "");
    return path && path.length > 1 ? `${u.host}${path}` : u.host;
  } catch {
    return raw;
  }
}
