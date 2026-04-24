/**
 * /docs/api — public REST API reference.
 *
 * Rendered from `lib/api/catalogue.ts` so the page can't silently drift
 * from what's deployed. Intentionally minimal chrome: a single-column
 * editorial layout, code samples in a mono block, each endpoint linked
 * by anchor.
 *
 * No authentication — this page is publicly reachable. It's a public
 * reference; no customer data lives here.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { V1_ENDPOINTS, type EndpointDoc } from "@/lib/api/catalogue";

export const metadata = {
  title: "REST API reference — CMO.ie",
  description:
    "Public REST API for pulling your CMO.ie visibility data. Scoped Bearer tokens, paginated responses, JSON.",
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <main className="max-w-3xl mx-auto px-6 md:px-10 py-12 md:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to CMO.ie
        </Link>

        <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          REST API · v1
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          The data behind your dashboard, over HTTP.
        </h1>

        <p className="mt-5 text-base text-text-secondary leading-relaxed">
          Every number on your CMO.ie dashboard is reachable via this API.
          It&apos;s read-only in v1, scoped by Bearer token, paginated, and
          returns JSON. Use it for Sheets / Looker / internal dashboards,
          or install the{" "}
          <Link href="/docs/mcp" className="underline">
            MCP server
          </Link>{" "}
          to query it from Claude in natural language.
        </p>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Getting started
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-text-secondary leading-relaxed">
            <li>
              Create a key at{" "}
              <Link
                href="/settings/api-keys"
                className="underline text-text-primary"
              >
                Settings → REST API keys
              </Link>
              . Copy it immediately — it&apos;s shown exactly once.
            </li>
            <li>
              Pick the scopes you need. v1 scopes are all read-only; mint
              narrower keys for tools that only need a subset.
            </li>
            <li>
              Send an <code className="font-mono text-[12px]">Authorization: Bearer &lt;key&gt;</code>{" "}
              header with every request.
            </li>
          </ol>
          <CodeBlock>
{`curl -s \\
  -H 'Authorization: Bearer cmo_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' \\
  https://cmo.ie/api/v1/projects`}
          </CodeBlock>
        </section>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Pagination + errors
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            List endpoints accept <code className="font-mono text-[12px]">?page=</code>{" "}
            (1-indexed) and <code className="font-mono text-[12px]">?page_size=</code>{" "}
            (default 50, max 200). They respond with a{" "}
            <code className="font-mono text-[12px]">pagination</code> envelope:
          </p>
          <CodeBlock>
{`{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total": 212,
    "has_more": true
  }
}`}
          </CodeBlock>
          <p className="text-sm text-text-secondary leading-relaxed">
            Errors always use the{" "}
            <code className="font-mono text-[12px]">error</code> envelope with a
            stable <code className="font-mono text-[12px]">code</code>:
          </p>
          <CodeBlock>
{`{ "error": { "code": "insufficient_scope", "message": "Token missing scope: gaps.read" } }`}
          </CodeBlock>
          <p className="text-sm text-text-secondary leading-relaxed">
            Rate limit: <strong>60 requests per minute</strong> per key. On
            breach you&apos;ll get a{" "}
            <code className="font-mono text-[12px]">429</code> with a{" "}
            <code className="font-mono text-[12px]">retry-after</code> header.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight mb-4">
            Endpoints
          </h2>
          <ul className="space-y-10">
            {V1_ENDPOINTS.map((ep) => (
              <EndpointEntry key={`${ep.method}-${ep.path}`} endpoint={ep} />
            ))}
          </ul>
        </section>

        <footer className="mt-16 pt-8 border-t border-border text-xs text-text-muted">
          v1 is frozen at this shape. Changes roll out under{" "}
          <code className="font-mono">/api/v2</code>.
        </footer>
      </main>
    </div>
  );
}

function EndpointEntry({ endpoint }: { endpoint: EndpointDoc }) {
  const anchor = endpoint.path.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return (
    <li id={anchor} className="scroll-mt-24">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] px-2 py-0.5 rounded bg-emerald-dark/10 text-emerald-dark">
          {endpoint.method}
        </span>
        <code className="font-mono text-sm text-text-primary">
          {endpoint.path}
        </code>
        <span className="font-mono text-[11px] text-text-muted">
          scope: {endpoint.scope}
        </span>
      </div>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed">
        {endpoint.summary}
      </p>

      {endpoint.params && endpoint.params.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-text-muted mb-2">
            Query parameters
          </p>
          <ul className="border-y border-border divide-y divide-border">
            {endpoint.params.map((p) => (
              <li key={p.name} className="py-2 flex items-start gap-3 text-sm">
                <code className="font-mono text-text-primary shrink-0">
                  {p.name}
                  {!p.required && (
                    <span className="text-text-muted"> (optional)</span>
                  )}
                </code>
                <span className="text-text-secondary">{p.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {endpoint.example_response && (
        <CodeBlock>{endpoint.example_response}</CodeBlock>
      )}
    </li>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-surface-hover border border-border rounded-md p-4 text-[12px] leading-relaxed overflow-x-auto font-mono text-text-primary whitespace-pre mt-3">
      {children}
    </pre>
  );
}
