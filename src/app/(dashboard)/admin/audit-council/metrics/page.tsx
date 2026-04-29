/**
 * /admin/audit-council/metrics — Phase 7c aggregate metrics.
 *
 * Renders a single-page dashboard with:
 *   • Totals strip (reviews, completed, decisions).
 *   • Flag rate by artifact type.
 *   • Pairwise auditor-agreement matrix.
 *   • Issue category histogram.
 *   • Median ops-decision time.
 *
 * Customer-invisible — admin-only via lib/admin-auth.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { isAdminUser } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { AuditCouncilMetrics } from "./audit-council-metrics";

export const metadata = {
  title: "Audit Council metrics — admin",
};

export default async function AuditCouncilMetricsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) redirect("/");

  return (
    <DashboardShell orgName="CMO.ie" userEmail={user.email}>
      <header className="pb-6 border-b border-border">
        <Link
          href="/admin/audit-council"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Back to inbox
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Audit Council metrics
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          Last 30 days at a glance.
        </h1>
        <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
          How often the council fires, where it disagrees, what kinds of
          issues it raises, and how quickly the ops team is closing
          reviews.
        </p>
      </header>

      <AuditCouncilMetrics />
    </DashboardShell>
  );
}
