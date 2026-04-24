/**
 * /admin/playbooks — monthly playbook preview + manual generator.
 *
 * Shows every playbook generated for the org's projects + a "Generate
 * for this month" button per project. Clicking a playbook opens its
 * body inline so owners can read the Claude output before it goes out.
 *
 * Manual sending lives here when email dispatcher is wired (future
 * work). For now, users read the markdown and paste into their own
 * send tool if they want to deliver before the cron fires.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser, getProfile } from "@/lib/queries";
import { PlaybookAdmin } from "./playbook-admin";

export const metadata = {
  title: "Monthly playbooks — admin",
};

export default async function PlaybooksAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  if (!profile) redirect("/login");

  const canManage = ["owner", "admin"].includes(profile.role);

  return (
    <DashboardShell orgName="CMO.ie" userEmail={user.email}>
      <header className="pb-8 border-b border-border">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Back to settings
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Monthly playbooks
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          Your three moves, every month.
        </h1>
        <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
          Every active project gets a generated playbook on the 1st of each
          month. Preview what went out here, or force-regenerate before
          sending.
        </p>
      </header>

      {canManage ? (
        <PlaybookAdmin />
      ) : (
        <section className="py-10 text-sm text-text-secondary max-w-xl">
          Only organisation owners and admins can view playbook history.
        </section>
      )}
    </DashboardShell>
  );
}
