"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, Search, XCircle } from "lucide-react";
import type { CrawlabilityReport } from "@/lib/crawlability";

export function CrawlabilityClient() {
  const [url, setUrl] = useState("");
  const [report, setReport] = useState<CrawlabilityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState<
    | { state: "idle" }
    | { state: "submitting" }
    | { state: "ok"; message: string }
    | { state: "error"; message: string }
  >({ state: "idle" });

  async function runCheck(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/crawlability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setReport(body.report as CrawlabilityReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setNewsletterStatus({ state: "submitting" });
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source: "crawlability" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setNewsletterStatus({ state: "ok", message: body.message ?? "Check your inbox." });
    } catch (err) {
      setNewsletterStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const byVendor = report
    ? groupByVendor(report.bots)
    : null;

  return (
    <>
      {/* ── Form ── */}
      <form onSubmit={runCheck} className="mt-10 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="example.ie or https://example.ie"
          className="flex-1 rounded-md border border-border bg-surface px-4 py-3 text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-emerald"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-text-primary text-text-inverse text-sm font-medium px-5 py-3 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Check
        </button>
      </form>

      {error && (
        <div className="mt-4 flex items-start gap-3 border border-danger/40 bg-danger/5 rounded-lg p-4 text-sm">
          <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* ── Results ── */}
      {report && (
        <section className="mt-10 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-mono text-text-muted tabular-nums">
                {report.robots_txt_url}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {report.fetched
                  ? `${report.bot_specific_blocks} bot-specific block${report.bot_specific_blocks === 1 ? "" : "s"}${report.sitemap_declared ? " · sitemap declared" : ""}`
                  : "robots.txt not found — the web's default is crawlable."}
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm font-mono tabular-nums">
              <span className="text-emerald-dark">
                ✓ {report.summary.allowed} allowed
              </span>
              {report.summary.partial > 0 && (
                <span className="text-warning">
                  ◐ {report.summary.partial} partial
                </span>
              )}
              {report.summary.blocked > 0 && (
                <span className="text-danger">
                  ✕ {report.summary.blocked} blocked
                </span>
              )}
            </div>
          </div>

          <ul className="divide-y divide-border border-y border-border">
            {byVendor!.map(([vendor, bots]) => (
              <li key={vendor} className="py-4">
                <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold mb-2">
                  {vendor}
                </p>
                <ul className="space-y-2">
                  {bots.map((b) => (
                    <li
                      key={b.bot}
                      className="flex items-start gap-3 text-sm"
                    >
                      <StatusIcon status={b.status} />
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-text-primary">
                          {b.label}
                        </span>
                        <span className="ml-2 text-xs text-text-muted">
                          {b.reason}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Newsletter ── */}
      {report && (
        <section className="mt-10 border-t border-border pt-8">
          <h2 className="text-lg font-semibold tracking-tight">
            Want a weekly Irish AI crawlability digest?
          </h2>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            We watch 150+ Irish publishers + business domains. When
            something changes — a new block, a directory added, an AI
            crawler refused — you get an email.
          </p>
          {newsletterStatus.state === "ok" ? (
            <p className="mt-4 text-sm text-emerald-dark flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0" />
              {newsletterStatus.message}
            </p>
          ) : (
            <form
              onSubmit={subscribe}
              className="mt-4 flex flex-col sm:flex-row gap-3"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.ie"
                className="flex-1 rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-emerald"
              />
              <button
                type="submit"
                disabled={
                  newsletterStatus.state === "submitting" ||
                  !email.includes("@")
                }
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border text-sm font-medium px-4 py-2.5 text-text-primary hover:border-text-primary transition-colors disabled:opacity-50"
              >
                {newsletterStatus.state === "submitting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Subscribe
              </button>
            </form>
          )}
          {newsletterStatus.state === "error" && (
            <p className="mt-2 text-xs text-danger">{newsletterStatus.message}</p>
          )}
        </section>
      )}
    </>
  );
}

function StatusIcon({ status }: { status: CrawlabilityReport["bots"][number]["status"] }) {
  if (status === "allowed") {
    return <Check className="h-4 w-4 text-emerald-dark shrink-0 mt-0.5" />;
  }
  if (status === "blocked") {
    return <XCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />;
  }
  if (status === "partial") {
    return (
      <span
        aria-hidden="true"
        className="h-4 w-4 shrink-0 mt-0.5 text-warning font-mono leading-none text-center"
      >
        ◐
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 mt-0.5 text-text-muted font-mono leading-none text-center"
    >
      ?
    </span>
  );
}

function groupByVendor(
  bots: CrawlabilityReport["bots"]
): Array<[string, CrawlabilityReport["bots"]]> {
  const map = new Map<string, CrawlabilityReport["bots"]>();
  for (const b of bots) {
    const list = map.get(b.vendor) ?? [];
    list.push(b);
    map.set(b.vendor, list);
  }
  return Array.from(map.entries());
}
