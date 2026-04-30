/**
 * /forgot-password — request a password-reset email.
 *
 * Mirrors /login + /signup styling so the auth flow reads as one
 * coherent surface. Always renders the same "we sent you an email"
 * confirmation regardless of whether the email exists in our DB —
 * exposing user existence leaks an account-enumeration vector.
 *
 * Reset flow: this page → POST requestPasswordReset → Supabase emails
 * a recovery link → user clicks the link → /auth/callback exchanges
 * the code → redirects to /reset-password where they pick a new
 * password.
 */

import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = {
  title: "Forgot password",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { status, error } = await searchParams;
  const sent = status === "sent";

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
              Reset password
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
              Forgot your password?
            </h1>
            <p className="text-sm text-text-secondary leading-relaxed">
              Drop the email you signed up with. If we have an account on
              file we&apos;ll send you a reset link — usually in your
              inbox within a minute.
            </p>
          </div>

          {sent ? (
            <div className="border-l-2 border-emerald-dark pl-4 py-1 space-y-2">
              <p className="text-sm text-text-primary font-medium">
                Check your inbox.
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">
                If your email is on file, a reset link is on its way. Click
                it to set a new password. The link is valid for 1 hour.
              </p>
              <p className="text-xs text-text-muted leading-relaxed pt-2">
                Didn&apos;t arrive? Check spam, or{" "}
                <Link
                  href="/forgot-password"
                  className="text-emerald-dark hover:opacity-80 underline underline-offset-2"
                >
                  request a new link
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="text-sm text-danger border-l-2 border-danger pl-4 py-1">
                  {error}
                </div>
              )}
              <form className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@company.ie"
                    required
                    autoComplete="email"
                  />
                </div>
                <Button
                  formAction={requestPasswordReset}
                  className="w-full"
                  size="lg"
                >
                  Send reset link
                </Button>
              </form>
            </>
          )}

          <p className="text-sm text-text-secondary">
            Remembered it?{" "}
            <Link
              href="/login"
              className="text-text-primary font-medium underline underline-offset-4 decoration-border-strong hover:decoration-emerald-dark transition-colors"
            >
              Back to sign in
            </Link>
          </p>
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
