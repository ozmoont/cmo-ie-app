"use client";

/**
 * Client component for /admin/admins. Lists current admins, grants
 * by email, revokes by user id. Polls /api/admin/admins after each
 * mutation so the row state stays consistent.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Check,
  Trash2,
  ShieldCheck,
} from "lucide-react";

interface AdminEntry {
  user_id: string | null;
  email: string;
  full_name: string | null;
  source: "env" | "db";
  granted_at: string | null;
  granted_by_email: string | null;
}

interface ListPayload {
  admins: AdminEntry[];
  current_user_id: string;
  current_user_email: string | null;
}

export function AdminsManager() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [grantEmail, setGrantEmail] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);

  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/admins");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `HTTP ${res.status}`
        );
      }
      setData((await res.json()) as ListPayload);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const grant = async () => {
    setGranting(true);
    setGrantError(null);
    setGrantSuccess(null);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: grantEmail.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `HTTP ${res.status}`
        );
      }
      setGrantSuccess(
        body.message ?? `Granted admin to ${grantEmail.trim()}.`
      );
      setGrantEmail("");
      await load();
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : "Network error");
    } finally {
      setGranting(false);
    }
  };

  const revoke = async (userId: string, email: string) => {
    if (!window.confirm(`Revoke admin access for ${email}?`)) return;
    setRevokingId(userId);
    try {
      const res = await fetch(`/api/admin/admins/${userId}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `HTTP ${res.status}`
        );
      }
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <section className="mt-10 space-y-10">
      {/* ── Grant form ─────────────────────────────────────── */}
      <div className="border border-border rounded-md p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold mb-3">
          Grant admin
        </p>
        <p className="text-xs text-text-muted mb-4 leading-relaxed">
          The user must already have a CMO.ie account. If they don&apos;t,
          have them sign up first (or invite via Supabase →
          Authentication → Users → Invite user), then grant access here.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (grantEmail.trim().length > 0 && !granting) grant();
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <input
            type="email"
            required
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
            placeholder="user@howl.ie"
            disabled={granting}
            className="flex-1 px-4 py-2 rounded-md border border-border bg-surface text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-emerald-dark/30 focus:border-emerald-dark disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={granting || grantEmail.trim().length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-text-primary text-text-inverse text-sm font-medium px-5 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {granting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Granting…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" /> Grant admin
              </>
            )}
          </button>
        </form>
        {grantError && (
          <p className="mt-3 text-sm text-danger flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{grantError}</span>
          </p>
        )}
        {grantSuccess && (
          <p className="mt-3 text-sm text-emerald-dark flex items-start gap-2">
            <Check className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{grantSuccess}</span>
          </p>
        )}
      </div>

      {/* ── Current admins ─────────────────────────────────── */}
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold mb-3">
          Current admins
        </p>
        {loading ? (
          <p className="text-sm text-text-muted py-6 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : loadError ? (
          <p className="text-sm text-danger flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {loadError}
          </p>
        ) : !data || data.admins.length === 0 ? (
          <p className="text-sm text-text-muted py-6">No admins yet.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {data.admins.map((entry) => {
              const isSelf = entry.user_id === data.current_user_id;
              const isEnv = entry.source === "env";
              return (
                <li
                  key={`${entry.source}-${entry.user_id ?? entry.email}`}
                  className="flex items-center justify-between gap-4 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary truncate">
                      {entry.email}
                      {isSelf && (
                        <span className="ml-2 text-xs text-text-muted">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded font-mono text-[10px] uppercase tracking-wider mr-2 ${
                          isEnv
                            ? "bg-text-muted/10 text-text-muted"
                            : "bg-emerald-dark/10 text-emerald-dark"
                        }`}
                      >
                        {entry.source}
                      </span>
                      {entry.full_name && <>{entry.full_name} · </>}
                      {entry.granted_at &&
                        `granted ${new Date(entry.granted_at).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}`}
                      {entry.granted_by_email && (
                        <> by {entry.granted_by_email}</>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {isEnv ? (
                      <span
                        className="text-xs text-text-muted"
                        title="Listed in CMO_ADMIN_EMAILS — manage on Vercel."
                      >
                        env-locked
                      </span>
                    ) : isSelf ? (
                      <span
                        className="text-xs text-text-muted"
                        title="Have another admin revoke you."
                      >
                        can&apos;t self-revoke
                      </span>
                    ) : entry.user_id ? (
                      <button
                        onClick={() =>
                          entry.user_id && revoke(entry.user_id, entry.email)
                        }
                        disabled={revokingId === entry.user_id}
                        className="text-xs text-danger hover:opacity-80 inline-flex items-center gap-1 px-2 py-1 rounded border border-danger/30 hover:bg-danger/5 disabled:opacity-40"
                      >
                        {revokingId === entry.user_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Revoke
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
