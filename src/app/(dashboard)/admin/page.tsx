/**
 * /admin — admin landing dashboard.
 *
 * Aggregates four panels in a single view:
 *   1. Audit Council snapshot — pending decisions, recent flags.
 *   2. Customer KPIs — orgs, projects, signups, plan breakdown.
 *   3. AI spend — last 30 days total + top 5 features by cost.
 *   4. System health — failed audits / plans / reviews in 24h.
 *
 * Server component that gates on isAdminUser; the actual data
 * fetching lives in the AdminDashboard client component which polls
 * /api/admin/dashboard.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ScanSearch, BarChart3, Users, Activity } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { isAdminUser } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboard } from "./admin-dashboard";

export const metadata = {
  title: "Admin — CMO.ie",
};

export default async function AdminLandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) redirect("/");

  return (
    <DashboardShell orgName="CMO.ie" userEmail={user.email}>
      <header className="pb-8 border-b border-border">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Admin
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          The state of the operation.
        </h1>
        <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
          Internal ops dashboard. Customer never sees this surface.
          Audit Council reviews live one click away in the inbox; KPIs
          + spend + health are summarised below.
        </p>
        <nav className="mt-6 flex flex-wrap gap-2">
          <AdminLink
            href="/admin/audit-council"
            icon={<ScanSearch className="h-4 w-4" />}
            label="Audit Council"
          />
          <AdminLink
            href="/admin/audit-council/metrics"
            icon={<BarChart3 className="h-4 w-4" />}
            label="Council metrics"
          />
          <AdminLink
            href="/admin/playbooks"
            icon={<Users className="h-4 w-4" />}
            label="Playbooks"
          />
          <AdminLink
            href="/admin/skills"
            icon={<Activity className="h-4 w-4" />}
            label="Skills"
          />
        </nav>
      </header>

      <AdminDashboard />
    </DashboardShell>
  );
}

function AdminLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary hover:border-emerald-dark/40 transition-colors"
    >
      {icon}
      {label}
    </Link>
  );
}
