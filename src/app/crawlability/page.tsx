/**
 * /crawlability — public AI-bot crawlability checker.
 *
 * Anonymous; no auth. Top-of-funnel wedge: a marketing director types
 * their domain, gets a per-bot verdict in 5 seconds, optionally opts
 * into the newsletter. Written as a client component so the result
 * area can render without a page reload.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CrawlabilityClient } from "./crawlability-client";

export const metadata = {
  title: "AI crawlability checker — CMO.ie",
  description:
    "Check whether GPTBot, ClaudeBot, PerplexityBot and 30+ other AI crawlers are allowed on your domain. Free, no signup.",
};

export default function CrawlabilityPage() {
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-semibold tracking-tight hover:text-emerald-dark transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            CMO.ie
          </Link>
          <nav className="flex items-center gap-6 text-sm text-text-secondary">
            <Link href="/agency" className="hover:text-text-primary">
              Agencies
            </Link>
            <Link href="/docs/api" className="hover:text-text-primary">
              API
            </Link>
            <Link href="/login" className="hover:text-text-primary">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 md:px-10 py-12 md:py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Free tool
        </p>
        <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Is AI allowed on your site?
        </h1>
        <p className="mt-5 text-base md:text-lg text-text-secondary leading-relaxed max-w-2xl">
          Check any domain&apos;s robots.txt against 30+ AI crawler
          user-agents in under 5 seconds. No signup, no marketing
          email (unless you want one).
        </p>

        <CrawlabilityClient />

        <section className="mt-16 border-t border-border pt-10 space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            Why this matters
          </h2>
          <div className="space-y-4 text-sm text-text-secondary leading-relaxed">
            <p>
              AI search tools — ChatGPT, Claude, Perplexity, Google AI
              Overviews, Copilot — read the public web to answer their
              users&apos; questions. If your robots.txt blocks their
              crawlers, they can&apos;t read your site — which means
              they can&apos;t recommend you when someone asks a
              question your brand should answer.
            </p>
            <p>
              This check doesn&apos;t fix anything. It reads your
              existing robots.txt and tells you, bot by bot, whether
              they&apos;re allowed. For the full picture — including
              who&apos;s actually citing you and where your competitors
              are appearing that you&apos;re not — see the{" "}
              <Link href="/" className="underline text-text-primary">
                CMO.ie dashboard
              </Link>
              .
            </p>
          </div>
        </section>

        <footer className="mt-16 pt-8 border-t border-border text-xs text-text-muted flex items-center justify-between flex-wrap gap-4">
          <p>© {new Date().getFullYear()} Howl.ie. Built in Dublin.</p>
          <nav className="flex items-center gap-6">
            <Link href="/agency" className="hover:text-text-primary">
              Agencies
            </Link>
            <Link href="/docs/api" className="hover:text-text-primary">
              API
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
