import Link from "next/link";
import { signup } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = {
  title: "Start your trial",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
              Start your trial
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
              Know how AI talks about your brand.
            </h1>
            <p className="text-sm text-text-secondary leading-relaxed">
              Seven days free. No credit card. Set up in under five minutes.
            </p>
          </div>

          {error && (
            <div className="text-sm text-danger border-l-2 border-danger pl-4 py-1">
              {error}
            </div>
          )}

          <form className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="Aoife Murphy"
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name</Label>
              <Input
                id="companyName"
                name="companyName"
                type="text"
                placeholder="Acme Legal Ireland"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="aoife@company.ie"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Min 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button formAction={signup} className="w-full" size="lg">
              Start free trial
            </Button>
          </form>

          <p className="text-sm text-text-secondary">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-text-primary font-medium underline underline-offset-4 decoration-border-strong hover:decoration-emerald-dark transition-colors"
            >
              Sign in
            </Link>
          </p>

          <p className="text-xs text-text-muted pt-4 border-t border-border">
            By signing up, you agree to our Terms of Service. No credit card required.
          </p>
        </div>
      </main>
    </div>
  );
}
