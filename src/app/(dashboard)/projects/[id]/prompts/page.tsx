"use client";

import { useState, useEffect, useCallback } from "react";
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

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

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
    }
  };

  const deletePrompt = async (id: string) => {
    const res = await fetch(
      `/api/projects/${projectId}/prompts?promptId=${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setPrompts((prev) => prev.filter((p) => p.id !== id));
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
    }
  };

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    setAddedSuggestions(new Set());

    try {
      const res = await fetch("/api/prompts/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions);
      } else {
        setSuggestions(getFallbackSuggestions());
      }
    } catch {
      setSuggestions(getFallbackSuggestions());
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const [justSaved, setJustSaved] = useState(false);
  const [promptCount, setPromptCount] = useState<number | null>(null);

  useEffect(() => {
    if (promptCount !== null && prompts.length !== promptCount) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(t);
    }
    setPromptCount(prompts.length);
  }, [prompts.length, promptCount]);

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

      {/* ── Inline hint (no banner) ── replaces the blue "Quick start" box */}
      {prompts.length === 0 && !loading && (
        <p className="mt-6 text-sm text-text-secondary max-w-2xl">
          Type your own below or tap{" "}
          <span className="text-text-primary font-medium">
            Generate suggestions
          </span>{" "}
          to get AI-recommended prompts. Aim for at least 5 for meaningful
          tracking.
        </p>
      )}
      {prompts.length > 0 && prompts.length < 5 && (
        <p className="mt-6 text-sm text-warning max-w-2xl">
          You have {prompts.length} prompt
          {prompts.length === 1 ? "" : "s"} - add at least{" "}
          {5 - prompts.length} more for meaningful results across the customer
          journey.
        </p>
      )}

      {/* ── Add a prompt ── flat form, no card wrapper */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-12 border-b border-border">
        <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2 flex items-center gap-2">
          <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
          Add a prompt
        </p>
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
            <Button onClick={addPrompt} disabled={!newPromptText.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </section>

      {/* ── AI suggestions ── flattened */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-12 border-b border-border">
        <div className="col-span-12 md:col-span-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            AI suggestions
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Claude analyses your brand and suggests prompts your customers are
            likely to ask.
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl">
          <Button
            onClick={fetchSuggestions}
            variant="outline"
            disabled={loadingSuggestions}
          >
            {loadingSuggestions ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {suggestions.length > 0 ? "Regenerate" : "Generate suggestions"}
          </Button>

          {loadingSuggestions && (
            <div className="pt-8">
              <LoadingPhrases type="suggesting" />
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
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">
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

function getFallbackSuggestions(): SuggestedPrompt[] {
  return [
    { text: "Who are the top corporate law firms in Dublin?", category: "awareness" },
    { text: "Best Irish law firm for tech startups?", category: "consideration" },
    { text: "What law firm should I use for GDPR compliance in Ireland?", category: "consideration" },
    { text: "Compare Irish commercial law firms for SMEs", category: "decision" },
    { text: "Which Dublin solicitor is best for employment disputes?", category: "decision" },
    { text: "Recommended law firms for Irish property transactions", category: "awareness" },
    { text: "Who handles the most M&A deals in Ireland?", category: "awareness" },
    { text: "Best value law firm in Ireland for startups", category: "decision" },
    { text: "Irish law firms with experience in fintech regulation", category: "consideration" },
    { text: "What solicitors do Dublin tech companies use?", category: "consideration" },
  ];
}
