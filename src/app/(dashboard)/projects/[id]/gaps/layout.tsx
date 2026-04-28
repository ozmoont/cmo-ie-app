/**
 * Gaps section shell. Wraps the tabs nav and a section header that
 * makes clear what "gap" means in the product's vocabulary: where
 * tracked competitors show up in AI answers and you don't.
 */

import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { createClient } from "@/lib/supabase/server";
import { GapsTabs } from "@/components/dashboard/gaps-tabs";

// Next.js 16 typed-routes note:
// The Next 16 validator flags this layout because the global
// LayoutProps<"/projects/[id]/gaps"> generic expects a slightly
// different shape than the hand-rolled `{ children, params }` we use.
// We tried switching to LayoutProps<…> directly but it can't resolve
// `LayoutRoutes` from this file's scope — a known quirk of Next's
// generated routes.d.ts under the (dashboard) route group. The
// hand-rolled type still produces a working build on Vercel; the
// validator complaint is cosmetic. Tracked as a Next 16 cleanup
// follow-up — do not change without verifying the build first.
export default async function GapsLayout({
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
          Gap analysis
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          Where competitors show up and you don&apos;t.
        </h1>
        <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
          Ranked by opportunity. Each row is a domain or URL the AI models
          reach for when answering your prompts, where one or more tracked
          competitors land but your brand is absent from the conversation.
          Higher stars = larger gap, more leverage.
        </p>
      </header>

      <GapsTabs projectId={projectId} />

      {children}
    </DashboardShell>
  );
}
