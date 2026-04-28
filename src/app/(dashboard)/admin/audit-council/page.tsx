/**
 * /admin/audit-council — Phase 7a inbox.
 *
 * Bare-bones table of every audit_reviews row, with tabs for
 * Pending decision / Flagged / Approved / Errored / All. No
 * drill-down view in 7a (that ships in 7b).
 *
 * Customer-invisible — admin-only via lib/admin-auth. The page uses
 * the same DashboardShell as the rest of the admin pages so the nav
 * + branding match.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { isAdminUser } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { AuditCouncilInbox } from "./audit-council-inbox";

export const metadata = {
  title: "Audit Council — admin",
};

export default async function AuditCouncilAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) redirect("/");

  return (
    <DashboardShell orgName="CMO.ie" userEmail={user.email}>
      <header className="pb-8 border-b border-border">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Back to admin
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Audit Council
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          Cross-model verification, hidden from the customer.
        </h1>
        <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
          Every plan we generate is reviewed by Claude Sonnet 4.6, GPT-4.1,
          and Gemini 2.5 Pro independently. A Haiku chair synthesises their
          verdicts. Phase 7a is observation-only — nothing is auto-blocked or
          auto-regenerated; the customer never sees this surface.
        </p>
      </header>

      <AuditCouncilInbox />
    </DashboardShell>
  );
}
