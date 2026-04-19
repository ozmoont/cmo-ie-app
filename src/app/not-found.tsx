import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Page not found",
};

export default function NotFound() {
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
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-[2px] bg-emerald-dark"
              />
              404
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
              We can&apos;t find that page.
            </h1>
            <p className="text-sm text-text-secondary leading-relaxed">
              The link might be stale, or the page has moved. Head home and
              try again from there.
            </p>
          </div>

          <Link href="/">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to home
            </Button>
          </Link>
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
