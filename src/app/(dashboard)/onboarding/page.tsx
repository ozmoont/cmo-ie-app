"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AVAILABLE_COUNTRIES, AVAILABLE_MODELS } from "@/lib/types";
import type { AIModel, PromptCategory } from "@/lib/types";
import { listSectorTemplates } from "@/lib/irish-market";
import {
  Loader2,
  Plus,
  X,
  ArrowRight,
  ArrowLeft,
  Play,
  Check,
  Sparkles,
} from "lucide-react";

const STEPS = [
  { key: "brand", label: "Your brand" },
  { key: "models", label: "AI models" },
  { key: "prompts", label: "Prompts" },
  { key: "competitors", label: "Competitors" },
] as const;

interface PromptItem {
  text: string;
  category: PromptCategory;
}

interface CompetitorItem {
  name: string;
  website_url: string;
}

// Short descriptions for each AI model - displayed below the model name in
// the selector. Kept beside the component rather than nested inline.
const MODEL_DESCRIPTIONS: Record<string, string> = {
  chatgpt:
    "The most popular AI assistant. Over 200M weekly users ask it for recommendations.",
  perplexity:
    "AI-powered search engine that always cites sources. Growing fast with research-focused users.",
  google_aio:
    "Google's AI Overviews appear at the top of search results for millions of queries.",
  gemini:
    "Google's conversational AI. Integrated into Google Workspace and Android.",
  claude:
    "Anthropic's AI assistant. Popular with professionals and businesses.",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Step 1: Brand
  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["IE"]);

  // Step 2: Models
  const [selectedModels, setSelectedModels] = useState<AIModel[]>([
    "chatgpt",
    "perplexity",
    "google_aio",
  ]);

  // Step 3: Prompts
  // Sector picker — optional. When chosen, seeds prompts + competitors
  // from the curated sector template (still editable in later steps).
  // `null` means the user skipped / hasn't chosen. See lib/irish-market.
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const SECTOR_TEMPLATES = listSectorTemplates();

  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [suggestions, setSuggestions] = useState<PromptItem[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");

  // Step 4: Competitors
  const [competitors, setCompetitors] = useState<CompetitorItem[]>([]);
  const [newCompName, setNewCompName] = useState("");
  const [newCompUrl, setNewCompUrl] = useState("");

  // Final
  const [launching, setLaunching] = useState(false);

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleModel = (model: AIModel) => {
    setSelectedModels((prev) =>
      prev.includes(model)
        ? prev.filter((m) => m !== model)
        : [...prev, model]
    );
  };

  /**
   * Pick or unpick a sector template. Seeds prompts + competitors from
   * the template the first time a sector is chosen; swapping to another
   * sector replaces the seeded rows but leaves anything the user has
   * typed alone (dedupe by prompt text / competitor name).
   *
   * Picking null (clicking the active chip) clears the sector choice
   * but leaves already-seeded rows in place — the user can still edit.
   */
  const pickSector = (slug: string | null) => {
    if (slug === selectedSector) {
      setSelectedSector(null);
      return;
    }
    setSelectedSector(slug);
    if (!slug) return;
    const template = SECTOR_TEMPLATES.find((t) => t.slug === slug);
    if (!template) return;

    setPrompts((prev) => {
      const existingTexts = new Set(prev.map((p) => p.text.toLowerCase()));
      const seeds = template.sample_prompts
        .filter((text) => !existingTexts.has(text.toLowerCase()))
        .map(
          (text): PromptItem => ({ text, category: "consideration" })
        );
      return [...prev, ...seeds];
    });

    setCompetitors((prev) => {
      const existingNames = new Set(prev.map((c) => c.name.toLowerCase()));
      const seeds = template.sample_competitors
        .filter((c) => !existingNames.has(c.name.toLowerCase()))
        .map(
          (c): CompetitorItem => ({
            name: c.name,
            website_url: c.website ?? "",
          })
        );
      return [...prev, ...seeds];
    });
  };

  // Create project when leaving step 2
  const createProject = useCallback(async () => {
    if (projectId) return projectId;
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: brandName,
          brand_name: brandName,
          website_url: websiteUrl || null,
          country_codes: selectedCountries,
          models: selectedModels,
        }),
      });
      if (!res.ok) {
        // Surface the server's actual error text so users aren't left
        // staring at a generic "Failed to create project". Reads both
        // shapes (`{ error: string }` and raw text) defensively.
        let message = `Failed to create project (HTTP ${res.status})`;
        try {
          const body = await res.json();
          if (body?.error && typeof body.error === "string") {
            message = body.error;
          }
        } catch {
          try {
            const text = await res.text();
            if (text) message = text;
          } catch {
            // stick with the default
          }
        }
        throw new Error(message);
      }
      const project = await res.json();
      setProjectId(project.id);
      return project.id as string;
    } finally {
      setLoading(false);
    }
  }, [brandName, websiteUrl, selectedCountries, selectedModels, projectId]);

  const generateSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const res = await fetch("/api/prompts/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName, websiteUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      }
    } catch {
      // Silently fail - user can add manually
    } finally {
      setSuggestionsLoading(false);
    }
  }, [brandName, websiteUrl]);

  const addSuggestion = (s: PromptItem) => {
    if (!prompts.some((p) => p.text === s.text)) {
      setPrompts((prev) => [...prev, s]);
    }
  };

  const addManualPrompt = () => {
    if (newPrompt.trim()) {
      setPrompts((prev) => [
        ...prev,
        { text: newPrompt.trim(), category: "awareness" },
      ]);
      setNewPrompt("");
    }
  };

  const addCompetitor = () => {
    if (newCompName.trim()) {
      setCompetitors((prev) => [
        ...prev,
        { name: newCompName.trim(), website_url: newCompUrl.trim() },
      ]);
      setNewCompName("");
      setNewCompUrl("");
    }
  };

  const finishOnboarding = async () => {
    setLaunching(true);
    try {
      const pid = projectId ?? (await createProject());
      for (const p of prompts) {
        await fetch(`/api/projects/${pid}/prompts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: p.text, category: p.category }),
        });
      }
      for (const c of competitors) {
        await fetch(`/api/projects/${pid}/competitors`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: c.name,
            website_url: c.website_url || null,
          }),
        });
      }
      fetch(`/api/projects/${pid}/runs`, { method: "POST" });
      router.push(`/projects/${pid}`);
    } catch {
      setLaunching(false);
    }
  };

  const goNext = async () => {
    if (step === 1) {
      await createProject();
      generateSuggestions();
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const canProceed = () => {
    if (step === 0) return brandName.trim().length > 0;
    if (step === 1) return selectedModels.length > 0;
    if (step === 2) return prompts.length > 0;
    return true;
  };

  const currentStep = STEPS[step];
  const stepNumber = String(step + 1).padStart(2, "0");
  const totalSteps = String(STEPS.length).padStart(2, "0");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Top brand bar ── */}
      <header className="px-4 md:px-8 py-5 border-b border-border">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary tracking-tight">
            CMO.ie
          </span>
          <span className="text-xs text-text-muted">
            Set up your first project
          </span>
        </div>
      </header>

      {/* ── Progress rail ── */}
      <div className="px-4 md:px-8 py-6 border-b border-border">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-[2px] bg-emerald-dark"
              />
              Step{" "}
              <span className="font-mono tabular-nums">
                {stepNumber} of {totalSteps}
              </span>
            </p>
            <p className="text-xs text-text-muted hidden sm:block">
              {currentStep.label}
            </p>
          </div>
          {/* Segmented progress bar - one thin rule per step */}
          <div className="flex gap-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-[2px] rounded-full transition-colors duration-300 ${
                  i <= step ? "bg-emerald-dark" : "bg-border"
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Step content ── */}
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 md:px-8 py-10 md:py-16">
          {/* ── Step 0 · Brand ── */}
          {step === 0 && (
            <div className="space-y-10">
              <div className="space-y-3">
                <h2 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                  What brand are you tracking?
                </h2>
                <p className="text-base text-text-secondary leading-relaxed max-w-2xl">
                  We&apos;ll monitor how AI search engines like ChatGPT and
                  Perplexity talk about your brand. Use the name exactly as
                  customers would know it.
                </p>
              </div>

              <div className="space-y-6 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="brandName">Brand name</Label>
                  <Input
                    id="brandName"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g. Acme Legal, Stripe, Intercom"
                    autoFocus
                  />
                  <p className="text-xs text-text-muted">
                    This is what we&apos;ll look for in AI responses.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="websiteUrl">Website URL (optional)</Label>
                  <Input
                    id="websiteUrl"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://acmelegal.ie"
                    type="url"
                  />
                  <p className="text-xs text-text-muted">
                    Helps us identify when AI cites your website as a source.
                  </p>
                </div>
                <div className="space-y-3">
                  <Label>Target markets</Label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_COUNTRIES.map((country) => {
                      const selected = selectedCountries.includes(country.code);
                      return (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => toggleCountry(country.code)}
                          className={`inline-flex items-center gap-2 rounded-md border px-4 py-2.5 min-h-[44px] text-sm font-medium transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-pointer active:scale-[0.97] ${
                            selected
                              ? "border-emerald-dark bg-emerald-dark/5 text-text-primary"
                              : "border-border text-text-secondary hover:text-text-primary hover:border-border-strong"
                          }`}
                        >
                          {country.name}
                          {selected && (
                            <Check className="h-3.5 w-3.5 text-emerald-dark" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-4 flex-wrap">
                    <Label>Sector (optional)</Label>
                    <p className="text-xs text-text-muted">
                      Pick a sector to pre-fill prompts + competitors. Still
                      editable in later steps.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SECTOR_TEMPLATES.map((t) => {
                      const selected = selectedSector === t.slug;
                      return (
                        <button
                          key={t.slug}
                          type="button"
                          onClick={() => pickSector(t.slug)}
                          className={`inline-flex items-center gap-2 rounded-md border px-4 py-2.5 min-h-[44px] text-sm font-medium transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-pointer active:scale-[0.97] ${
                            selected
                              ? "border-emerald-dark bg-emerald-dark/5 text-text-primary"
                              : "border-border text-text-secondary hover:text-text-primary hover:border-border-strong"
                          }`}
                        >
                          {t.name}
                          {selected && (
                            <Check className="h-3.5 w-3.5 text-emerald-dark" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedSector && (
                    <p className="text-xs text-emerald-dark leading-relaxed">
                      <Sparkles className="inline h-3 w-3 mr-1" />
                      Seeded{" "}
                      {SECTOR_TEMPLATES.find((t) => t.slug === selectedSector)
                        ?.sample_prompts.length ?? 0}{" "}
                      prompts and{" "}
                      {SECTOR_TEMPLATES.find((t) => t.slug === selectedSector)
                        ?.sample_competitors.length ?? 0}{" "}
                      competitors. You can edit or remove any of them in
                      steps 3 and 4.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1 · Models ── */}
          {step === 1 && (
            <div className="space-y-10">
              <div className="space-y-3">
                <h2 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                  Which AI models should we monitor?
                </h2>
                <p className="text-base text-text-secondary leading-relaxed max-w-2xl">
                  Each model has different sources and biases. Monitoring a few
                  gives you the full picture of your AI visibility.
                </p>
              </div>

              <ul className="divide-y divide-border border-y border-border">
                {AVAILABLE_MODELS.map((model) => {
                  const selected = selectedModels.includes(model.value);
                  return (
                    <li key={model.value}>
                      <button
                        type="button"
                        onClick={() => toggleModel(model.value)}
                        className="w-full text-left flex items-start gap-4 py-5 group transition-[background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-surface-muted/50 -mx-4 md:-mx-6 px-4 md:px-6 cursor-pointer"
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2 mt-0.5 transition-[background-color,border-color] duration-150 ${
                            selected
                              ? "border-emerald-dark bg-emerald-dark text-text-inverse"
                              : "border-border-strong"
                          }`}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </span>
                        <div className="flex-1">
                          <p className="text-base font-semibold text-text-primary">
                            {model.label}
                          </p>
                          <p className="text-sm text-text-secondary mt-1 leading-relaxed max-w-2xl">
                            {MODEL_DESCRIPTIONS[model.value] ?? ""}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ── Step 2 · Prompts ── */}
          {step === 2 && (
            <div className="space-y-10">
              <div className="space-y-3">
                <h2 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                  What questions should we track?
                </h2>
                <p className="text-base text-text-secondary leading-relaxed max-w-2xl">
                  Prompts are the questions your customers ask AI. We check
                  each one daily to see if {brandName || "your brand"} gets
                  mentioned.
                </p>
              </div>

              {/* Manual input */}
              <div className="space-y-3 max-w-2xl">
                <Label htmlFor="newPrompt">Add a prompt</Label>
                <div className="flex gap-2">
                  <Input
                    id="newPrompt"
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder="e.g. What's the best CRM for small businesses in Ireland?"
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      (e.preventDefault(), addManualPrompt())
                    }
                  />
                  <Button
                    type="button"
                    onClick={addManualPrompt}
                    disabled={!newPrompt.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* AI suggestions */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block w-4 h-[2px] bg-emerald-dark"
                      />
                      AI suggestions
                    </p>
                    <p className="text-sm text-text-secondary mt-1">
                      Tap any to add. Regenerate for a different set.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateSuggestions}
                    disabled={suggestionsLoading}
                  >
                    {suggestionsLoading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {suggestions.length > 0 ? "Regenerate" : "Generate"}
                  </Button>
                </div>

                {suggestionsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-text-secondary py-6">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating suggestions for {brandName || "your brand"}…
                  </div>
                ) : suggestions.length > 0 ? (
                  <ul className="divide-y divide-border border-y border-border">
                    {suggestions.map((s, i) => {
                      const added = prompts.some((p) => p.text === s.text);
                      return (
                        <li key={i}>
                          <button
                            onClick={() => addSuggestion(s)}
                            disabled={added}
                            className={`w-full text-left flex items-center justify-between gap-4 py-3.5 text-sm transition-[background-color] duration-150 ease-out -mx-4 md:-mx-6 px-4 md:px-6 ${
                              added
                                ? "text-text-muted cursor-default"
                                : "text-text-primary hover:bg-surface-muted/50 cursor-pointer"
                            }`}
                          >
                            <span className="flex-1 pr-3">{s.text}</span>
                            <div className="flex items-center gap-3 shrink-0">
                              <Badge variant={s.category} className="text-[10px]">
                                {s.category}
                              </Badge>
                              {added ? (
                                <Check className="h-4 w-4 text-emerald-dark" />
                              ) : (
                                <Plus className="h-4 w-4 text-text-muted" />
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-text-secondary py-4">
                    Tap{" "}
                    <span className="text-text-primary font-medium">
                      Generate
                    </span>{" "}
                    to get AI-powered suggestions based on your brand.
                  </p>
                )}
              </div>

              {/* Selected prompts */}
              {prompts.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block w-4 h-[2px] bg-emerald-dark"
                    />
                    Your prompts · {prompts.length}
                  </p>
                  <ul className="divide-y divide-border border-y border-border">
                    {prompts.map((p, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-4 py-3 text-sm group"
                      >
                        <span className="flex-1 pr-3 text-text-primary">
                          {p.text}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant={p.category} className="text-[10px]">
                            {p.category}
                          </Badge>
                          <button
                            onClick={() =>
                              setPrompts((prev) =>
                                prev.filter((_, j) => j !== i)
                              )
                            }
                            className="text-text-muted hover:text-danger transition-colors"
                            aria-label={`Remove ${p.text}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3 · Competitors + Launch ── */}
          {step === 3 && (
            <div className="space-y-10">
              <div className="space-y-3">
                <h2 className="text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
                  Who are your competitors?
                </h2>
                <p className="text-base text-text-secondary leading-relaxed max-w-2xl">
                  We&apos;ll flag when AI models mention them instead of you -
                  so you can see the gaps they&apos;re winning. You can skip
                  this and add them later.
                </p>
              </div>

              {/* Add competitor */}
              <div className="space-y-3 max-w-2xl">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={newCompName}
                    onChange={(e) => setNewCompName(e.target.value)}
                    placeholder="Competitor name"
                    className="flex-1"
                  />
                  <Input
                    value={newCompUrl}
                    onChange={(e) => setNewCompUrl(e.target.value)}
                    placeholder="Website (optional)"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={addCompetitor}
                    disabled={!newCompName.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Competitor list */}
              {competitors.length > 0 ? (
                <ul className="divide-y divide-border border-y border-border">
                  {competitors.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-4 py-3 text-sm"
                    >
                      <div>
                        <span className="font-semibold text-text-primary">
                          {c.name}
                        </span>
                        {c.website_url && (
                          <span className="text-text-muted ml-2 text-xs">
                            {c.website_url}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          setCompetitors((prev) =>
                            prev.filter((_, j) => j !== i)
                          )
                        }
                        className="text-text-muted hover:text-danger transition-colors"
                        aria-label={`Remove ${c.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-secondary py-2">
                  No competitors added yet.
                </p>
              )}

              {/* Ready-to-launch summary - editorial, no card */}
              <div className="space-y-4 pt-6 border-t border-border">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block w-4 h-[2px] bg-emerald-dark"
                  />
                  Ready to launch
                </p>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-6 border-y border-border py-5">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
                      Brand
                    </dt>
                    <dd className="mt-1.5 text-base font-semibold text-text-primary truncate">
                      {brandName || "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
                      AI models
                    </dt>
                    <dd className="mt-1.5 font-mono tabular-nums text-base font-semibold text-text-primary">
                      {selectedModels.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
                      Prompts
                    </dt>
                    <dd className="mt-1.5 font-mono tabular-nums text-base font-semibold text-text-primary">
                      {prompts.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold">
                      Competitors
                    </dt>
                    <dd className="mt-1.5 font-mono tabular-nums text-base font-semibold text-text-primary">
                      {competitors.length}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-text-secondary">
                  Your first AI visibility scan starts immediately. Results
                  take 1-2 minutes depending on prompt count.
                </p>
              </div>
            </div>
          )}

          {/* ── Nav footer ── */}
          <div className="flex items-center justify-between pt-10 mt-10 border-t border-border">
            {step > 0 ? (
              <Button
                variant="ghost"
                onClick={() => setStep((s) => s - 1)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            ) : (
              <div />
            )}

            {step < STEPS.length - 1 ? (
              <Button
                onClick={goNext}
                disabled={!canProceed() || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={finishOnboarding}
                disabled={launching || prompts.length === 0}
                size="lg"
              >
                {launching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Launching…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1.5" />
                    Launch and scan
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
