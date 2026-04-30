"use client";

/**
 * Phase 7b drill-down — client component.
 *
 * Three-column drill-down. Loads the review + artifact via the
 * admin API on mount, then renders side-by-side. The ops decision
 * panel posts back to /decide; success swaps in the updated row
 * without a full reload.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Flag,
  Skull,
  ChevronDown,
} from "lucide-react";
import { MarkdownReport } from "@/components/markdown-report";
import { Button } from "@/components/ui/button";

type Verdict = "approve" | "approve_with_caveats" | "flag" | "fail";
type Severity = "low" | "medium" | "high";

interface AuditIssue {
  severity: Severity;
  category: string;
  quote: string;
  rationale: string;
  suggested_fix?: string;
}

interface AuditorReport {
  auditor: "claude" | "chatgpt" | "gemini";
  model: string;
  verdict: Verdict;
  confidence: number;
  issues: AuditIssue[];
  overall_rationale: string;
  error?: string;
  usage?: { input_tokens: number; output_tokens: number; duration_ms: number };
}

interface Review {
  id: string;
  artifact_type: string;
  artifact_id: string;
  status: string;
  sampled: boolean;
  claude_report: AuditorReport | null;
  chatgpt_report: AuditorReport | null;
  gemini_report: AuditorReport | null;
  chair_verdict: Verdict | null;
  chair_summary: string | null;
  agreement_score: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  error_message: string | null;
  ops_decision: "approved" | "overridden" | "mark_regenerate" | null;
  ops_decision_at: string | null;
  ops_notes: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Artifact {
  artifact_type: string;
  artifact_id: string;
  brand_name: string | null;
  brand_segment: string | null;
  content: string;
  generated_at: string | null;
}

interface DrillDownPayload {
  review: Review;
  artifact: Artifact | null;
  project: { name: string | null; brand_name: string | null } | null;
}

const VENDOR_LABEL: Record<AuditorReport["auditor"], string> = {
  claude: "Claude (Anthropic)",
  chatgpt: "ChatGPT (OpenAI)",
  gemini: "Gemini (Google)",
};

export function ReviewDrillDown({ reviewId }: { reviewId: string }) {
  const [data, setData] = useState<DrillDownPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/audit-council/reviews/${reviewId}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `HTTP ${res.status}`
        );
      }
      setData((await res.json()) as DrillDownPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading review…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="border-l-2 border-danger pl-4 py-3 max-w-2xl mt-8">
        <p className="text-xs uppercase tracking-[0.15em] text-danger font-semibold flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          Failed to load review
        </p>
        <p className="mt-2 text-sm text-text-primary leading-relaxed">
          {error ?? "No data"}
        </p>
      </div>
    );
  }

  const { review, artifact, project } = data;

  // Compute the consensus issues client-side rather than relying on
  // the chair's stored field (it may have been a fallback synthesis).
  const consensusIssues = computeConsensus(review);

  return (
    <section className="py-6 grid grid-cols-12 gap-6 lg:gap-8">
      {/* ── Header strip ─── */}
      <div className="col-span-12">
        <h1 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight">
          {prettyArtifactType(review.artifact_type)}
          {project?.brand_name && (
            <span className="text-text-secondary font-normal">
              {" "}
              · {project.brand_name}
            </span>
          )}
        </h1>
        <p className="mt-1 text-xs text-text-muted font-mono">
          review {review.id} · {new Date(review.created_at).toLocaleString("en-IE")}
          {review.cost_usd !== null && review.cost_usd > 0 && (
            <> · ${review.cost_usd.toFixed(3)}</>
          )}
          {review.duration_ms !== null && (
            <> · {(review.duration_ms / 1000).toFixed(1)}s</>
          )}
          {review.sampled && <> · sampled</>}
        </p>
      </div>

      {/* ── Column 1: Artifact preview ─── */}
      <div className="col-span-12 lg:col-span-5 min-w-0">
        <p className="text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold mb-3">
          Artifact preview
        </p>
        {!artifact ? (
          <p className="text-sm text-text-muted">
            Artifact unavailable — may have been deleted since the
            review ran.
          </p>
        ) : (
          <div className="border border-border rounded-md p-4 max-h-[70vh] overflow-y-auto bg-surface-muted/30">
            {isJsonContent(review.artifact_type) ? (
              <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-words">
                {artifact.content}
              </pre>
            ) : (
              <MarkdownReport>{artifact.content}</MarkdownReport>
            )}
          </div>
        )}
      </div>

      {/* ── Column 2: Auditor cards ─── */}
      <div className="col-span-12 lg:col-span-4 space-y-4">
        <p className="text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold">
          Auditor verdicts
        </p>
        <AuditorCard report={review.claude_report} consensusIssues={consensusIssues} />
        <AuditorCard report={review.chatgpt_report} consensusIssues={consensusIssues} />
        <AuditorCard report={review.gemini_report} consensusIssues={consensusIssues} />
      </div>

      {/* ── Column 3: Chair synthesis + ops decision ─── */}
      <div className="col-span-12 lg:col-span-3 space-y-4">
        <p className="text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold">
          Chair synthesis
        </p>
        <div className="border border-border rounded-md p-4 space-y-3">
          {review.chair_verdict ? (
            <>
              <div className="flex items-center gap-2">
                <VerdictPill verdict={review.chair_verdict} />
                {review.agreement_score !== null && (
                  <span className="text-xs text-text-muted font-mono">
                    {Math.round(review.agreement_score * 100)}% agreement
                  </span>
                )}
              </div>
              {review.chair_summary && (
                <p className="text-sm text-text-primary leading-relaxed">
                  {review.chair_summary}
                </p>
              )}
              {consensusIssues.length > 0 && (
                <div className="mt-2 pt-3 border-t border-border">
                  <p className="text-[11px] uppercase tracking-[0.15em] text-text-muted font-semibold mb-2">
                    Consensus issues
                  </p>
                  <ul className="space-y-2 text-xs">
                    {consensusIssues.map((i, idx) => (
                      <li key={idx} className="text-text-secondary">
                        <span className="font-semibold uppercase text-[10px] tracking-wide">
                          {i.severity} · {i.category}
                        </span>
                        <p className="mt-0.5 italic text-text-primary">
                          &ldquo;{i.quote}&rdquo;
                        </p>
                        <p className="mt-0.5">{i.rationale}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-text-muted">
              {review.status === "pending" || review.status === "running"
                ? "Council still running…"
                : review.error_message ?? "No verdict yet."}
            </p>
          )}
        </div>

        <DecisionPanel review={review} onSaved={load} />
      </div>
    </section>
  );
}

// ── Auditor card ──────────────────────────────────────────────────

function AuditorCard({
  report,
  consensusIssues,
}: {
  report: AuditorReport | null;
  consensusIssues: AuditIssue[];
}) {
  const [expanded, setExpanded] = useState(true);
  if (!report) {
    return (
      <div className="border border-border rounded-md p-4 text-sm text-text-muted">
        No report from this auditor.
      </div>
    );
  }
  const consensusKeys = new Set(
    consensusIssues.map((i) => issueKey(i))
  );

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-2 p-3 bg-surface-muted/40 hover:bg-surface-muted/70 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <VerdictPill verdict={report.verdict} />
          <span className="text-sm font-medium text-text-primary truncate">
            {VENDOR_LABEL[report.auditor]}
          </span>
          {report.error && (
            <span className="text-xs text-danger">errored</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted shrink-0">
          <span className="font-mono">
            {Math.round(report.confidence * 100)}%
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>
      {expanded && (
        <div className="p-3 space-y-3 text-sm">
          {report.error && (
            <p className="text-xs text-danger leading-relaxed">
              {report.error}
            </p>
          )}
          {report.overall_rationale && (
            <p className="text-text-secondary leading-relaxed">
              {report.overall_rationale}
            </p>
          )}
          {report.issues.length > 0 ? (
            <ul className="space-y-3 mt-2">
              {report.issues.map((i, idx) => {
                const isConsensus = consensusKeys.has(issueKey(i));
                return (
                  <li
                    key={idx}
                    className={`pl-3 border-l-2 ${
                      isConsensus
                        ? "border-emerald-dark"
                        : i.severity === "high"
                          ? "border-danger"
                          : i.severity === "medium"
                            ? "border-warning"
                            : "border-border"
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-text-muted">
                      {i.severity} · {i.category}
                      {isConsensus && (
                        <span className="ml-2 text-emerald-dark font-semibold normal-case">
                          consensus
                        </span>
                      )}
                    </p>
                    <p className="mt-1 italic text-text-primary text-sm">
                      &ldquo;{i.quote}&rdquo;
                    </p>
                    <p className="mt-1 text-text-secondary text-sm">
                      {i.rationale}
                    </p>
                    {i.suggested_fix && (
                      <p className="mt-1 text-xs text-text-muted">
                        <span className="font-semibold">Suggested fix:</span>{" "}
                        {i.suggested_fix}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-text-muted">No issues raised.</p>
          )}
          {report.usage && (
            <p className="text-[10px] font-mono text-text-muted pt-2 border-t border-border">
              {report.model} · {report.usage.input_tokens} in /
              {report.usage.output_tokens} out ·{" "}
              {(report.usage.duration_ms / 1000).toFixed(1)}s
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Decision panel ────────────────────────────────────────────────

function DecisionPanel({
  review,
  onSaved,
}: {
  review: Review;
  onSaved: () => void;
}) {
  const [decision, setDecision] = useState<
    "approved" | "overridden" | "mark_regenerate" | null
  >(review.ops_decision ?? null);
  const [notes, setNotes] = useState(review.ops_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const submit = async () => {
    if (!decision) return;
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch(
        `/api/admin/audit-council/reviews/${review.id}/decide`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `HTTP ${res.status}`
        );
      }
      // Record the save time locally so the success message persists
      // even after onSaved() refreshes the parent payload. The
      // "Last decided …" line above gets repopulated from the server,
      // but this near-the-button confirmation is what gives the
      // operator immediate "yes, your click did something" feedback.
      setSavedAt(new Date().toLocaleString("en-IE"));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border rounded-md p-4 space-y-3">
      <p className="text-xs uppercase tracking-[0.15em] text-emerald-dark font-semibold">
        Ops decision
      </p>
      {review.ops_decision && review.ops_decision_at && (
        <p className="text-xs text-text-muted">
          Last decided {new Date(review.ops_decision_at).toLocaleString("en-IE")}
        </p>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        <DecisionButton
          label="Approve"
          tooltip="You agree with the council — the issue is real. Records 'approved' on the audit log; no customer-facing change."
          active={decision === "approved"}
          onClick={() => setDecision("approved")}
        />
        <DecisionButton
          label="Override"
          tooltip="You disagree with the council — the artifact is fine. Records 'overridden' on the audit log; no customer-facing change."
          active={decision === "overridden"}
          onClick={() => setDecision("overridden")}
        />
        <DecisionButton
          label="Regenerate"
          tooltip="Flag the source generator for human review. Records 'mark_regenerate' on the audit log; no automatic regeneration in v1."
          active={decision === "mark_regenerate"}
          onClick={() => setDecision("mark_regenerate")}
        />
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Reason for the decision (e.g. 'Verified with Bullet — they do hold this status' / 'Source prompt needs tighter industry-lock')."
        rows={3}
        className="w-full text-sm rounded-md border border-border bg-surface px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-emerald-dark/30 focus:border-emerald-dark resize-y"
      />
      {error && (
        <p className="text-xs text-danger flex items-start gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {savedAt && !error && (
        <p className="text-xs text-emerald-dark flex items-start gap-1">
          <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
          Saved at {savedAt}. Decision and note recorded.
        </p>
      )}
      <Button
        onClick={submit}
        disabled={!decision || saving || review.status !== "complete"}
        className="w-full"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
          </>
        ) : (
          "Record decision"
        )}
      </Button>

      {/* ── What each decision does ──
          Permanent footer explainer so admins always know the
          mechanical effect of clicking a button. Phase 7 v1 is
          observation-only: every decision is metadata, not a
          downstream trigger. We'll revisit when v2 wires up
          auto-block / auto-regenerate. */}
      <div className="border-t border-border pt-3 mt-3 space-y-2 text-xs text-text-muted leading-relaxed">
        <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted font-semibold">
          What happens next?
        </p>
        <p>
          v1 is observation-only. Whichever button you pick, the result
          is the same mechanically: a row in <span className="font-mono">audit_reviews</span>{" "}
          updates with your decision, your note, your email, and the
          timestamp. Nothing changes on the customer side — the brand
          profile / audit / playbook the customer sees is unchanged.
        </p>
        <p>
          Use the decisions to{" "}
          <span className="text-text-secondary font-medium">build a record</span>{" "}
          of when the council was right vs wrong. After 4 weeks of
          data, we&apos;ll decide which categories of flag should
          start auto-blocking customer rendering or auto-regenerating
          the artifact. Until then, your decision is signal, not action.
        </p>
        <p>
          If a flagged claim genuinely needs to come out of the
          customer-facing artifact, that&apos;s a manual edit on the
          source — e.g. for a brand profile, edit it in{" "}
          <span className="font-mono">/projects/[id]/brand</span>. Recording
          a decision here doesn&apos;t edit the artifact.
        </p>
      </div>
    </div>
  );
}

function DecisionButton({
  label,
  tooltip,
  active,
  onClick,
}: {
  label: string;
  tooltip: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`text-xs px-2 py-1.5 rounded border font-medium transition-colors ${
        active
          ? "border-emerald-dark bg-emerald-dark/10 text-emerald-dark"
          : "border-border text-text-secondary hover:border-text-muted"
      }`}
    >
      {label}
    </button>
  );
}

// ── Verdict pill ──────────────────────────────────────────────────

function VerdictPill({ verdict }: { verdict: Verdict }) {
  switch (verdict) {
    case "approve":
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-emerald-dark/10 text-emerald-dark">
          <CheckCircle2 className="h-3 w-3" /> approve
        </span>
      );
    case "approve_with_caveats":
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-warning/10 text-warning">
          <CheckCircle2 className="h-3 w-3" /> caveats
        </span>
      );
    case "flag":
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-warning/15 text-warning">
          <Flag className="h-3 w-3" /> flag
        </span>
      );
    case "fail":
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider bg-danger/15 text-danger">
          <Skull className="h-3 w-3" /> fail
        </span>
      );
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function isJsonContent(artifactType: string): boolean {
  return artifactType === "prompt_batch";
}

function prettyArtifactType(t: string): string {
  switch (t) {
    case "seo_audit":
      return "SEO audit";
    case "monthly_playbook":
      return "Monthly playbook";
    case "action_plan":
      return "Action plan";
    case "brief":
      return "Brief";
    case "brand_profile":
      return "Brand profile";
    case "prompt_batch":
      return "Phase 6 prompt batch";
    default:
      return t;
  }
}

function issueKey(i: AuditIssue): string {
  return `${i.category}::${i.quote.slice(0, 80).toLowerCase()}`;
}

/**
 * Compute consensus issues client-side: an issue is consensus if it
 * appears in every non-errored auditor's report. Matches the chair's
 * server-side logic but avoids relying on the stored field (which may
 * have been a fallback synthesis with no LLM check).
 */
function computeConsensus(review: Review): AuditIssue[] {
  const reports = [
    review.claude_report,
    review.chatgpt_report,
    review.gemini_report,
  ].filter(
    (r): r is AuditorReport => r !== null && !r.error
  );
  if (reports.length < 2) return [];

  const keysByAuditor = reports.map(
    (r) => new Set(r.issues.map(issueKey))
  );
  // Use the first auditor's issues as candidates.
  const consensus: AuditIssue[] = [];
  for (const candidate of reports[0].issues) {
    const key = issueKey(candidate);
    if (keysByAuditor.every((k) => k.has(key))) {
      consensus.push(candidate);
    }
  }
  return consensus;
}
