/**
 * /agency/billing — agency pool allocation panel.
 *
 * Server shell fetches the user + confirms agency plan. Client
 * component handles the editable per-project caps.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser, getProfile, getOrgBriefCredits } from "@/lib/queries";
import { AgencyBillingClient } from "./agency-billing-client";

export const metadata = {
  title: "Agency billing — CMO.ie",
  description:
    "Manage the credit pool and per-client allocations for your agency.",
};

export default async function AgencyBillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  if (!profile) redirect("/login");

  const canManage = ["owner", "admin"].includes(profile.role);
  const pool = await getOrgBriefCredits(
    Array.isArray(profile.organisations)
      ? profile.organisations[0]?.id
      : (profile.organisations as { id: string })?.id
  );

  return (
    <DashboardShell orgName="CMO.ie" userEmail={user.email}>
      <header className="pb-8 border-b border-border">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Back to settings
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Agency billing
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          Your pool, split the way you want.
        </h1>
        <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
          Briefs draw from a shared credit pool across every client project.
          Set per-project caps to stop any one client outrunning their
          allocation; leave a project uncapped to let it draw freely.
          Caps and pool both reset on the same 30-day cycle.
        </p>
      </header>

      {!canManage ? (
        <section className="py-10">
          <InfoPanel>
            Only organisation owners and admins can manage allocations.
          </InfoPanel>
        </section>
      ) : pool.plan !== "agency" ? (
        <section className="py-10">
          <InfoPanel>
            Allocations are part of the <strong>Agency</strong> plan.
            You&apos;re currently on the{" "}
            <strong className="capitalize">{pool.plan}</strong> plan.{" "}
            <Link href="/settings" className="underline text-text-primary">
              Upgrade from Settings
            </Link>
            .
          </InfoPanel>
        </section>
      ) : (
        <AgencyBillingClient />
      )}
    </DashboardShell>
  );
}

function InfoPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl border-l-2 border-warning pl-4 py-3">
      <p className="text-xs uppercase tracking-[0.15em] text-warning font-semibold flex items-center gap-2 mb-2">
        <AlertCircle className="h-3.5 w-3.5" /> Heads up
      </p>
      <p className="text-sm text-text-primary leading-relaxed">{children}</p>
    </div>
  );
}
