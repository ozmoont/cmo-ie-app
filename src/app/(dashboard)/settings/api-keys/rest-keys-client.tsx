"use client";

/**
 * Client-side REST API key management:
 *
 *   1. Load the org's existing keys on mount.
 *   2. "New key" form with name + scope checkboxes.
 *   3. On create, show the plaintext ONCE in a copy-able block with a
 *      strong warning. Once the modal is dismissed the plaintext is
 *      gone — it doesn't persist anywhere client-side beyond the
 *      current render tree.
 *   4. Revoke button per row with a confirm step.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { API_SCOPES } from "@/lib/api-auth";

interface KeyRow {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface CreatedKeyPayload {
  key: Pick<KeyRow, "id" | "name" | "token_prefix" | "scopes" | "created_at">;
  plaintext: string;
}

export function RestKeysClient() {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<CreatedKeyPayload | null>(null);
  const [copied, setCopied] = useState(false);

  const [formName, setFormName] = useState("");
  const [formScopes, setFormScopes] = useState<string[]>([...API_SCOPES]);
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/rest-keys");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Failed to load keys");
      return;
    }
    const body = await res.json();
    setKeys(body.keys ?? []);
    setError(null);
  }

  useEffect(() => {
    // Fetch-on-mount. The setState calls inside load() happen after an
    // `await` boundary, so there's no synchronous cascade — the lint
    // rule's heuristic can't see through the async function so we
    // disable it for this single site.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function createKey() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/rest-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: formName, scopes: formScopes }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to create key");
      setNewKey(body as CreatedKeyPayload);
      setFormName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Any integration using it will stop working immediately.")) return;
    const res = await fetch(`/api/settings/rest-keys/${id}`, {
      method: "PATCH",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Failed to revoke");
      return;
    }
    await load();
  }

  function toggleScope(scope: string, on: boolean) {
    if (on) setFormScopes((prev) => Array.from(new Set([...prev, scope])));
    else setFormScopes((prev) => prev.filter((s) => s !== scope));
  }

  async function copyPlaintext(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {/* ── Create form ── */}
      <section className="py-10 border-b border-border">
        <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          New key
        </h2>
        <div className="mt-4 max-w-xl space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-text-muted mb-1.5">
              Name
            </span>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Looker integration"
              className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-emerald"
            />
          </label>

          <div>
            <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-text-muted mb-1.5">
              Scopes
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {API_SCOPES.map((scope) => {
                const on = formScopes.includes(scope);
                return (
                  <label
                    key={scope}
                    className="flex items-center gap-2 text-sm text-text-primary"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => toggleScope(scope, e.target.checked)}
                      className="h-4 w-4 rounded border-border text-emerald-dark focus:ring-emerald"
                    />
                    <span className="font-mono text-xs">{scope}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-text-muted leading-relaxed">
              v1 scopes are all read-only. You can widen later by revoking
              and minting a new key.
            </p>
          </div>

          <Button
            onClick={createKey}
            disabled={!formName || formScopes.length === 0 || creating}
            className="gap-2"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create key
          </Button>
        </div>
      </section>

      {/* ── Created-key reveal ── */}
      {newKey && (
        <section className="py-6 border-b border-border">
          <div className="max-w-2xl rounded-lg border border-warning/60 bg-warning/5 p-5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">
                Copy this key now — it won&apos;t be shown again.
              </p>
              <div className="mt-3 flex items-center gap-2 font-mono text-sm bg-surface rounded-md border border-border p-3">
                <code className="flex-1 truncate text-text-primary">
                  {newKey.plaintext}
                </code>
                <button
                  onClick={() => copyPlaintext(newKey.plaintext)}
                  className="shrink-0 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </button>
              </div>
              <p className="mt-3 text-xs text-text-secondary">
                Store it in your integration&apos;s secret store (1Password,
                Doppler, Vercel env, etc). If you lose it, revoke and mint a
                new one.
              </p>
              <button
                onClick={() => setNewKey(null)}
                className="mt-3 text-xs text-text-muted hover:text-text-primary"
              >
                Got it, hide this
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Existing keys ── */}
      <section className="py-10">
        <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 mb-4">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Your keys
        </h2>

        {error && (
          <p className="mb-3 text-sm text-danger">{error}</p>
        )}

        {keys === null ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No keys yet. Create one above to get started.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {keys.map((k) => (
              <li key={k.id} className="py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-text-primary">
                      {k.name}
                    </span>
                    <span className="font-mono text-xs text-text-muted">
                      {k.token_prefix}…
                    </span>
                    {k.revoked_at && (
                      <Badge variant="default" className="text-[10px]">
                        revoked
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted font-mono tabular-nums">
                    {k.scopes.join(" · ")}
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted">
                    Created {shortDate(k.created_at)}
                    {k.last_used_at && (
                      <> · last used {shortDate(k.last_used_at)}</>
                    )}
                    {k.revoked_at && (
                      <> · revoked {shortDate(k.revoked_at)}</>
                    )}
                  </div>
                </div>
                {!k.revoked_at && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke(k.id)}
                    className="text-text-muted hover:text-danger gap-1.5 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
