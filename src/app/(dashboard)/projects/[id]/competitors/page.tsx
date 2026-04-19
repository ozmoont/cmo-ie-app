"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Competitor } from "@/lib/types";
import {
  Plus,
  Trash2,
  Globe,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Save,
} from "lucide-react";

export default function CompetitorsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const fetchCompetitors = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/competitors`);
    if (res.ok) {
      const data = await res.json();
      setCompetitors(data);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  const addCompetitor = async () => {
    if (!newName.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/competitors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        website_url: newUrl.trim() || null,
      }),
    });
    if (res.ok) {
      const comp = await res.json();
      setCompetitors((prev) => [...prev, comp]);
      setNewName("");
      setNewUrl("");
    }
  };

  const deleteCompetitor = async (id: string) => {
    const res = await fetch(
      `/api/projects/${projectId}/competitors?competitorId=${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setCompetitors((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const [justSaved, setJustSaved] = useState(false);
  const [compCount, setCompCount] = useState<number | null>(null);
  useEffect(() => {
    if (compCount !== null && competitors.length !== compCount) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(t);
    }
    setCompCount(competitors.length);
  }, [competitors.length, compCount]);

  return (
    <DashboardShell
      orgName="CMO.ie"
      plan="pro"
      projectId={projectId}
      projectName="Project"
    >
      {/* ── Page header ── */}
      <header className="grid grid-cols-12 gap-6 items-end pb-10 md:pb-14 border-b border-border">
        <div className="col-span-12 md:col-span-9">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Competitors
            <span
              aria-live="polite"
              className={cn(
                "inline-flex items-center gap-1 text-text-muted normal-case tracking-normal font-normal transition-opacity duration-300",
                justSaved ? "opacity-100" : "opacity-0"
              )}
            >
              <Save className="h-3 w-3" />
              Saved
            </span>
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
            Track who else AI talks about.
          </h1>
          <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
            Add your main competitors so we can monitor when they appear in
            AI responses alongside - or instead of - your brand.
          </p>
        </div>
      </header>

      {/* ── Inline hint ── */}
      {competitors.length === 0 && !loading && (
        <p className="mt-6 text-sm text-text-secondary max-w-2xl">
          Add 3-5 of your main competitors. Include their website URL where
          you can - it helps us match mentions more accurately when AI
          models reference them by domain.
        </p>
      )}
      {competitors.length > 0 && competitors.length < 3 && (
        <p className="mt-6 text-sm text-warning max-w-2xl">
          You have {competitors.length} competitor
          {competitors.length === 1 ? "" : "s"} - adding{" "}
          {3 - competitors.length} more gives you a better competitive
          picture.
        </p>
      )}

      {/* ── Add competitor ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-12 border-b border-border">
        <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2 flex items-center gap-2">
          <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
          Add
        </p>
        <div className="col-span-12 md:col-span-9 max-w-3xl space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && addCompetitor()}
            />
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://acmecorp.ie (optional)"
              className="flex-1"
            />
            <Button onClick={addCompetitor} disabled={!newName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <p className="text-xs text-text-secondary">
            A website URL lets us match mentions more accurately when AI
            models reference competitors by domain rather than name.
          </p>
        </div>
      </section>

      {/* ── Tracked list ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-12">
        <div className="col-span-12 md:col-span-3 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Tracked · {competitors.length}
          </p>
          {competitors.length > 0 && (
            <p className="text-xs text-text-muted leading-relaxed">
              Monitoring starts on the next daily scan.
            </p>
          )}
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          ) : competitors.length === 0 ? (
            <p className="text-sm text-text-secondary py-8 max-w-md">
              No competitors tracked yet. Add the businesses you compete with
              above - we&apos;ll monitor when AI models recommend them
              instead of (or alongside) your brand.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border stagger-children">
              {competitors.map((comp) => (
                <li
                  key={comp.id}
                  className="flex items-center justify-between gap-4 py-4 group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-hover text-text-secondary font-mono text-sm font-semibold shrink-0"
                    >
                      {comp.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {comp.name}
                      </p>
                      {comp.website_url ? (
                        <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5 truncate">
                          <Globe className="h-3 w-3 shrink-0" />
                          <span className="truncate">{comp.website_url}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-text-muted italic mt-0.5">
                          Matched by name only
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:inline text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold group-hover:opacity-0 transition-opacity duration-150">
                      Tracking
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteCompetitor(comp.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out text-text-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Nav row ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 pt-10 md:pt-12 border-t border-border">
        <div className="col-span-12 md:col-span-3">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Next
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl flex items-center justify-between gap-4">
          <Link href={`/projects/${projectId}/prompts`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back: prompts
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/actions`}>
            <Button>
              Next: actions
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </section>
    </DashboardShell>
  );
}
