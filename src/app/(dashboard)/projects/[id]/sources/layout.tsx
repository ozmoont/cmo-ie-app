/**
 * Sources section shell. Provides the Domains / URLs sub-navigation
 * shared across both tabs. The main app sidebar already routes users
 * to /sources/; this layout just adds the in-page tab nav on top.
 *
 * URLs tab is a placeholder until Workstream C lands.
 */

import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { createClient } from "@/lib/supabase/server";
import { SourcesTabs } from "@/components/dashboard/sources-tabs";

// Next.js 16 typed-routes — see gaps/layout.tsx for the rationale on
// why we keep the hand-rolled prop type instead of LayoutProps<…>.
export default async function SourcesLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle<{ name: string }>();

  return (
    <DashboardShell
      orgName="CMO.ie"
      plan="pro"
      projectId={projectId}
      projectName={project?.name ?? "Project"}
    >
      <header className="pb-6 border-b border-border">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Sources
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          Where AI forms its opinion.
        </h1>
        <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
          Every website and URL the AI models referenced when answering your
          prompts, grouped by type. Optimising sources is the single
          highest-leverage lever for AI-search visibility — you can&apos;t
          control the model, but you can influence what the model reads.
        </p>
      </header>

      <SourcesTabs projectId={projectId} />

      {children}
    </DashboardShell>
  );
}
