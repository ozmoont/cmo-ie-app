"use client";

/**
 * Client-side sortable engagement table. Pulls /api/admin/engagement
 * once on mount, lets the admin sort by any column, and renders a
 * traffic-light view on visibility delta + scan count for fast
 * triage.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

interface OrgEntry {
  id: string;
  name: string;
  slug: string;
  plan: string;
  owner_email: string | null;
  project_count: number;
  scan_count_30d: number;
  audit_count_30d: number;
  playbook_count_30d: number;
  last_scan_at: string | null;
  next_scan_at: string | null;
  next_scan_relative: string | null;
  visibility_today: number;
  visibility_delta_7d: number;
  trial_ends_at: string | null;
  created_at: string;
}

interface Payload {
  orgs: OrgEntry[];
  total: number;
  generated_at: string;
}

type SortKey =
  | "name"
  | "plan"
  | "scan_count_30d"
  | "visibility_today"
  | "visibility_delta_7d"
  | "last_scan_at"
  | "audit_count_30d"
  | "playbook_count_30d";

export function EngagementTable() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("visibility_delta_7d");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/engagement");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : `HTTP ${res.status}`
          );
        }
        if (!cancelled) setData((await res.json()) as Payload);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    if (!data) return [];
    const rows = [...data.orgs];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = typeof av === "string" ? av.toLowerCase() : (av ?? 0);
      const bn = typeof bv === "string" ? bv.toLowerCase() : (bv ?? 0);
      if (an < bn) return sortDir === "asc" ? -1 : 1;
      if (an > bn) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex items-center gap-2 text-sm text-text-muted justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading engagement…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="border-l-2 border-danger pl-4 py-3 max-w-2xl mt-8">
        <p className="text-xs uppercase tracking-[0.15em] text-danger font-semibold flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" /> Failed to load engagement
        </p>
        <p className="mt-2 text-sm text-text-primary leading-relaxed">
          {error ?? "No data"}
        </p>
      </div>
    );
  }

  return (
    <section className="mt-10 overflow-x-auto">
      <table className="w-full text-sm border-y border-border">
        <thead>
          <tr className="text-xs uppercase tracking-[0.1em] text-text-muted">
            <Th onClick={() => onSort("name")} sort={dirFor("name")}>
              Org
            </Th>
            <Th onClick={() => onSort("plan")} sort={dirFor("plan")}>
              Plan
            </Th>
            <Th
              onClick={() => onSort("scan_count_30d")}
              sort={dirFor("scan_count_30d")}
              align="right"
            >
              Scans 30d
            </Th>
            <Th
              onClick={() => onSort("visibility_today")}
              sort={dirFor("visibility_today")}
              align="right"
            >
              Vis %
            </Th>
            <Th
              onClick={() => onSort("visibility_delta_7d")}
              sort={dirFor("visibility_delta_7d")}
              align="right"
            >
              Δ 7d
            </Th>
            <Th
              onClick={() => onSort("last_scan_at")}
              sort={dirFor("last_scan_at")}
            >
              Last scan
            </Th>
            <th className="text-left font-medium py-2 px-2">Next</th>
            <Th
              onClick={() => onSort("audit_count_30d")}
              sort={dirFor("audit_count_30d")}
              align="right"
            >
              Audits
            </Th>
            <Th
              onClick={() => onSort("playbook_count_30d")}
              sort={dirFor("playbook_count_30d")}
              align="right"
            >
              Playbooks
            </Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((org) => (
            <tr
              key={org.id}
              className="border-t border-border hover:bg-surface-muted/30"
            >
              <td className="py-3 px-2 align-top">
                <Link
                  href={`/admin/orgs?q=${encodeURIComponent(org.slug)}`}
                  className="text-text-primary font-medium hover:text-emerald-dark"
                >
                  {org.name}
                </Link>
                {org.owner_email && (
                  <p className="text-xs text-text-muted truncate">
                    {org.owner_email}
                  </p>
                )}
              </td>
              <td className="py-3 px-2 align-top">
                <span className="inline-block px-1.5 py-0.5 rounded bg-text-muted/10 text-text-muted text-[10px] uppercase tracking-wider font-mono">
                  {org.plan}
                </span>
              </td>
              <td className="py-3 px-2 align-top text-right tabular-nums font-mono">
                {org.scan_count_30d}
              </td>
              <td className="py-3 px-2 align-top text-right tabular-nums font-mono">
                {org.visibility_today}%
              </td>
              <td className="py-3 px-2 align-top text-right tabular-nums font-mono">
                <DeltaPill value={org.visibility_delta_7d} />
              </td>
              <td className="py-3 px-2 align-top text-text-muted text-xs">
                {org.last_scan_at
                  ? new Date(org.last_scan_at).toLocaleDateString("en-IE", {
                      day: "numeric",
                      month: "short",
                    })
                  : "—"}
              </td>
              <td className="py-3 px-2 align-top text-text-muted text-xs">
                {org.next_scan_relative ?? "—"}
              </td>
              <td className="py-3 px-2 align-top text-right tabular-nums font-mono">
                {org.audit_count_30d}
              </td>
              <td className="py-3 px-2 align-top text-right tabular-nums font-mono">
                {org.playbook_count_30d}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="text-sm text-text-muted py-12 text-center">
          No customer orgs yet.
        </p>
      )}
      <p className="mt-4 text-xs text-text-muted">
        {data.total} orgs · refreshed{" "}
        {new Date(data.generated_at).toLocaleString("en-IE")}
      </p>
    </section>
  );

  function dirFor(key: SortKey): "asc" | "desc" | null {
    return sortKey === key ? sortDir : null;
  }
}

function Th({
  children,
  onClick,
  sort,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  sort: "asc" | "desc" | null;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      className={`font-medium py-2 px-2 cursor-pointer select-none ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <span className="inline-flex items-center gap-1 hover:text-text-primary">
        {children}
        {sort === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : sort === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

function DeltaPill({ value }: { value: number }) {
  if (value === 0) return <span className="text-text-muted">flat</span>;
  if (value > 0) {
    return (
      <span className="text-emerald-dark">+{value}</span>
    );
  }
  return (
    <span className={value <= -10 ? "text-danger" : "text-warning"}>
      {value}
    </span>
  );
}
