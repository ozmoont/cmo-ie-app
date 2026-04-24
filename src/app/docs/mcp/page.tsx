/**
 * /docs/mcp — install instructions for the CMO.ie MCP connector.
 *
 * The v1 install path is static-bearer-token: user generates a key at
 * /settings/api-keys, adds the CMO.ie MCP connector URL to their Claude
 * client, pastes the key. P3-B3 will add an OAuth flow for the public
 * connector directory listing — until then, this page carries the
 * demo weight.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "MCP connector — CMO.ie",
  description:
    "Install the CMO.ie MCP connector to query your AI visibility data directly from Claude.",
};

export default function McpDocsPage() {
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
          MCP connector
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Ask Claude about your AI visibility.
        </h1>

        <p className="mt-5 text-base text-text-secondary leading-relaxed">
          The CMO.ie MCP server lets Claude query your live CMO.ie data in
          natural language. Install it once and you can ask questions like{" "}
          <em className="text-text-primary not-italic">
            &ldquo;How did my AI visibility change this week, and what&apos;s the
            single biggest gap to act on?&rdquo;
          </em>{" "}
          in any Claude client that supports MCP.
        </p>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Install</h2>
          <ol className="list-decimal list-inside space-y-3 text-sm text-text-secondary leading-relaxed">
            <li>
              Mint a REST API key at{" "}
              <Link
                href="/settings/api-keys"
                className="underline text-text-primary"
              >
                Settings → REST API keys
              </Link>
              . Select the scopes you want Claude to have access to. For
              full functionality, tick all six.
            </li>
            <li>
              Copy the plaintext key (shown once, starts with{" "}
              <code className="font-mono text-[12px]">cmo_</code>).
            </li>
            <li>
              In Claude.ai, Claude Desktop, Claude Code, or any other MCP
              client, add a new connector with these details:
            </li>
          </ol>

          <ConnectorCard />
        </section>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Available tools
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            Claude automatically picks the right tool based on your
            question. The six read-only tools exposed to the model:
          </p>
          <ul className="divide-y divide-border border-y border-border">
            <ToolRow
              name="list_projects"
              desc="List every project in your organisation. Claude calls this first when it doesn't know which project you mean."
            />
            <ToolRow
              name="get_visibility"
              desc="Visibility %, share of voice, average position, sentiment distribution for a project over a window."
            />
            <ToolRow
              name="list_gaps"
              desc="Ranked list of sources where competitors appear and you don't, with per-source playbooks."
            />
            <ToolRow
              name="list_sources"
              desc="Domains (or URLs) AI cites when answering your tracked prompts, with retrieval and citation rates."
            />
            <ToolRow
              name="get_prompt_detail"
              desc="Full visibility arc for one specific tracked prompt — per-model snapshot, sources, brands named, response history."
            />
            <ToolRow
              name="get_recent_chats"
              desc="Most recent individual AI responses with snippets. Useful for pulling direct evidence."
            />
          </ul>
        </section>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Example prompts
          </h2>
          <ul className="list-disc list-inside space-y-2 text-sm text-text-secondary leading-relaxed">
            <li>
              &ldquo;How did my AI visibility change in the last 30 days?&rdquo;
            </li>
            <li>
              &ldquo;Which competitor is gaining the most share of voice on
              my prompts?&rdquo;
            </li>
            <li>
              &ldquo;Give me the three highest-opportunity gaps I should act
              on this week, and what the playbook looks like for each.&rdquo;
            </li>
            <li>
              &ldquo;What&apos;s the full history on the prompt about
              &lsquo;best accountants in Dublin&rsquo; — did any AI mention
              us?&rdquo;
            </li>
          </ul>
        </section>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            REST equivalents
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            Every MCP tool is a thin wrapper over the{" "}
            <Link href="/docs/api" className="underline text-text-primary">
              REST API
            </Link>
            . Same data, same auth, same scope model — use whichever
            interface suits the tool you&apos;re building.
          </p>
        </section>

        <footer className="mt-16 pt-8 border-t border-border text-xs text-text-muted">
          v1 uses static bearer-token auth. The OAuth install flow ships in
          the next release — no-op for existing installs.
        </footer>
      </main>
    </div>
  );
}

function ConnectorCard() {
  return (
    <div className="border border-border rounded-lg bg-surface-hover p-5 space-y-3 text-sm">
      <div>
        <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-text-muted">
          Server URL
        </p>
        <code className="block font-mono mt-1 text-text-primary">
          https://cmo.ie/api/mcp
        </code>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-text-muted">
          Transport
        </p>
        <code className="block font-mono mt-1 text-text-primary">
          streamable-http
        </code>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-text-muted">
          Authentication
        </p>
        <code className="block font-mono mt-1 text-text-primary">
          Authorization: Bearer cmo_…
        </code>
      </div>
    </div>
  );
}

function ToolRow({ name, desc }: { name: string; desc: string }) {
  return (
    <li className="py-3 flex items-start gap-4 text-sm">
      <code className="font-mono text-text-primary shrink-0 w-[170px]">
        {name}
      </code>
      <span className="text-text-secondary">{desc}</span>
    </li>
  );
}
