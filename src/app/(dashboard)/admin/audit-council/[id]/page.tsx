/**
 * /admin/audit-council/[id] — Phase 7b drill-down view.
 *
 * Three-column layout:
 *   • Artifact preview (markdown via MarkdownReport, or JSON for
 *     structured artifacts like brand_profile + prompt_batch).
 *   • Auditor verdicts — three collapsible cards (Claude / ChatGPT /
 *     Gemini) with verdict, confidence, rationale, list of issues.
 *   • Chair synthesis + ops decision panel.
 *
 * Customer-invisible — admin-only via lib/admin-auth.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { isAdminUser } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { ReviewDrillDown } from "./review-drill-down";

export const metadata = {
  title: "Audit Council review — admin",
};

export default async function AuditCouncilDrillDownPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isAdminUser(user))) redirect("/");

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
          Audit Council review
        </p>
      </header>

      <ReviewDrillDown reviewId={id} />
    </DashboardShell>
  );
}
