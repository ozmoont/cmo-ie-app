"use client";

/**
 * Coming-soon teaser homepage.
 *
 * Lives at / in place of the full landing page (which now lives at
 * /preview, robots-noindexed) until launch. The point is to:
 *   - Establish the brand at cmo.ie before paid traffic starts
 *   - Capture early-access emails into newsletter_subscribers
 *   - Keep /login, /signup, /pricing, /agency reachable for testers
 *
 * When ready to flip the switch:
 *   1. Delete src/app/preview (or keep as a marketing alt-page)
 *   2. Replace this file's content with the contents of preview/page.tsx
 *   3. Restore the global metadata (drop the noindex)
 *
 * Email capture posts to /api/newsletter/subscribe with source=manual
 * (the existing CHECK constraint allows that value; we'll add a
 * 'teaser' source via migration once we want analytics-grade
 * separation between teaser and other capture funnels).
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; alreadySubscribed: boolean }
  | { kind: "error"; message: string };

export default function TeaserHomePage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.kind === "submitting") return;

    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "manual" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        subscribed?: boolean;
      };
      if (!res.ok) {
        setState({
          kind: "error",
          message: data.error ?? "Something went wrong. Try again?",
        });
        return;
      }
      setState({
        kind: "success",
        alreadySubscribed: Boolean(data.subscribed),
      });
      setEmail("");
    } catch {
      setState({
        kind: "error",
        message: "Network error. Check your connection and retry.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-surface text-text-primary flex flex-col">
      {/* ── Top bar — minimal: logo only on the left, sign-in on the right */}
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight hover:text-emerald-dark transition-colors"
          >
            CMO.ie
          </Link>
          {/* Login link kept available for testers + existing users.
              Public visitors won't notice; testers know to click. */}
          <Link
            href="/login"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 md:px-10 py-16 md:py-24">
        <div className="w-full max-w-2xl">
          {/* Kicker */}
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Launching soon · Built in Dublin
          </p>

          {/* Headline */}
          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
            Know exactly how AI talks about your brand.
          </h1>

          {/* Sub */}
          <p className="mt-6 text-lg md:text-xl text-text-secondary leading-relaxed max-w-xl">
            CMO.ie tracks how ChatGPT, Claude, Perplexity, Gemini and
            Google AI Overviews mention your brand. Then it tells you
            exactly what to do to climb the rankings.
          </p>

          {/* Three short value bullets — kept tight, not the full landing */}
          <ul className="mt-10 space-y-4 text-base text-text-secondary max-w-xl">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-dark mt-0.5 shrink-0" />
              <span>
                <span className="text-text-primary font-medium">
                  Daily checks
                </span>{" "}
                across the AI engines your customers actually use — not
                just Google.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-dark mt-0.5 shrink-0" />
              <span>
                <span className="text-text-primary font-medium">
                  Action plans
                </span>{" "}
                that fix specific gaps, not generic SEO advice.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-dark mt-0.5 shrink-0" />
              <span>
                <span className="text-text-primary font-medium">
                  Built for the Irish market
                </span>{" "}
                — local sources, local prompts, GDPR-compliant.
              </span>
            </li>
          </ul>

          {/* Email capture */}
          <section className="mt-12 pt-10 border-t border-border">
            <h2 className="text-lg font-semibold tracking-tight">
              Want early access?
            </h2>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">
              Drop your email and we&apos;ll let you know the moment
              we&apos;re live. No spam, no marketing blast — one email,
              when it&apos;s ready.
            </p>

            <form
              onSubmit={submit}
              className="mt-5 flex flex-col sm:flex-row gap-3 max-w-xl"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.ie"
                disabled={state.kind === "submitting"}
                className="flex-1 px-4 py-3 rounded-md border border-border bg-surface text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-emerald-dark/30 focus:border-emerald-dark disabled:opacity-50"
                aria-label="Email address"
              />
              <button
                type="submit"
                disabled={state.kind === "submitting"}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-text-primary text-text-inverse text-sm font-medium px-5 py-3 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {state.kind === "submitting"
                  ? "Joining…"
                  : "Get early access"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {/* Inline status — success / error / already-subscribed */}
            {state.kind === "success" && (
              <p className="mt-4 text-sm text-emerald-dark flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {state.alreadySubscribed
                    ? "You're already on the list — we'll be in touch."
                    : "Thanks. Check your inbox to confirm — we use double opt-in to comply with Irish anti-spam rules."}
                </span>
              </p>
            )}
            {state.kind === "error" && (
              <p className="mt-4 text-sm text-danger flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{state.message}</span>
              </p>
            )}
          </section>
        </div>
      </main>

      <footer className="px-6 md:px-10 py-8 border-t border-border text-xs text-text-muted">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <p>© {new Date().getFullYear()} Howl.ie. Built in Dublin.</p>
          <nav className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-text-primary">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-text-primary">
              Terms
            </Link>
            <a
              href="mailto:hello@howl.ie"
              className="hover:text-text-primary"
            >
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
