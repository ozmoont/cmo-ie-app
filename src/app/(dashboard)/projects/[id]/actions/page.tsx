"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { UpgradeNudge } from "@/components/dashboard/upgrade-nudge";
import { DraftViewer } from "@/components/dashboard/draft-viewer";
import { PolishRequestForm } from "@/components/dashboard/polish-request-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Loader2,
  RefreshCw,
  X,
  AlertTriangle,
  Sparkles,
  Wand2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import type { DraftOutputType } from "@/lib/types";
import { LoadingPhrases } from "@/components/ui/loading-phrases";

interface Action {
  title: string;
  description: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  category: "content" | "technical" | "outreach" | "brand";
}

interface ActionGap {
  promptText: string;
  rootCause: string;
  actions: Action[];
}

type ActionTier = "gaps" | "strategy" | "full";

const effortColour = {
  low: "text-text-primary",
  medium: "text-warning",
  high: "text-danger",
};
const impactColour = {
  low: "text-muted",
  medium: "text-warning",
  high: "text-text-primary",
};
const categoryIcon: Record<string, string> = {
  content: "Content",
  technical: "Technical",
  outreach: "Outreach",
  brand: "Brand",
};

export default function ActionsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [actions, setActions] = useState<ActionGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [actionTier, setActionTier] = useState<ActionTier>("gaps");
  const [briefModal, setBriefModal] = useState<{
    open: boolean;
    loading: boolean;
    brief: string | null;
    actionTitle: string;
    modalMode: "brief" | "draft" | "polish";
    draft: string | null;
    draftOutputType: DraftOutputType | null;
    userEmail: string;
  }>({
    open: false,
    loading: false,
    brief: null,
    actionTitle: "",
    modalMode: "brief",
    draft: null,
    draftOutputType: null,
    userEmail: "",
  });
  const [orgName, setOrgName] = useState("");
  const [plan, setPlan] = useState("trial");

  useEffect(() => {
    async function fetchUserProfile() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          setOrgName(data.orgName || "CMO.ie");
          setPlan(data.plan || "trial");
          setBriefModal((prev) => ({
            ...prev,
            userEmail: data.email || "",
          }));
        }
      } catch (err) {
        console.error("Failed to fetch user profile:", err);
      }
    }
    fetchUserProfile();
  }, []);

  const generateActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/actions`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate actions");
      }
      setActions(data.actions ?? []);
      setActionTier(data.tier ?? "gaps");
      setGenerated(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const generateBrief = useCallback(
    async (action: Action, gap: ActionGap) => {
      setBriefModal((prev) => ({
        ...prev,
        open: true,
        loading: true,
        brief: null,
        actionTitle: action.title,
        modalMode: "brief",
        draft: null,
        draftOutputType: null,
      }));
      try {
        const res = await fetch(
          `/api/projects/${projectId}/actions/brief`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              actionTitle: action.title,
              actionDescription: action.description,
              promptText: gap.promptText,
              rootCause: gap.rootCause,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to generate brief");
        }
        setBriefModal((prev) => ({
          ...prev,
          loading: false,
          brief: data.brief,
        }));
      } catch {
        setBriefModal((prev) => ({
          ...prev,
          loading: false,
          brief: "Failed to generate brief. Please try again.",
        }));
      }
    },
    [projectId]
  );

  const generateDraft = useCallback(
    async (outputType: DraftOutputType) => {
      if (!briefModal.brief) return;
      setBriefModal((prev) => ({
        ...prev,
        loading: true,
        draft: null,
        draftOutputType: null,
      }));
      try {
        const res = await fetch(
          `/api/projects/${projectId}/actions/draft`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              brief: briefModal.brief,
              outputType,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to generate draft");
        }
        setBriefModal((prev) => ({
          ...prev,
          loading: false,
          modalMode: "draft",
          draft: data.draft,
          draftOutputType: outputType,
        }));
      } catch {
        setBriefModal((prev) => ({
          ...prev,
          loading: false,
          draft: "Failed to generate draft. Please try again.",
        }));
      }
    },
    [projectId, briefModal.brief]
  );

  return (
    <DashboardShell
      orgName={orgName}
      plan={plan}
      projectId={projectId}
      projectName=""
    >
      {/* ── Page header ── */}
      <header className="grid grid-cols-12 gap-6 items-end pb-10 md:pb-14 border-b border-border">
        <div className="col-span-12 md:col-span-8">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Action plan
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-text-primary tracking-tight leading-[1.05]">
            Here&apos;s what to do next.
          </h1>
          <p className="mt-3 text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl">
            AI-powered recommendations from three specialist teams: a Gap
            Analyst identifies root causes, a Strategist prioritises actions,
            and a Brief Writer creates execution-ready content briefs.
          </p>
        </div>
        <div className="col-span-12 md:col-span-4 md:flex md:justify-end">
          <Button onClick={generateActions} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : generated ? (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            {loading
              ? "Analysing..."
              : generated
                ? "Regenerate"
                : "Generate action plan"}
          </Button>
        </div>
      </header>

      {/* ── Error ── */}
      {error && (
        <div className="mt-6 grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-9 md:col-start-4 flex items-start gap-3 text-danger">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Generation failed.</p>
              <p className="text-sm text-text-secondary mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-16 md:py-24">
          <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Analysing
          </p>
          <div className="col-span-12 md:col-span-9 max-w-2xl">
            <LoadingPhrases type="generating" className="items-start" />
            <div className="mt-8 space-y-3 max-w-md">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-3 rounded shimmer"
                  style={{ width: `${90 - i * 15}%` }}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Empty (not yet generated) ── */}
      {!loading && !generated && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-16 md:py-24">
          <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2 flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Get started
          </p>
          <div className="col-span-12 md:col-span-9 max-w-2xl space-y-5">
            <h2 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15]">
              No action plan generated yet.
            </h2>
            <p className="text-base text-text-secondary leading-relaxed">
              Tap{" "}
              <span className="text-text-primary font-medium">
                Generate action plan
              </span>{" "}
              above to have the AI teams analyse your visibility gaps and
              produce prioritised recommendations.
            </p>
          </div>
        </section>
      )}

      {/* ── No gaps ── */}
      {!loading && generated && actions.length === 0 && (
        <section className="grid grid-cols-12 gap-6 md:gap-10 py-16 md:py-24">
          <p className="col-span-12 md:col-span-3 text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold md:pt-2 flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            All clear
          </p>
          <div className="col-span-12 md:col-span-9 max-w-2xl space-y-5">
            <h2 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight leading-[1.15]">
              No visibility gaps found.
            </h2>
            <p className="text-base text-text-secondary leading-relaxed">
              Your brand is visible across every tracked prompt. Keep
              monitoring - new gaps can open up as AI models update.
            </p>
          </div>
        </section>
      )}

      {/* ── Action list ── editorial, no cards */}
      {!loading && actions.length > 0 && (
        <section className="pt-2">
          <ol className="divide-y divide-border border-t border-border">
            {actions.map((gap, i) => (
              <li
                key={i}
                className="grid grid-cols-12 gap-6 md:gap-10 py-10 md:py-14"
              >
                {/* Left: gap kicker */}
                <div className="col-span-12 md:col-span-3 space-y-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 font-mono tabular-nums">
                    <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
                    Gap · {String(i + 1).padStart(2, "0")}
                  </p>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    <span className="text-text-muted uppercase text-[10px] tracking-[0.15em] font-semibold block mb-1">
                      Root cause
                    </span>
                    {gap.rootCause}
                  </p>
                </div>

                {/* Right: prompt + actions */}
                <div className="col-span-12 md:col-span-9 space-y-6">
                  <blockquote className="text-lg md:text-xl font-semibold text-text-primary tracking-tight leading-snug">
                    &ldquo;{gap.promptText}&rdquo;
                  </blockquote>

                  {actionTier === "gaps" ? (
                    <UpgradeNudge
                      feature="Action strategy and briefs"
                      targetPlan="pro"
                    />
                  ) : (
                    <ol className="divide-y divide-border border-y border-border">
                      {gap.actions.map((action, j) => (
                        <li
                          key={j}
                          className="grid grid-cols-[auto_1fr_auto] items-start gap-4 py-5"
                        >
                          <span
                            className="font-mono tabular-nums text-sm font-semibold text-text-muted pt-0.5"
                            aria-hidden="true"
                          >
                            {String(j + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-text-primary">
                                {action.title}
                              </p>
                              {action.category && (
                                <Badge
                                  variant="awareness"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {categoryIcon[action.category] ??
                                    action.category}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
                              {action.description}
                            </p>
                            <div className="flex gap-5 mt-3 text-xs text-text-muted uppercase tracking-[0.15em] font-semibold">
                              <span>
                                Effort{" "}
                                <span
                                  className={`ml-1 ${effortColour[action.effort] ?? "text-text-muted"}`}
                                >
                                  {action.effort}
                                </span>
                              </span>
                              <span>
                                Impact{" "}
                                <span
                                  className={`ml-1 ${impactColour[action.impact] ?? "text-text-muted"}`}
                                >
                                  {action.impact}
                                </span>
                              </span>
                            </div>
                          </div>
                          {actionTier === "full" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="shrink-0"
                              onClick={() => generateBrief(action, gap)}
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              Brief
                            </Button>
                          ) : (
                            <UpgradeNudge
                              feature="Content briefs"
                              targetPlan="advanced"
                              compact
                            />
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Nav row ── */}
      <section className="grid grid-cols-12 gap-6 md:gap-10 pt-10 md:pt-14 mt-8 border-t border-border">
        <div className="col-span-12 md:col-span-3">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 h-[2px] bg-emerald-dark" />
            Finish
          </p>
        </div>
        <div className="col-span-12 md:col-span-9 max-w-3xl space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Link href={`/projects/${projectId}/competitors`}>
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back: competitors
              </Button>
            </Link>
            <Link href={`/projects/${projectId}`}>
              <Button>
                Run your first scan
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
          <p className="text-xs text-text-secondary">
            You&apos;re set up. Head to the project overview and tap{" "}
            <span className="text-text-primary font-medium">Run now</span> to
            see how your brand performs across AI models.
          </p>
        </div>
      </section>

      {/* Brief Modal */}
      {briefModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-[var(--shadow-lg)] w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h3 className="font-semibold">
                  {briefModal.modalMode === "brief"
                    ? "Content Brief"
                    : briefModal.modalMode === "draft"
                      ? "Generated Draft"
                      : "Send for Polish"}
                </h3>
                <p className="text-sm text-muted mt-0.5">
                  {briefModal.actionTitle}
                </p>
              </div>
              <button
                onClick={() =>
                  setBriefModal((prev) => ({
                    ...prev,
                    open: false,
                    loading: false,
                    brief: null,
                    actionTitle: "",
                    modalMode: "brief",
                    draft: null,
                    draftOutputType: null,
                  }))
                }
                className="text-muted hover:text-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {briefModal.loading ? (
                <div className="py-8">
                  <LoadingPhrases type="generating" />
                </div>
              ) : briefModal.modalMode === "brief" ? (
                <div className="space-y-6">
                  <div className="prose prose-sm max-w-none [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1 [&_p]:text-sm [&_p]:text-text-secondary [&_p]:mb-3 [&_li]:text-sm [&_li]:text-text-secondary [&_strong]:text-text-primary">
                    {briefModal.brief?.split("\n").map((line, i) => {
                      if (line.startsWith("# "))
                        return (
                          <h1 key={i}>{line.slice(2)}</h1>
                        );
                      if (line.startsWith("## "))
                        return (
                          <h2 key={i}>{line.slice(3)}</h2>
                        );
                      if (line.startsWith("### "))
                        return (
                          <h3 key={i}>{line.slice(4)}</h3>
                        );
                      if (line.startsWith("- "))
                        return (
                          <p key={i} className="pl-4 text-sm text-text-secondary">
                            &bull; {line.slice(2)}
                          </p>
                        );
                      if (line.startsWith("**"))
                        return (
                          <p key={i}>
                            <strong>{line.replace(/\*\*/g, "")}</strong>
                          </p>
                        );
                      if (line.trim() === "") return <br key={i} />;
                      return <p key={i}>{line}</p>;
                    })}
                  </div>

                  <div className="space-y-4 border-t border-border pt-6">
                    <div>
                      <h4 className="text-sm font-semibold mb-3">
                        Generate Draft
                      </h4>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateDraft("blog_post")}
                          disabled={briefModal.loading}
                          className="gap-1 text-xs"
                        >
                          <Wand2 className="h-3 w-3" />
                          Blog Post
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateDraft("faq_page")}
                          disabled={briefModal.loading}
                          className="gap-1 text-xs"
                        >
                          <Wand2 className="h-3 w-3" />
                          FAQ Page
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateDraft("schema_markup")}
                          disabled={briefModal.loading}
                          className="gap-1 text-xs"
                        >
                          <Wand2 className="h-3 w-3" />
                          Schema Markup
                        </Button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold mb-3">
                        Get Polished by Howl.ie
                      </h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setBriefModal((prev) => ({
                            ...prev,
                            modalMode: "polish",
                          }))
                        }
                        className="gap-1"
                      >
                        Request Polish Service
                      </Button>
                    </div>
                  </div>
                </div>
              ) : briefModal.modalMode === "draft" && briefModal.draft && briefModal.draftOutputType ? (
                <DraftViewer
                  draft={briefModal.draft}
                  outputType={briefModal.draftOutputType}
                  onBack={() =>
                    setBriefModal((prev) => ({
                      ...prev,
                      modalMode: "brief",
                      draft: null,
                      draftOutputType: null,
                    }))
                  }
                />
              ) : briefModal.modalMode === "polish" ? (
                <PolishRequestForm
                  projectId={projectId}
                  brief={briefModal.brief || ""}
                  draft={briefModal.draft}
                  actionTitle={briefModal.actionTitle}
                  userEmail={briefModal.userEmail}
                  onSuccess={() =>
                    setBriefModal((prev) => ({
                      ...prev,
                      open: false,
                      loading: false,
                      brief: null,
                      actionTitle: "",
                      modalMode: "brief",
                      draft: null,
                      draftOutputType: null,
                    }))
                  }
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
