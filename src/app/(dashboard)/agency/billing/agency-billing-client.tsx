"use client";

/**
 * Client surface for /agency/billing. Renders the pool headline and
 * the per-project allocation table with inline editable caps.
 *
 * Caps are saved on blur — no explicit save button, matches the
 * "Notion-like" feel the rest of the app uses for inline settings.
 * Network errors pop a small red banner rather than blocking the UI.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AllocationRow {
  project_id: string;
  name: string;
  brand_name: string;
  monthly_cap: number | null;
  monthly_cap_used: number;
}

interface PoolInfo {
  total: number;
  used: number;
  remaining: number | null;
  reset_at: string | null;
}

interface ApiResponse {
  pool: PoolInfo;
  projects: AllocationRow[];
}

export function AgencyBillingClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/agency/allocations");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Failed to load allocations");
      return;
    }
    const json = (await res.json()) as ApiResponse;
    setData(json);
    setError(null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function saveCap(projectId: string, raw: string) {
    const trimmed = raw.trim();
    const cap = trimmed === "" ? null : Number(trimmed);
    if (cap !== null && (!Number.isFinite(cap) || cap < 0)) {
      setError("Cap must be a positive integer, or blank for uncapped.");
      return;
    }
    setSavingProjectId(projectId);
    setError(null);
    try {
      const res = await fetch("/api/agency/allocations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          monthly_cap: cap,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Save failed");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProjectId(null);
    }
  }

  if (!data && !error) {
    return (
      <section className="py-10 flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading allocations…
      </section>
    );
  }

  if (!data) {
    return (
      <section className="py-10">
        <ErrorBanner message={error ?? "Unknown error"} />
      </section>
    );
  }

  const { pool, projects } = data;
  const totalAllocated = projects.reduce(
    (sum, p) => (p.monthly_cap !== null ? sum + p.monthly_cap : sum),
    0
  );
  const unallocated = pool.total - totalAllocated;

  return (
    <>
      {error && (
        <section className="py-4">
          <ErrorBanner message={error} />
        </section>
      )}

      {/* ── Pool headline ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 border-b border-border">
        <div className="col-span-12 md:col-span-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Monthly pool
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Briefs drawn this cycle vs. the size of your pool.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 grid grid-cols-2 md:grid-cols-4 gap-6">
          <Metric label="Pool size" value={pool.total.toLocaleString()} />
          <Metric label="Used" value={pool.used.toLocaleString()} />
          <Metric
            label="Remaining"
            value={
              pool.remaining === null || pool.remaining === Infinity
                ? "∞"
                : pool.remaining.toLocaleString()
            }
            tone="emerald"
          />
          <Metric
            label="Allocated (caps)"
            value={`${totalAllocated.toLocaleString()} ${unallocated < 0 ? "(over)" : ""}`}
            tone={unallocated < 0 ? "danger" : undefined}
          />
        </div>
        <div className="col-span-12 md:col-span-9 md:col-start-4 text-[11px] font-mono text-text-muted tabular-nums">
          {pool.reset_at ? (
            <>Pool resets {new Date(pool.reset_at).toLocaleDateString()}.</>
          ) : (
            <>Pool has no reset date on record.</>
          )}
          {unallocated < 0 && (
            <span className="ml-2 text-danger">
              ⚠ You&apos;ve allocated more caps than the pool can cover.
              One or more projects may hit the pool limit before their cap.
            </span>
          )}
        </div>
      </section>

      {/* ── Allocations table ── */}
      <section className="py-10">
        <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 mb-4">
          <span
            aria-hidden="true"
            className="inline-block w-4 h-[2px] bg-emerald-dark"
          />
          Per-project caps
        </h2>
        {projects.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No projects yet. Create one from the{" "}
            <Link href="/dashboard" className="underline text-text-primary">
              dashboard
            </Link>
            .
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold border-b border-border">
                <th className="py-3 pr-4">Project</th>
                <th className="py-3 pr-4 text-right font-mono">Used this cycle</th>
                <th className="py-3 pr-4 text-right font-mono w-[160px]">
                  Monthly cap
                </th>
                <th className="py-3 pr-4 w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <AllocationRowView
                  key={p.project_id}
                  row={p}
                  saving={savingProjectId === p.project_id}
                  onSave={(val) => saveCap(p.project_id, val)}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="py-4 flex items-center gap-2 text-xs text-text-muted">
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1 hover:text-text-primary"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </section>
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function AllocationRowView({
  row,
  saving,
  onSave,
}: {
  row: AllocationRow;
  saving: boolean;
  onSave: (raw: string) => void;
}) {
  const [value, setValue] = useState<string>(
    row.monthly_cap !== null ? String(row.monthly_cap) : ""
  );

  const capHit = row.monthly_cap !== null && row.monthly_cap_used >= row.monthly_cap;

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-text-primary truncate">
            {row.brand_name || row.name}
          </span>
          {capHit && (
            <Badge variant="warning" className="shrink-0 text-[10px]">
              cap reached
            </Badge>
          )}
        </div>
      </td>
      <td className="py-3 pr-4 text-right font-mono tabular-nums text-text-primary">
        {row.monthly_cap_used}
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2 justify-end">
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              const normalised =
                value.trim() === "" ? "" : String(Math.max(0, Number(value) || 0));
              setValue(normalised);
              const current =
                row.monthly_cap !== null ? String(row.monthly_cap) : "";
              if (normalised !== current) onSave(normalised);
            }}
            placeholder="uncapped"
            className="w-28 rounded-md border border-border bg-surface px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-emerald"
          />
        </div>
      </td>
      <td className="py-3 pr-4 text-center">
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin text-text-muted inline" />
        ) : (
          <Check className="h-4 w-4 text-text-muted/30 inline" />
        )}
      </td>
    </tr>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "danger";
}) {
  const colour =
    tone === "emerald"
      ? "text-emerald-dark"
      : tone === "danger"
        ? "text-danger"
        : "text-text-primary";
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
        {label}
      </p>
      <p className={`mt-1 font-mono tabular-nums text-2xl md:text-3xl font-medium leading-none ${colour}`}>
        {value}
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="max-w-xl flex items-start gap-3 border border-danger/40 bg-danger/5 rounded-lg p-4 text-sm">
      <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
      <p className="text-text-primary">{message}</p>
    </div>
  );
}
