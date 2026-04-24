"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Sparkles,
  Check,
  X,
} from "lucide-react";

interface SuggestedBrand {
  id: string;
  brand_name: string;
  mention_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

export default function CompetitorsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  // Auto-detected suggestions from recent runs. Independent fetch so a
  // slow suggestion query can't block the core tracked-list render.
  const [suggestions, setSuggestions] = useState<SuggestedBrand[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const fetchCompetitors = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/competitors`);
    if (res.ok) {
      const data = await res.json();
      setCompetitors(data);
    }
    setLoading(false);
  }, [projectId]);

  const fetchSuggestions = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/competitors/suggestions`
    );
    if (res.ok) {
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    }
  }, [projectId]);

  // Load competitors on mount. setState happens after await, not
  // synchronously in the effect body.
  useEffect(() => {
    fetchCompetitors();
    fetchSuggestions();
  }, [fetchCompetitors, fetchSuggestions]);

  // "Saved" pulse — fired imperatively after each successful mutation
  // rather than via an effect tracking list length, which avoids the
  // cascading-render warning and makes the trigger explicit.
  const [justSaved, setJustSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerSaved = useCallback(() => {
    setJustSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setJustSaved(false), 2000);
  }, []);
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

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
      triggerSaved();
    }
  };

  const deleteCompetitor = async (id: string) => {
    const res = await fetch(
      `/api/projects/${projectId}/competitors?competitorId=${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setCompetitors((prev) => prev.filter((c) => c.id !== id));
      triggerSaved();
    }
  };

  // Suggestion actions — track promotes to a real competitor row,
  // reject burns the suggestion so the run engine doesn't re-surface
  // it. Optimistic UI: remove the row from state immediately; on
  // server error, refetch to restore truth.
  const actOnSuggestion = async (
    suggestionId: string,
    action: "track" | "reject"
  ) => {
    setActingOn(suggestionId);
    // Optimistic remove
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    try {
      const res = await fetch(
        `/api/projects/${projectId}/competitors/suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suggestionId, action }),
        }
      );
      if (!res.ok) {
        // Restore the list from server state — our optimistic remove
        // was wrong. Caller sees a brief flicker which is fine at
        // this low frequency.
        await fetchSuggestions();
        return;
      }
      if (action === "track") {
        const data = (await res.json()) as { competitor?: Competitor };
        if (data.competitor) {
          setCompetitors((prev) => [...prev, data.competitor as Competitor]);
          triggerSaved();
        }
      }
    } finally {
      setActingOn(null);
    }
  };

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

      {/* ── Suggested by AI ──
          Appears only when the run engine has observed unknown brands
          in AI responses at least SUGGESTION_THRESHOLD (2) times.
          Quietly absent on brand-new projects. */}
      {suggestions.length > 0 && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-12 border-b border-border">
          <div className="col-span-12 md:col-span-3 space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-[2px] bg-emerald-dark"
              />
              <Sparkles className="h-3 w-3" />
              Suggested · {suggestions.length}
            </p>
            <p className="text-xs text-text-muted leading-relaxed">
              Brands AI models mentioned alongside yours. Track the ones
              you actually compete with.
            </p>
          </div>
          <div className="col-span-12 md:col-span-9 max-w-3xl">
            <ul className="divide-y divide-border border-y border-border">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {s.brand_name}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Mentioned {s.mention_count}{" "}
                      {s.mention_count === 1 ? "time" : "times"} across recent
                      runs
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => actOnSuggestion(s.id, "track")}
                      disabled={actingOn === s.id}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Track
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => actOnSuggestion(s.id, "reject")}
                      disabled={actingOn === s.id}
                      className="text-text-muted hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

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
