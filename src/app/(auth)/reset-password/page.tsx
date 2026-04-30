/**
 * /reset-password — pick a new password.
 *
 * Reached via the recovery link in the email Supabase sends from
 * /forgot-password. By the time this page renders, /auth/callback
 * has already exchanged the recovery code for a session, so
 * supabase.auth.getUser() returns the user and updateUser({password})
 * is allowed.
 *
 * Defensive — if no session, send the user back to /login. That
 * happens when the link expired (Supabase recovery links are valid
 * 1 hour by default) or was already consumed.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { setNewPassword } from "../actions";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = {
  title: "Set a new password",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // No active session — recovery link expired or never landed here.
    redirect("/login?error=reset_link_expired");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-4 md:px-8 py-5 border-b border-border">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-semibold text-text-primary tracking-tight hover:text-emerald-dark transition-colors"
        >
          CMO.ie
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 md:px-6 py-16">
        <div className="w-full max-w-md space-y-10">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-[2px] bg-emerald-dark"
              />
              New password
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
              Set a new password.
            </h1>
            <p className="text-sm text-text-secondary leading-relaxed">
              Pick something at least 8 characters long. We&apos;ll sign
              you in to the dashboard once it&apos;s saved.
            </p>
          </div>

          {error && (
            <div className="text-sm text-danger border-l-2 border-danger pl-4 py-1">
              {error}
            </div>
          )}

          <form className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="at least 8 characters"
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                placeholder="re-type it"
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <Button
              formAction={setNewPassword}
              className="w-full"
              size="lg"
            >
              Save new password
            </Button>
          </form>
        </div>
      </main>

      <footer className="px-4 md:px-8 py-6 border-t border-border">
        <p className="text-xs text-text-muted">
          © {new Date().getFullYear()} CMO.ie - a Howl.ie product
        </p>
      </footer>
    </div>
  );
}
