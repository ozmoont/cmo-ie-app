import Link from "next/link";
import { login } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top brand line */}
      <header className="px-4 md:px-8 py-5 border-b border-border">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-semibold text-text-primary tracking-tight hover:text-emerald-dark transition-colors"
        >
          CMO.ie
        </Link>
      </header>

      {/* Centred editorial form - no card wrapper */}
      <main className="flex-1 flex items-center justify-center px-4 md:px-6 py-16">
        <div className="w-full max-w-md space-y-10">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-[2px] bg-emerald-dark"
              />
              Sign in
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
              Welcome back.
            </h1>
            <p className="text-sm text-text-secondary leading-relaxed">
              Enter your email and password to pick up where you left off.
            </p>
          </div>

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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            <Button formAction={login} className="w-full" size="lg">
              Sign in
            </Button>
          </form>

          <p className="text-sm text-text-secondary">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-text-primary font-medium underline underline-offset-4 decoration-border-strong hover:decoration-emerald-dark transition-colors"
            >
              Start your free trial
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
