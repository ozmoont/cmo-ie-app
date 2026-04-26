/**
 * /admin/skills — internal admin page for managing paid skill products.
 *
 * Server-rendered shell. The interactive parts (upload form, status
 * toggle) live in the client component.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { SkillsAdminClient } from "./SkillsAdminClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Skills — Admin",
  description: "Upload and manage paid skill products on CMO.ie.",
};

export default async function AdminSkillsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login?returnTo=/admin/skills");
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
              Admin · Skills
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-text-secondary">
            <Link href="/admin" className="hover:text-text-primary">
              Ops
            </Link>
            <span className="text-text-muted text-xs">{auth.user.email}</span>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 md:px-10 pt-10 pb-20">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Skills
        </h1>
        <p className="mt-2 text-sm text-text-secondary max-w-2xl">
          Each skill is a packaged paid AI service. Upload a Claude Skills
          .zip (with SKILL.md + plugin.json) to install or update a skill.
          New uploads land as draft versions — promote to active once
          you&apos;ve verified the content.
        </p>

        <SkillsAdminClient />
      </main>
    </div>
  );
}
