"use client";

/**
 * Admin playbook surface. Left column: per-project "generate this
 * month" buttons. Right column: recent playbook rows. Selecting a row
 * fetches the body_markdown and renders it inline.
 *
 * Deliberately minimal UI — this is an internal review surface, not a
 * customer-facing screen. No fancy diff; no inline editing. If the
 * owner doesn't like the output they re-generate (force) after
 * whatever prompt tweak ships.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProjectRow {
  id: string;
  name: string;
  brand_name: string;
}

interface PlaybookRow {
  id: string;
  project_id: string;
  month: string;
  subject: string;
  status: "draft" | "ready" | "sent" | "failed";
  status_message: string | null;
  generated_at: string;
  sent_at: string | null;
}

interface PlaybookDetail extends PlaybookRow {
  body_markdown: string;
  recipients: string[];
}

export function PlaybookAdmin() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [playbooks, setPlaybooks] = useState<PlaybookRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlaybookDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  async function loadIndex() {
    const res = await fetch("/api/admin/monthly-playbooks");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Failed to load playbooks");
      return;
    }
    const body = await res.json();
    setProjects(body.projects ?? []);
    setPlaybooks(body.playbooks ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadIndex();
  }, []);

  useEffect(() => {
    // Clearing detail when nothing is selected is inherently a
    // synchronous setState inside an effect — the lint rule's
    // cascading-renders concern doesn't apply to this one-shot
    // clear-on-deselect pattern.
    if (!selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetail(null);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/admin/monthly-playbooks/${selectedId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Failed to load playbook");
        return;
      }
      const body = await res.json();
      setDetail(body.playbook as PlaybookDetail);
    })();
  }, [selectedId]);

  async function generateForProject(projectId: string, force = false) {
    setGeneratingFor(projectId);
    setError(null);
    try {
      const res = await fetch("/api/admin/monthly-playbooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: projectId, force }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error ?? "Generation failed");
      }
      await loadIndex();
      if (body.playbook?.id) setSelectedId(body.playbook.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingFor(null);
    }
  }

  return (
    <>
      {error && (
        <section className="pt-6">
          <div className="max-w-2xl flex items-start gap-3 border border-danger/40 bg-danger/5 rounded-lg p-4 text-sm">
            <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
            <p className="text-text-primary">{error}</p>
          </div>
        </section>
      )}

      <section className="grid grid-cols-12 gap-6 md:gap-10 py-10">
        {/* ── Left: projects ── */}
        <div className="col-span-12 md:col-span-5">
          <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 mb-4">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Projects
          </h2>
          {projects === null ? (
            <p className="text-sm text-text-secondary">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No projects in this org yet.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {p.brand_name || p.name}
                    </p>
                    <p className="text-[11px] font-mono text-text-muted truncate">
                      {p.id.slice(0, 8)}…
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateForProject(p.id)}
                    disabled={generatingFor !== null}
                    className="gap-1.5 shrink-0"
                  >
                    {generatingFor === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Generate
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => void loadIndex()}
            className="mt-4 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {/* ── Right: recent playbooks ── */}
        <div className="col-span-12 md:col-span-7">
          <h2 className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-2 mb-4">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-[2px] bg-emerald-dark"
            />
            Recent playbooks
          </h2>

          {playbooks.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No playbooks generated yet. Click Generate on a project to
              produce one for this month.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {playbooks.map((pb) => (
                <li key={pb.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedId(selectedId === pb.id ? null : pb.id)
                    }
                    className={`w-full text-left py-3 flex items-start gap-3 hover:bg-surface-hover transition-colors -mx-2 px-2 rounded-md ${
                      selectedId === pb.id ? "bg-surface-hover" : ""
                    }`}
                  >
                    <FileText className="h-4 w-4 text-text-muted shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {pb.subject}
                      </p>
                      <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] font-mono text-text-muted tabular-nums">
                        <span>{pb.month}</span>
                        <span>·</span>
                        <span>generated {shortDate(pb.generated_at)}</span>
                        <StatusBadge status={pb.status} />
                      </div>
                    </div>
                  </button>
                  {selectedId === pb.id && detail && (
                    <div className="pt-3 pb-5 pl-7">
                      <div className="text-[11px] font-mono text-text-muted mb-3">
                        Recipients:{" "}
                        {detail.recipients.length > 0
                          ? detail.recipients.join(", ")
                          : "none recorded"}
                      </div>
                      <article className="prose prose-sm max-w-none text-text-primary whitespace-pre-wrap font-sans leading-relaxed border border-border rounded-lg bg-surface p-5">
                        {detail.body_markdown}
                      </article>
                      <div className="mt-3 flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            generateForProject(detail.project_id, true)
                          }
                          disabled={generatingFor !== null}
                          className="gap-1.5"
                        >
                          {generatingFor === detail.project_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Regenerate for {detail.month}
                        </Button>
                        <span className="text-[11px] text-text-muted">
                          Force regenerate — replaces the existing draft.
                        </span>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function StatusBadge({
  status,
}: {
  status: PlaybookRow["status"];
}) {
  if (status === "sent") {
    return (
      <Badge variant="success" className="text-[10px] gap-1">
        <Check className="h-3 w-3" /> sent
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="warning" className="text-[10px]">
        failed
      </Badge>
    );
  }
  if (status === "ready") {
    return (
      <Badge variant="outline" className="text-[10px]">
        ready
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="text-[10px]">
      draft
    </Badge>
  );
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
