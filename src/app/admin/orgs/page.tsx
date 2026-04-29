/**
 * /admin/orgs — comp credit + trial extension management.
 *
 * Lists every customer org with current plan, trial status, comp
 * balances, and a one-click grant form. Customer never sees this.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";
import { OrgsManager } from "./orgs-manager";

export const metadata = {
  title: "Orgs — CMO.ie admin",
};

export const dynamic = "force-dynamic";

export default async function OrgsAdminPage() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login?returnTo=/admin/orgs");
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
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

      <main className="max-w-5xl mx-auto px-6 md:px-10 pt-10 pb-20">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Back to admin
        </Link>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Customer orgs
        </h1>
        <p className="mt-2 text-sm text-text-secondary max-w-2xl leading-relaxed">
          Grant comp SEO audits, comp brief credits, and trial
          extensions to specific organisations. Comps consume before
          plan quota, so a grant always extends runway. Trial
          extensions are additive — extending never shortens.
        </p>

        <OrgsManager />
      </main>
    </div>
  );
}
