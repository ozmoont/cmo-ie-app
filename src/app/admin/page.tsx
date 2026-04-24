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
import { requireAdmin } from "@/lib/admin-auth";
import { AdminOpsClient } from "./AdminOpsClient";

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
          Ops dashboard
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Managed AI spend, per-org usage and recent errors. Data refreshes
          on page load — hit refresh for a newer view.
        </p>

        <AdminOpsClient />
      </main>
    </div>
  );
}
