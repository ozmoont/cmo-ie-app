/**
 * /settings/api-keys — REST API key management.
 *
 * Separate page from /settings (which covers plan + team + BYOK model
 * keys). Owners / admins can mint, revoke, and review usage timestamps.
 *
 * The "plaintext shown once at creation" pattern is implemented in the
 * RestKeysClient component. Server shell is minimal: just fetch the
 * user + profile for the shell, the client does the rest.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser, getProfile } from "@/lib/queries";
import { RestKeysClient } from "./rest-keys-client";

export const metadata = {
  title: "REST API keys",
  description: "Create and revoke keys for the CMO.ie REST API + MCP server.",
};

export default async function RestKeysPage() {
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
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5" />
          REST API keys
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
          Keys for the public API + MCP server.
        </h1>
        <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
          Generate a key to pipe your visibility data into Sheets, Looker, or
          any other tool — or install the MCP server and ask Claude about your
          AI visibility directly. See the{" "}
          <Link href="/docs/api" className="underline">
            API reference
          </Link>{" "}
          for endpoint details.
        </p>
      </header>

      {canManage ? (
        <RestKeysClient />
      ) : (
        <div className="py-10 text-sm text-text-secondary max-w-xl">
          Only organisation owners and admins can mint and revoke API keys.
          Ask your owner to create a key for you, or set up a dedicated
          service account.
        </div>
      )}
    </DashboardShell>
  );
}
