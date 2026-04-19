"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";

/**
 * Root-level client-side error boundary.
 * Matches the editorial auth-page layout: thin top bar, centred block,
 * hairline-bordered side marks for errors, plain copy, two actions.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to whichever observability you have. Kept as console for now.
    console.error("App error boundary:", error);
  }, [error]);

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
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-danger font-semibold flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-[2px] bg-danger"
              />
              Something broke
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
              We hit an error loading this page.
            </h1>
            <p className="text-sm text-text-secondary leading-relaxed">
              The team has been notified. You can try again, or head back to
              the homepage. If this keeps happening, let us know at{" "}
              <a
                href="mailto:hello@cmo.ie"
                className="text-text-primary underline underline-offset-4 decoration-border-strong hover:decoration-emerald-dark transition-colors"
              >
                hello@cmo.ie
              </a>
              .
            </p>
          </div>

          {error.digest && (
            <p className="text-xs text-text-muted font-mono border-l-2 border-border pl-3 py-0.5">
              Error reference: {error.digest}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={() => reset()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Try again
            </Button>
            <Link href="/">
              <Button variant="ghost">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to home
              </Button>
            </Link>
          </div>
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
