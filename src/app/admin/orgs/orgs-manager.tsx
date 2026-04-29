"use client";

/**
 * Client component for /admin/orgs. Lists orgs with plan + trial +
 * comp balances. Click an org to expand its grant form. Posts to
 * /api/admin/orgs/[id]/grant; reloads after each successful grant.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Check,
  ShieldCheck,
  Search,
  ChevronDown,
} from "lucide-react";

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trial_ends_at: string | null;
  trial_extended_to: string | null;
  comp_seo_audits: number | null;
  comp_brief_credits: number | null;
  comp_notes: string | null;
  comp_granted_by: string | null;
  comp_granted_at: string | null;
  brief_credits_used: number | null;
  created_at: string;
  owner_email: string | null;
  owner_name: string | null;
  member_count: number;
  granted_by_email: string | null;
}

interface ListPayload {
  orgs: Org[];
  total: number;
  current_user_id: string;
}

export function OrgsManager() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(
    async (search: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        const res = await fetch(`/api/admin/orgs?${params.toString()}`);
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
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load("");
  }, [load]);

  return (
    <section className="mt-10 space-y-6">
      {/* ── Search bar ───────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(q);
        }}
        className="flex gap-3"
      >
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by org name, slug, or owner email"
            className="w-full pl-10 pr-4 py-2 rounded-md border border-border bg-surface text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-emerald-dark/30 focus:border-emerald-dark"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-text-primary text-text-inverse text-sm font-medium px-5 py-2 hover:opacity-90 transition-opacity"
        >
          Search
        </button>
      </form>

      {/* ── States ───────────────────────────────────────────── */}
      {loading && (
        <p className="text-sm text-text-muted py-6 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading orgs…
        </p>
      )}
      {!loading && error && (
        <p className="text-sm text-danger flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {!loading && !error && data && data.orgs.length === 0 && (
        <p className="text-sm text-text-muted py-6">No orgs match.</p>
      )}

      {/* ── Org list ─────────────────────────────────────────── */}
      {!loading && !error && data && data.orgs.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {data.orgs.map((org) => {
            const isExpanded = expandedId === org.id;
            return (
              <li key={org.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : org.id)}
                  className="w-full grid grid-cols-12 gap-4 py-4 items-start hover:bg-surface-muted/30 transition-colors text-left"
                >
                  <div className="col-span-12 md:col-span-5 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {org.name}
                      <span className="ml-2 text-xs text-text-muted font-mono">
                        {org.plan}
                      </span>
                    </p>
                    {org.owner_email && (
                      <p className="text-xs text-text-muted truncate">
                        {org.owner_email}
                        {org.owner_name && (
                          <span className="ml-1">({org.owner_name})</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="col-span-6 md:col-span-3 text-xs text-text-muted">
                    <p>
                      <span className="text-text-secondary">Audits:</span>{" "}
                      <span className="font-mono">
                        {org.comp_seo_audits ?? 0}
                      </span>
                    </p>
                    <p>
                      <span className="text-text-secondary">Briefs:</span>{" "}
                      <span className="font-mono">
                        {org.comp_brief_credits ?? 0}
                      </span>
                    </p>
                  </div>
                  <div className="col-span-6 md:col-span-3 text-xs text-text-muted">
                    <p>
                      <span className="text-text-secondary">Trial:</span>{" "}
                      <span className="font-mono">
                        {org.trial_ends_at
                          ? new Date(org.trial_ends_at).toLocaleDateString(
                              "en-IE",
                              { day: "numeric", month: "short", year: "2-digit" }
                            )
                          : "—"}
                      </span>
                    </p>
                    <p>
                      <span className="text-text-secondary">Members:</span>{" "}
                      <span className="font-mono">{org.member_count}</span>
                    </p>
                  </div>
                  <div className="col-span-12 md:col-span-1 text-right">
                    <ChevronDown
                      className={`h-4 w-4 inline-block transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <GrantForm
                    org={org}
                    onSaved={() => {
                      setExpandedId(null);
                      load(q);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Grant form ────────────────────────────────────────────────────

function GrantForm({ org, onSaved }: { org: Org; onSaved: () => void }) {
  const [audits, setAudits] = useState("");
  const [briefs, setBriefs] = useState("");
  const [trialDays, setTrialDays] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const body: Record<string, unknown> = {};
    const a = parseInt(audits, 10);
    const b = parseInt(briefs, 10);
    const d = parseInt(trialDays, 10);
    if (!isNaN(a) && a > 0) body.comp_seo_audits = a;
    if (!isNaN(b) && b > 0) body.comp_brief_credits = b;
    if (!isNaN(d) && d > 0) body.extend_trial_days = d;
    if (notes.trim().length > 0) body.notes = notes.trim();

    if (Object.keys(body).length === 0) {
      setError("Provide at least one grant: audits, briefs, trial days, or notes.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/orgs/${org.id}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `HTTP ${res.status}`
        );
      }
      setSuccess(true);
      // Auto-close after a moment so the parent list reloads with
      // updated balances.
      setTimeout(onSaved, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-muted/40 border-t border-border px-2 md:px-6 py-5 space-y-4">
      <p className="text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold">
        Grant
      </p>

      <div className="grid grid-cols-3 gap-3">
        <NumInput
          label="Audits"
          value={audits}
          onChange={setAudits}
          placeholder="e.g. 3"
          max={100}
        />
        <NumInput
          label="Brief credits"
          value={briefs}
          onChange={setBriefs}
          placeholder="e.g. 10"
          max={500}
        />
        <NumInput
          label="Extend trial (days)"
          value={trialDays}
          onChange={setTrialDays}
          placeholder="e.g. 14"
          max={365}
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-[0.15em] text-text-muted mb-1">
          Note (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why this grant — e.g. 'Pilot extension while they evaluate Pro' or 'Comp for the audit failure on 27 Apr'."
          rows={2}
          className="w-full text-sm rounded-md border border-border bg-surface px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-emerald-dark/30 focus:border-emerald-dark resize-y"
        />
      </div>

      {org.comp_notes && (
        <details className="text-xs text-text-muted">
          <summary className="cursor-pointer hover:text-text-secondary">
            Previous grant notes
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
            {org.comp_notes}
          </pre>
        </details>
      )}

      {error && (
        <p className="text-xs text-danger flex items-start gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {success && (
        <p className="text-xs text-emerald-dark flex items-start gap-1">
          <Check className="h-3 w-3 mt-0.5 shrink-0" />
          Grant applied. Reloading…
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-text-primary text-text-inverse text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" /> Apply grant
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  placeholder,
  max,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
  max: number;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-[0.15em] text-text-muted mb-1">
        {label}
      </label>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-emerald-dark/30 focus:border-emerald-dark font-mono"
      />
    </div>
  );
}
