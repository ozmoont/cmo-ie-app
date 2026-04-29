/**
 * /admin — CMO.ie super-admin ops dashboard.
 *
 * Gated on the env allow-list (CMO_ADMIN_EMAILS). Renders KPIs, a
 * 30-day spend trend by provider, a per-org table, and recent errors
 * + pricey calls.
 *
 * Everything reads from /api/admin/ops/* — no direct DB access in
 * this component. Keeping the client dumb means the same API can
 * power a CLI, a scheduled email, or an iOS app later.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ScanSearch, BarChart3, Users, Sparkles } from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminOpsClient } from "./AdminOpsClient";
import { AdminDashboard } from "./admin-dashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Ops — CMO.ie",
  description: "Spend + usage dashboard for CMO.ie admins.",
};

export default async function AdminOpsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login?returnTo=/admin");
    // 403 — authed user, not on the allow-list. Send them to their
    // own dashboard with a minor nudge rather than a loud error page.
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight hover:text-emerald-dark transition-colors"
            >
              CMO.ie
            </Link>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-dark/10 text-emerald-dark font-semibold uppercase tracking-wider">
              Admin
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-text-secondary">
            <Link href="/dashboard" className="hover:text-text-primary">
              My dashboard
            </Link>
            <span className="text-text-muted text-xs">
              {auth.user.email}
            </span>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 md:px-10 pt-10 pb-20">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          The state of the operation.
        </h1>
        <p className="mt-2 text-sm text-text-secondary max-w-2xl">
          Internal ops dashboard. Customer never sees this surface. Quick
          KPIs up top, detailed managed-spend / per-org usage / error feed
          underneath.
        </p>

        {/* Quick links into the deeper admin pages. */}
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
            icon={<Sparkles className="h-4 w-4" />}
            label="Skills"
          />
        </nav>

        {/* ── Phase 7 four-panel snapshot ── */}
        {/* Audit Council pending decisions, Customer KPIs, AI spend,
            System health. Each panel fails independently. */}
        <section className="mt-10">
          <AdminDashboard />
        </section>

        {/* ── Detailed ops view (pre-existing) ── */}
        {/* Managed spend trend, per-org table, recent errors feed. */}
        <section className="mt-12 pt-10 border-t border-border">
          <h2 className="text-lg font-semibold tracking-tight">
            Detailed ops
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Managed AI spend, per-org usage, recent errors + pricey calls.
          </p>
          <AdminOpsClient />
        </section>
      </main>
    </div>
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
