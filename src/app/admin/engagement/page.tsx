/**
 * /admin/engagement — account-management view.
 *
 * Per-org table showing scan + audit + playbook activity, plus
 * 7-day visibility delta and next-scan ETA. Account managers sort
 * for "looks disengaged" (low scan count, low visibility, big delta
 * down) and reach out before the customer churns.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";
import { EngagementTable } from "./engagement-table";

export const metadata = {
  title: "Engagement — CMO.ie admin",
};

export const dynamic = "force-dynamic";

export default async function EngagementPage() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login?returnTo=/admin/engagement");
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
            <Link href="/admin" className="hover:text-text-primary">
              Admin home
            </Link>
            <span className="text-text-muted text-xs">{auth.user.email}</span>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 md:px-10 pt-10 pb-20">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Back to admin
        </Link>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Customer engagement
        </h1>
        <p className="mt-2 text-sm text-text-secondary max-w-2xl leading-relaxed">
          Per-org snapshot for account managers. Sort by visibility
          delta to spot regressions, by scan count to find disengaged
          accounts, by next-scan ETA to know when to expect movement.
          Click a row for org-level grant + comp options.
        </p>

        <EngagementTable />
      </main>
    </div>
  );
}
