"use client";

/**
 * /projects/[id]/brand — dedicated home for the brand profile editor.
 *
 * Why a whole page for one card: every personalisation feature in the
 * product (prompt suggestions, action plans, gap analysis, briefs,
 * drafts) reads from `projects.profile_*`. If users can't find where
 * to edit it, every downstream surface ships generic-industry advice
 * which kills perceived quality. The Brand tab makes this a top-level
 * destination rather than something hidden inside Prompts.
 *
 * The page is intentionally thin — most of the work is in
 * BrandProfileCard. We just wrap it in the dashboard shell, give it a
 * proper page header, and add a "what this is for" explainer so
 * first-time users understand why it matters.
 */

import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { BrandProfileCard } from "@/components/dashboard/brand-profile-card";

export default function BrandProfilePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  return (
    <DashboardShell
      orgName="CMO.ie"
      plan="trial"
      projectId={projectId}
      projectName="Project"
    >
      {/* ── Page header ── */}
      <header className="grid grid-cols-12 gap-6 items-end pb-10 md:pb-14 border-b border-border">
        <div className="col-span-12 md:col-span-9">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Brand profile
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
            What CMO.ie thinks your brand is.
          </h1>
          <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
            Every prompt suggestion, action plan, content brief and draft
            we generate is scoped to this profile. If the market segment
            or audience is wrong here, every downstream output will be
            wrong too. Edit any field whenever your positioning shifts —
            the next run picks up the change.
          </p>
        </div>
      </header>

      {/* ── Profile editor ── */}
      <section className="mt-8 mb-10 max-w-3xl">
        <BrandProfileCard
          projectId={projectId}
          onSaved={() => {
            // Refresh the route so other places relying on the profile
            // (Insights, Actions) reflect the change on next visit.
            router.refresh();
          }}
        />
      </section>
    </DashboardShell>
  );
}
