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
import { BrandProfileCard } from "@/components/dashboard/brand-profile-card";
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
} from "lucide-react";

interface SuggestedPrompt {
  text: string;
  category: PromptCategory;
}

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

      {/* ── Brand profile — authoritative context for every suggestion ── */}
      {/* Renders first so the user can see (and correct) what Claude thinks the brand is BEFORE trusting anything else on this page. */}
      <div className="mt-8 mb-10">
        <BrandProfileCard
          projectId={projectId}
          onSaved={() => {
            // User just corrected the profile — re-run suggestions so they reflect the fix.
            fetchSuggestions();
          }}
        />
      </div>

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
          <Button
            onClick={fetchSuggestions}
            variant={suggestions.length > 0 ? "outline" : "default"}
            disabled={loadingSuggestions}
          >
            {loadingSuggestions ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {suggestions.length > 0 ? "Regenerate suggestions" : "Generate suggestions"}
          </Button>

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
                  className="flex items-center justify-between gap-4 py-3.5 group"
                >
                  <Link
                    href={`/projects/${projectId}/prompts/${prompt.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0 hover:text-emerald-dark transition-colors"
                  >
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
