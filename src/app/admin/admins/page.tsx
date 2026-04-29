/**
 * /admin/admins — manage super-admin grants.
 *
 * Lists current admins (env-list + DB-flagged) and provides a grant-
 * by-email input. Env-list admins surface as read-only rows tagged
 * "env" — you change those by editing CMO_ADMIN_EMAILS on Vercel.
 *
 * Self-revocation is blocked at the API layer; the UI also greys out
 * the revoke button on the current user's row for instant feedback.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminsManager } from "./admins-manager";

export const metadata = {
  title: "Admins — CMO.ie",
};

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login?returnTo=/admin/admins");
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-6 md:px-10 pt-10 pb-20">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Back to admin
        </Link>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Manage admins
        </h1>
        <p className="mt-2 text-sm text-text-secondary max-w-2xl leading-relaxed">
          Grant super-admin access to existing CMO.ie users. Granted
          admins can immediately access /admin and the audit council;
          revoked admins lose access on their next page load. The
          env-list (CMO_ADMIN_EMAILS) is shown for reference and acts
          as the bootstrap fallback — you can&apos;t remove env entries
          here, only via Vercel.
        </p>

        <AdminsManager />
      </main>
    </div>
  );
}
