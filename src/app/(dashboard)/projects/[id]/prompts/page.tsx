"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS } from "@/lib/types";
import type { Prompt, PromptCategory } from "@/lib/types";
import { LoadingPhrases } from "@/components/ui/loading-phrases";
import {
  Plus,
  Trash2,
  Sparkles,
  MessageSquare,
  Loader2,
  Check,
  ArrowRight,
  Save,
  AlertTriangle,
  Layers,
  Search,
} from "lucide-react";

interface SuggestedPrompt {
  text: string;
  category: PromptCategory;
}

/**
 * Phase 6 batch flow state.
 *
 * The batch runs three model calls back-to-back (generate → score →
 * mirror); each transition is observable so the UI can show a
 * step-by-step progress label instead of a single opaque spinner. We
 * keep `count` populated as soon as generate returns so the user sees
 * "Scoring 40 prompts…" rather than a generic phrase.
 */
type BatchState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "scoring"; count: number }
  | { kind: "mirroring"; count: number }
  | { kind: "done"; count: number }
  | { kind: "error"; message: string };

export default function PromptsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPromptText, setNewPromptText] = useState("");
  const [newPromptCategory, setNewPromptCategory] =
    useState<PromptCategory>("awareness");
  const [suggestions, setSuggestions] = useState<SuggestedPrompt[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [addedSuggestions, setAddedSuggestions] = useState<Set<string>>(
    new Set()
  );
  // Phase 6 — AdWords-style batch coverage flow.
  const [batchState, setBatchState] = useState<BatchState>({ kind: "idle" });

  const fetchPrompts = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/prompts`);
    if (res.ok) {
      const data = await res.json();
      setPrompts(data);
    }
    setLoading(false);
  }, [projectId]);

  // Load prompts on mount. setState runs after await, not synchronously.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPrompts();
  }, [fetchPrompts]);

  // "Saved" pulse — fired imperatively from each mutation. Avoids the
  // effect-tracking-list-length pattern that triggers cascading-render
  // warnings and makes the trigger explicit.
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

  const addPrompt = async () => {
    if (!newPromptText.trim()) return;

    const res = await fetch(`/api/projects/${projectId}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: newPromptText.trim(),
        category: newPromptCategory,
      }),
    });

    if (res.ok) {
      const newPrompt = await res.json();
      setPrompts((prev) => [newPrompt, ...prev]);
      setNewPromptText("");
      triggerSaved();
    }
  };

  const deletePrompt = async (id: string) => {
    const res = await fetch(
      `/api/projects/${projectId}/prompts?promptId=${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setPrompts((prev) => prev.filter((p) => p.id !== id));
      triggerSaved();
    }
  };

  const addSuggestion = async (suggestion: SuggestedPrompt) => {
    const res = await fetch(`/api/projects/${projectId}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: suggestion.text,
        category: suggestion.category,
      }),
    });

    if (res.ok) {
      const newPrompt = await res.json();
      setPrompts((prev) => [newPrompt, ...prev]);
      setAddedSuggestions((prev) => new Set(prev).add(suggestion.text));
      triggerSaved();
    }
  };

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    setSuggestionError(null);
    setAddedSuggestions(new Set());

    try {
      const res = await fetch("/api/prompts/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Surface the real error rather than swapping in a silent
        // fallback list. The fallback led users to think Claude was
        // recommending law-firm prompts for unrelated brands.
        const msg =
          typeof data?.error === "string"
            ? data.error
            : `Suggestion request failed (HTTP ${res.status})`;
        setSuggestions([]);
        setSuggestionError(msg);
        return;
      }

      if (!Array.isArray(data.suggestions)) {
        setSuggestions([]);
        setSuggestionError(
          "Claude returned an unexpected response. Check the brand profile and try again."
        );
        return;
      }

      setSuggestions(data.suggestions);
    } catch (err) {
      setSuggestions([]);
      setSuggestionError(
        err instanceof Error
          ? err.message
          : "Network error fetching suggestions. Try again."
      );
    } finally {
      setLoadingSuggestions(false);
    }
  };

  /**
   * Phase 6 — kick off a full AdWords-style batch.
   *
   * Three sequential model calls, each driving the active-prompts list
   * forward in stages so the user sees the new prompts arrive before
   * scoring + mirroring complete. Failures at score/mirror are
   * non-fatal — the prompts already exist as rows; the user can
   * re-run the missing stage later from a per-prompt action.
   */
  const runFullBatch = async () => {
    setBatchState({ kind: "generating" });

    // ── Stage 1: generate ─────────────────────────────────
    let generated;
    try {
      const res = await fetch("/api/prompts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBatchState({
          kind: "error",
          message:
            typeof data?.error === "string"
              ? data.error
              : `Generation failed (HTTP ${res.status})`,
        });
        return;
      }
      generated = data;
      // Show the new prompts immediately. Score/mirror will then
      // backfill the metadata in subsequent stages.
      if (Array.isArray(data.prompts) && data.prompts.length > 0) {
        setPrompts((prev) => [...data.prompts, ...prev]);
      }
    } catch (err) {
      setBatchState({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Network error during prompt generation.",
      });
      return;
    }

    const count: number = generated?.count ?? 0;
    if (count === 0) {
      setBatchState({
        kind: "error",
        message:
          "Generation returned zero prompts. Check the brand profile and try again.",
      });
      return;
    }

    const newPromptIds: string[] = (generated.prompts ?? []).map(
      (p: Prompt) => p.id
    );

    // ── Stage 2: score ────────────────────────────────────
    setBatchState({ kind: "scoring", count });
    try {
      const res = await fetch("/api/prompts/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, promptIds: newPromptIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.prompts)) {
        // Merge updated rows into the active list. Don't blat anything
        // outside the new batch — other prompts keep whatever they had.
        const updates = new Map<string, Prompt>(
          data.prompts.map((p: Prompt) => [p.id, p])
        );
        setPrompts((prev) =>
          prev.map((p) => updates.get(p.id) ?? p)
        );
      }
      // We deliberately do NOT bail on a score failure — the prompts
      // still exist, scoring is informational, and mirror can still run.
    } catch (err) {
      console.warn("Score stage failed (non-fatal):", err);
    }

    // ── Stage 3: mirror ───────────────────────────────────
    setBatchState({ kind: "mirroring", count });
    try {
      const res = await fetch("/api/prompts/mirror", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, promptIds: newPromptIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.prompts)) {
        const updates = new Map<string, Prompt>(
          data.prompts.map((p: Prompt) => [p.id, p])
        );
        setPrompts((prev) =>
          prev.map((p) => updates.get(p.id) ?? p)
        );
      }
    } catch (err) {
      console.warn("Mirror stage failed (non-fatal):", err);
    }

    setBatchState({ kind: "done", count });
    triggerSaved();
    // Auto-clear the "done" banner after a few seconds so the section
    // doesn't carry stale state forever.
    setTimeout(() => {
      setBatchState((s) => (s.kind === "done" ? { kind: "idle" } : s));
    }, 4000);
  };

  const categoryOptions: PromptCategory[] = [
    "awareness",
    "consideration",
    "decision",
  ];

  return (
    <DashboardShell
      orgName="CMO.ie"
      plan="pro"
      projectId={projectId}
      projectName="Project"
    >
      {/* ── Page header ── editorial kicker + title + description + saved pulse */}
      <header className="grid grid-cols-12 gap-6 items-end pb-10 md:pb-14 border-b border-border">
        <div className="col-span-12 md:col-span-9">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Prompts
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
            Define the questions worth tracking.
          </h1>
          <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
            Add the prompts your customers are likely to ask AI. We run each
            one daily across your selected models and track where your brand
            appears.
          </p>
        </div>
      </header>

      {/* Brand profile editing moved to its own /projects/[id]/brand
          tab so it's discoverable from the project nav rather than
          buried under Prompts. The Brand tab calls fetchSuggestions
          via its own onSaved callback when relevant; no need to wire
          it from here. */}

      {prompts.length > 0 && prompts.length < 5 && (
        <p className="mb-6 text-sm text-warning max-w-2xl">
          You have {prompts.length} prompt
          {prompts.length === 1 ? "" : "s"} - add at least{" "}
          {5 - prompts.length} more for meaningful results across the customer
          journey.
        </p>
      )}

      {/* ── AI suggestions — primary path to adding prompts ── */}
      {/* Positioned first because most users don't know what to add manually. */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-12 border-b border-border">
        <div className="col-span-12 md:col-span-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Suggested prompts
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Customer-phrased questions Claude thinks your audience is likely to
            ask, scoped strictly to your market segment. Start here — most
            prompts on your tracker will come from this list.
          </p>
          <p className="text-xs text-text-muted leading-relaxed">
            If the segment looks wrong, fix the brand profile above and
            regenerate.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl">
          {suggestions.length === 0 && !loadingSuggestions && (
            <p className="mb-4 text-sm text-text-secondary">
              No suggestions yet. Click below — we&apos;ll generate about 10,
              you pick the ones worth tracking.
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <Button
              onClick={fetchSuggestions}
              variant={suggestions.length > 0 ? "outline" : "default"}
              disabled={loadingSuggestions || batchState.kind !== "idle"}
            >
              {loadingSuggestions ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {suggestions.length > 0
                ? "Regenerate suggestions"
                : "Generate suggestions"}
            </Button>
            {/* Phase 6 — AdWords-style coverage. Sits next to the
                single-shot suggester so the user can pick the lighter
                or fuller path. We disable both buttons while either
                flow is in flight to avoid concurrent Anthropic calls
                hammering the same brand profile. */}
            <Button
              onClick={runFullBatch}
              variant="outline"
              disabled={loadingSuggestions || batchState.kind !== "idle"}
              title="Generate 30-50 prompts, then score importance + mirror to Google queries"
            >
              {batchState.kind !== "idle" && batchState.kind !== "done" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Layers className="h-4 w-4 mr-2" />
              )}
              Generate full set
            </Button>
          </div>

          {/* Phase 6 — batch progress strip. Sits below the buttons so
              the user sees stage-by-stage progress (generate → score →
              mirror) without losing the buttons themselves. */}
          {batchState.kind !== "idle" && (
            <div
              className={`mt-5 rounded-md border p-3 text-sm ${
                batchState.kind === "error"
                  ? "border-danger/30 bg-danger/5 text-danger"
                  : batchState.kind === "done"
                    ? "border-emerald-dark/30 bg-emerald-dark/5 text-emerald-dark"
                    : "border-emerald-dark/30 bg-emerald-dark/5 text-text-primary"
              }`}
            >
              {batchState.kind === "generating" && (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating prompts… (~20s)
                </span>
              )}
              {batchState.kind === "scoring" && (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scoring importance for {batchState.count} new prompts…
                </span>
              )}
              {batchState.kind === "mirroring" && (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mirroring to Google queries for {batchState.count}
                  &nbsp;prompts…
                </span>
              )}
              {batchState.kind === "done" && (
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Added {batchState.count} prompts with importance + Google
                  mirror.
                </span>
              )}
              {batchState.kind === "error" && (
                <span className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{batchState.message}</span>
                </span>
              )}
            </div>
          )}

          {loadingSuggestions && (
            <div className="pt-8">
              <LoadingPhrases type="suggesting" />
            </div>
          )}

          {!loadingSuggestions && suggestionError && (
            <div className="mt-6 border-l-2 border-danger pl-4 py-3 max-w-2xl">
              <p className="text-xs uppercase tracking-[0.15em] text-danger font-semibold flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Suggestion generation failed
              </p>
              <p className="mt-2 text-sm text-text-primary leading-relaxed">
                {suggestionError}
              </p>
              <p className="mt-2 text-xs text-text-secondary leading-relaxed">
                Most common cause: the brand profile above is empty or wrong.
                Fill it in manually (or hit <span className="font-semibold">Re-extract</span> on the profile card) and try again.
                If the error persists, check the server terminal for the underlying cause.
              </p>
            </div>
          )}

          {!loadingSuggestions && suggestions.length > 0 && (
            <ul className="mt-6 divide-y divide-border border-y border-border stagger-children">
              {suggestions.map((suggestion, i) => {
                const isAdded = addedSuggestions.has(suggestion.text);
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-4 py-3.5"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <MessageSquare className="h-4 w-4 text-text-muted shrink-0" />
                      <p className="text-sm text-text-primary truncate">
                        {suggestion.text}
                      </p>
                      <Badge
                        variant={suggestion.category}
                        className="shrink-0"
                      >
                        {suggestion.category}
                      </Badge>
                    </div>
                    <Button
                      variant={isAdded ? "ghost" : "outline"}
                      size="sm"
                      onClick={() => addSuggestion(suggestion)}
                      disabled={isAdded}
                      className="shrink-0"
                    >
                      {isAdded ? (
                        <>
                          <Check className="h-3 w-3 mr-1" /> Added
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ── Manual entry — secondary path ── */}
      {/* De-emphasised compared to suggestions: most users don't know what to add, so suggestions are the default workflow. */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-12 border-b border-border">
        <div className="col-span-12 md:col-span-3 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Add your own
          </p>
          <p className="text-xs text-text-muted leading-relaxed">
            Suggestions miss your specific question? Write your own below.
            Rule of thumb: phrase it the way a customer who doesn&apos;t know
            you yet would Google-or-AI it.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                value={newPromptText}
                onChange={(e) => setNewPromptText(e.target.value)}
                placeholder="e.g. What are the best law firms in Ireland for startups?"
                onKeyDown={(e) => e.key === "Enter" && addPrompt()}
              />
            </div>
            <select
              value={newPromptCategory}
              onChange={(e) =>
                setNewPromptCategory(e.target.value as PromptCategory)
              }
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
            >
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
            <Button onClick={addPrompt} disabled={!newPromptText.trim()} variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </section>

      {/* ── Active prompts ── editorial list */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-12">
        <div className="col-span-12 md:col-span-3 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Active · {prompts.length}
          </p>
          <p className="text-xs font-mono text-text-muted">
            {prompts.length}/50 on your plan
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          ) : prompts.length === 0 ? (
            <p className="text-sm text-text-secondary py-8 max-w-md">
              No prompts yet. Add one above or use AI suggestions.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border stagger-children">
              {prompts.map((prompt) => (
                <li
                  key={prompt.id}
                  className="flex items-start justify-between gap-4 py-3.5 group"
                >
                  <Link
                    href={`/projects/${projectId}/prompts/${prompt.id}`}
                    className="flex flex-col gap-1.5 flex-1 min-w-0 hover:text-emerald-dark transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <p className="text-sm text-text-primary truncate group-hover:underline">
                        {prompt.text}
                      </p>
                      <Badge
                        variant={prompt.category as PromptCategory}
                        className="shrink-0"
                      >
                        {CATEGORY_LABELS[prompt.category as PromptCategory] ??
                          prompt.category}
                      </Badge>
                    </div>
                    {/* Phase 6 — AdWords-style metadata strip. Renders
                        only when at least one of importance / mirror
                        is present; legacy prompts stay clean.
                        Importance is a 5-dot rating; mirror is a
                        monospace search-style fragment. */}
                    {(prompt.importance_score ||
                      prompt.google_query_mirror) && (
                      <div className="flex items-center gap-3 text-xs text-text-muted">
                        {prompt.importance_score ? (
                          <span
                            className="inline-flex items-center gap-1.5"
                            title={
                              prompt.importance_rationale
                                ? `Importance ${prompt.importance_score}/5 — ${prompt.importance_rationale}`
                                : `Importance ${prompt.importance_score}/5`
                            }
                          >
                            <ImportanceDots
                              score={prompt.importance_score}
                            />
                            <span className="text-[11px] font-mono">
                              {prompt.importance_score}/5
                            </span>
                          </span>
                        ) : null}
                        {prompt.google_query_mirror ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-text-muted truncate">
                            <Search className="h-3 w-3 shrink-0" />
                            {prompt.google_query_mirror}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deletePrompt(prompt.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out text-text-muted hover:text-danger shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Next step ── inline row, no bordered box */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 pt-10 md:pt-12 border-t border-border">
        <div className="col-span-12 md:col-span-3">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Next
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">
              {prompts.length >= 5
                ? "Looking good. Ready to set up competitor tracking."
                : prompts.length > 0
                  ? `${prompts.length} prompt${prompts.length === 1 ? "" : "s"} added. You can add more anytime.`
                  : "Add prompts above, then continue to competitors."}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              All changes save automatically - come back anytime.
            </p>
          </div>
          <Link href={`/projects/${projectId}/competitors`} className="shrink-0">
            <Button disabled={prompts.length === 0}>
              Next: competitors
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </section>
    </DashboardShell>
  );
}

/**
 * Phase 6 — five-dot importance rating. Filled dots = score, empty
 * dots = remainder. Kept tiny so it reads as metadata, not a CTA.
 */
function ImportanceDots({ score }: { score: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(score)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            i <= filled ? "bg-emerald-dark" : "bg-text-muted/30"
          }`}
        />
      ))}
    </span>
  );
}
