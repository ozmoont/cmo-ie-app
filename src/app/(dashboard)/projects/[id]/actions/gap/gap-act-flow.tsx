"use client";

/**
 * Client-side gap-act flow. Three states:
 *
 *   1. Idle      — gap summary + "Generate brief" button.
 *   2. Briefed   — brief is visible, with buttons to regenerate or
 *                  "Request polish (human expert)".
 *   3. Polished  — confirmation: we've queued it.
 *
 * The flow doesn't persist anything until the user hits Polish — the
 * brief text is deliberately ephemeral until a polish request is
 * created, so we don't fill the polish queue with half-reviewed drafts.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_PLAYBOOK,
  PAGE_TYPE_LABELS,
} from "@/lib/classifiers/types";
import type { SourceGap } from "@/lib/types";

interface GapActFlowProps {
  projectId: string;
  brandName: string;
  gap: SourceGap;
  defaultContactEmail?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "briefed"; brief: string; credits?: { used: number; limit: number } | null }
  | { kind: "polishing" }
  | { kind: "polished"; requestId: string }
  | { kind: "error"; message: string };

export function GapActFlow({
  projectId,
  brandName,
  gap,
  defaultContactEmail,
}: GapActFlowProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [contactEmail, setContactEmail] = useState(defaultContactEmail ?? "");
  const [notes, setNotes] = useState("");

  async function generateBrief() {
    setPhase({ kind: "generating" });
    try {
      const res = await fetch(`/api/projects/${projectId}/actions/brief`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gap }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `Brief generation failed (${res.status})`);
      }
      setPhase({
        kind: "briefed",
        brief: body.brief,
        credits: body.credits ?? null,
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function submitForPolish() {
    if (phase.kind !== "briefed") return;
    if (!contactEmail) {
      setPhase({
        kind: "error",
        message: "Add your contact email so we know where to send the polished version.",
      });
      return;
    }
    setPhase({ kind: "polishing" });
    try {
      const res = await fetch(`/api/projects/${projectId}/actions/polish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brief: (phase as { brief: string }).brief,
          actionTitle: titleFor(gap, brandName),
          contactEmail,
          notes,
          gap,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.requestId) {
        throw new Error(body.error ?? `Polish request failed (${res.status})`);
      }
      setPhase({ kind: "polished", requestId: body.requestId });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const stars = scoreToStars(gap.gap_score);

  return (
    <>
      {/* ── Gap summary ── */}
      <section className="py-10 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {stars && (
            <span className="inline-flex items-center gap-1">
              {[1, 2, 3].map((n) => (
                <Star
                  key={n}
                  className={`h-3.5 w-3.5 ${
                    n <= stars
                      ? "fill-emerald-dark text-emerald-dark"
                      : "text-text-muted/30"
                  }`}
                  strokeWidth={1.5}
                />
              ))}
            </span>
          )}
          {gap.source_type && (
            <Badge variant="outline" className="text-[10px]">
              {SOURCE_TYPE_LABELS[gap.source_type]}
            </Badge>
          )}
          {gap.page_type && (
            <Badge variant="outline" className="text-[10px]">
              {PAGE_TYPE_LABELS[gap.page_type]}
            </Badge>
          )}
          <Badge variant="default" className="text-[10px]">
            {gap.scope === "url" ? "URL gap" : "Domain gap"}
          </Badge>
        </div>

        {gap.url && (
          <p className="text-xs font-mono text-text-muted break-all mb-3">
            {gap.url}
          </p>
        )}

        {gap.competitors && gap.competitors.length > 0 ? (
          <p className="text-sm text-text-secondary">
            <span className="text-text-muted">Competitors already here:</span>{" "}
            <span className="text-text-primary">
              {gap.competitors.join(", ")}
            </span>
          </p>
        ) : (
          <p className="text-sm text-text-muted">
            No competitors recorded in this window — double-check the gap is
            still live before briefing it.
          </p>
        )}

        {gap.source_type && (
          <p className="mt-3 border-l-2 border-emerald-dark pl-3 text-xs text-text-secondary leading-relaxed max-w-2xl">
            <span className="font-semibold text-emerald-dark">Playbook:</span>{" "}
            {SOURCE_TYPE_PLAYBOOK[gap.source_type]}
          </p>
        )}
      </section>

      {/* ── Brief area ── */}
      <section className="py-10">
        {phase.kind === "idle" && (
          <div className="max-w-xl">
            <p className="text-sm text-text-secondary leading-relaxed mb-6">
              Clicking Generate brief uses{" "}
              <span className="font-semibold text-text-primary">
                one brief credit
              </span>
              . You&apos;ll see the output inline — nothing is persisted until
              you send it to the polish queue.
            </p>
            <Button onClick={generateBrief} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Generate brief
            </Button>
          </div>
        )}

        {phase.kind === "generating" && (
          <div className="flex items-center gap-3 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Composing the brief. ~20 seconds.
          </div>
        )}

        {phase.kind === "briefed" && (
          <div>
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold text-text-primary">
                Brief
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={generateBrief}
                className="gap-1.5"
              >
                Regenerate
              </Button>
            </div>
            <article className="prose prose-sm max-w-none text-text-primary whitespace-pre-wrap font-sans leading-relaxed border border-border rounded-lg bg-surface p-6">
              {phase.brief}
            </article>

            <div className="mt-8 border-t border-border pt-8 max-w-xl">
              <h3 className="text-base font-semibold text-text-primary">
                Send to the polish queue
              </h3>
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                A human editor on our team reviews the draft, sharpens copy,
                and sends you the final deliverable. Typical turnaround is
                3-5 working days.
              </p>

              <label className="block mt-5">
                <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-text-muted mb-1.5">
                  Contact email
                </span>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-emerald"
                  placeholder="you@company.com"
                  required
                />
              </label>

              <label className="block mt-4">
                <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-text-muted mb-1.5">
                  Notes for the polisher (optional)
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-emerald"
                  placeholder="Anything specific we should watch for — tone, references, internal stakeholders…"
                />
              </label>

              <div className="mt-5 flex items-center gap-3">
                <Button
                  onClick={submitForPolish}
                  className="gap-2"
                  disabled={!contactEmail}
                >
                  Send to polish queue <ArrowRight className="h-4 w-4" />
                </Button>
                <span className="text-[11px] text-text-muted">
                  No credit consumed by polishing.
                </span>
              </div>
            </div>
          </div>
        )}

        {phase.kind === "polishing" && (
          <div className="flex items-center gap-3 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Queuing the polish request.
          </div>
        )}

        {phase.kind === "polished" && (
          <div className="max-w-xl">
            <div className="rounded-lg border border-emerald-dark/30 bg-emerald-dark/5 p-5 flex items-start gap-3">
              <Check className="h-5 w-5 text-emerald-dark shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Sent for polish.
                </p>
                <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                  Request ID <code>{phase.requestId.slice(0, 8)}…</code>. We&apos;ll
                  email {contactEmail} with the polished deliverable. Track
                  status on the{" "}
                  <Link
                    href={`/projects/${projectId}/actions`}
                    className="underline"
                  >
                    Actions page
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="max-w-xl rounded-lg border border-danger/40 bg-danger/5 p-5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Something went wrong.
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {phase.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setPhase({ kind: "idle" })}
              >
                Try again
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function scoreToStars(score?: number): 1 | 2 | 3 | null {
  if (typeof score !== "number" || score <= 0) return null;
  if (score >= 0.3) return 3;
  if (score >= 0.1) return 2;
  return 1;
}

function titleFor(gap: SourceGap, brand: string): string {
  const where = gap.scope === "url" && gap.url
    ? safeHost(gap.url)
    : gap.domain;
  if (gap.source_type === "editorial") return `${brand} → pitch ${where}`;
  if (gap.source_type === "ugc") return `${brand} → community reply on ${where}`;
  if (gap.source_type === "reference") return `${brand} → directory listing on ${where}`;
  if (gap.source_type === "corporate") return `${brand} → partnership angle on ${where}`;
  if (gap.source_type === "your_own") return `${brand} → self-audit ${where}`;
  if (gap.source_type === "social") return `${brand} → social campaign on ${where}`;
  return `${brand} → act on ${where}`;
}

function safeHost(raw: string): string {
  try {
    return new URL(raw).host.replace(/^www\./, "");
  } catch {
    return raw;
  }
}
