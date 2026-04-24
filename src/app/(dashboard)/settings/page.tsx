import { redirect } from "next/navigation";
import { getCurrentUser, getProfile, getOrgBriefCredits } from "@/lib/queries";
import { DashboardShell } from "@/components/dashboard/shell";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { PLAN_LIMITS } from "@/lib/types";
import { PricingCards } from "@/components/dashboard/pricing-cards";
import { CreditsBadge } from "@/components/dashboard/credits-badge";
import { DeleteAccountButton } from "@/components/dashboard/delete-account-button";
import { TeamSection } from "@/components/dashboard/team-section";
import { AlertCircle, ArrowRight, KeyRound, Mail, Users2 } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Settings",
  description: "Manage your account, plan, team, and organisation.",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);
  if (!profile) redirect("/login");

  const org = Array.isArray(profile.organisations)
    ? profile.organisations[0]
    : profile.organisations;

  const planLimits =
    PLAN_LIMITS[(org?.plan ?? "trial") as keyof typeof PLAN_LIMITS];
  const trialEndsAt = org?.trial_ends_at ? new Date(org.trial_ends_at) : null;

  let briefCredits = null;
  if (org) {
    try {
      briefCredits = await getOrgBriefCredits(org.id);
    } catch (error) {
      console.error("Failed to fetch brief credits:", error);
    }
  }

  const planName = (org?.plan ?? "trial") as string;

  return (
    <DashboardShell
      orgName={org?.name ?? "CMO.ie"}
      plan={org?.plan ?? "trial"}
      userEmail={user.email}
    >
      {/* ── Page header ── */}
      <header className="grid grid-cols-12 gap-6 items-end pb-10 md:pb-14 border-b border-border">
        <div className="col-span-12 md:col-span-9">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Settings
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
            Manage your account.
          </h1>
          <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
            Your personal details, your plan, your team, and how you leave.
          </p>
        </div>
      </header>

      {/* ── Account ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-14 border-b border-border">
        <div className="col-span-12 md:col-span-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Account
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Your personal profile and organisation name.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-2xl">
          <SettingsForm
            userId={user.id}
            currentFullName={profile.full_name ?? ""}
            currentOrgName={org?.name ?? ""}
          />
        </div>
      </section>

      {/* ── Plan ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-14 border-b border-border">
        <div className="col-span-12 md:col-span-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Plan
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Your current tier and what it includes.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl space-y-8">
          {/* Current plan headline */}
          <div className="flex items-baseline gap-3">
            <p className="text-xs uppercase tracking-[0.15em] text-text-muted font-semibold">
              Current plan
            </p>
            <p className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight capitalize">
              {planName}
            </p>
          </div>

          {/* Trial warning - editorial, no card */}
          {org?.plan === "trial" && trialEndsAt && (
            <div className="flex items-start gap-3 border-l-0 border-t border-b border-border py-4">
              <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-warning">
                  Trial period active
                </p>
                <p className="text-text-secondary mt-1">
                  Your trial ends on {trialEndsAt.toLocaleDateString("en-IE")}.
                </p>
              </div>
            </div>
          )}

          {/* Plan limits - type-led stats, hairline divided */}
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-y border-border py-6">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
                Projects
              </dt>
              <dd className="mt-2 font-mono tabular-nums text-3xl md:text-4xl font-medium text-text-primary leading-none">
                {planLimits.projects === Infinity
                  ? "∞"
                  : planLimits.projects}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
                Prompts per project
              </dt>
              <dd className="mt-2 font-mono tabular-nums text-3xl md:text-4xl font-medium text-text-primary leading-none">
                {planLimits.prompts === Infinity
                  ? "∞"
                  : planLimits.prompts}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
                AI models
              </dt>
              <dd className="mt-2 font-mono tabular-nums text-3xl md:text-4xl font-medium text-text-primary leading-none">
                {planLimits.models === Infinity
                  ? "All 5"
                  : planLimits.models}
              </dd>
            </div>
          </dl>

          {/* Brief credits */}
          {briefCredits && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
                  Brief credits
                </p>
                <p className="text-sm text-text-primary mt-1">
                  {briefCredits.limit === Infinity ? (
                    "Unlimited monthly briefs"
                  ) : (
                    <>
                      <span className="font-mono tabular-nums">
                        {briefCredits.used}
                      </span>{" "}
                      of{" "}
                      <span className="font-mono tabular-nums">
                        {briefCredits.limit}
                      </span>{" "}
                      used this month
                      {briefCredits.resetAt && (
                        <span className="text-text-muted text-xs ml-2">
                          · resets{" "}
                          {new Date(briefCredits.resetAt).toLocaleDateString(
                            "en-IE"
                          )}
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
              <CreditsBadge
                used={briefCredits.used}
                limit={briefCredits.limit}
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Pricing / upgrade ──
          PricingCards renders its own grid; we keep it but wrap in the
          editorial 3+9 to match the rest of the page. */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-14 border-b border-border">
        <div className="col-span-12 md:col-span-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Upgrade
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Every plan is month-to-month. Cancel any time.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9">
          <PricingCards currentPlan={planName} />
        </div>
      </section>

      {/* ── Team ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-14 border-b border-border">
        <div className="col-span-12 md:col-span-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Team
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Manage team members and their access.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl">
          <TeamSection />
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-14 border-b border-border">
        <div className="col-span-12 md:col-span-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Integrations
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Pull your CMO.ie data into other tools.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-2xl space-y-3">
          <Link
            href="/settings/api-keys"
            className="group flex items-start gap-4 border border-border rounded-lg p-5 hover:border-emerald-dark/60 transition-colors"
          >
            <KeyRound className="h-5 w-5 text-emerald-dark shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-text-primary group-hover:text-emerald-dark transition-colors">
                REST API keys
              </p>
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                Mint scoped tokens for the public REST API and MCP server.
                Feeds Sheets / Looker integrations and lets Claude query
                your visibility data directly. See{" "}
                <span className="underline">docs/api</span> for the
                reference.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
          </Link>
          {planName === "agency" && (
            <Link
              href="/agency/billing"
              className="group flex items-start gap-4 border border-border rounded-lg p-5 hover:border-emerald-dark/60 transition-colors"
            >
              <Users2 className="h-5 w-5 text-emerald-dark shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-text-primary group-hover:text-emerald-dark transition-colors">
                  Agency allocations
                </p>
                <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                  Cap each client project&apos;s share of your monthly brief
                  pool. Uncapped projects draw freely; capped projects stop
                  at their limit before dipping into the rest of the pool.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
            </Link>
          )}
          <Link
            href="/admin/playbooks"
            className="group flex items-start gap-4 border border-border rounded-lg p-5 hover:border-emerald-dark/60 transition-colors"
          >
            <Mail className="h-5 w-5 text-emerald-dark shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-text-primary group-hover:text-emerald-dark transition-colors">
                Monthly playbook emails
              </p>
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                Auto-generated &ldquo;your three moves this month&rdquo;
                emails. Preview what&apos;s queued and force-regenerate
                before the 1st-of-month cron fires.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
          </Link>
        </div>
      </section>

      {/* ── Danger zone ──
          Kept visually restrained. Red is reserved for the action itself,
          not the whole panel. */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-14">
        <div className="col-span-12 md:col-span-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-danger font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-danger"
            />
            Danger zone
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Irreversible actions.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-text-primary">
                Delete account
              </p>
              <p className="text-sm text-text-secondary mt-1 max-w-lg">
                This permanently deletes your account and all associated data.
                This cannot be undone.
              </p>
            </div>
            <DeleteAccountButton />
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
