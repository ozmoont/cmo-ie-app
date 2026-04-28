/**
 * Phase 7 — chair synthesiser.
 *
 * Takes the three (or fewer, if some errored) auditor reports and
 * produces a single ChairVerdict the admin UI can render. We use
 * Haiku here because the synthesis is cheap classification — picking
 * the strictest defensible verdict, deduping issues, computing
 * agreement. Sonnet would be overkill at ~10x the cost.
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import Anthropic from "@anthropic-ai/sdk";
import { stripJsonFences } from "@/lib/anthropic-errors";
import { CHAIR_SYSTEM_PROMPT } from "./prompts";
import type {
  AuditIssue,
  AuditIssueCategory,
  AuditIssueSeverity,
  AuditVerdict,
  AuditorReport,
  ChairVerdict,
} from "./types";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const VALID_VERDICTS: ReadonlySet<AuditVerdict> = new Set([
  "approve",
  "approve_with_caveats",
  "flag",
  "fail",
]);

const VALID_SEVERITIES: ReadonlySet<AuditIssueSeverity> = new Set([
  "low",
  "medium",
  "high",
]);

const VALID_CATEGORIES: ReadonlySet<AuditIssueCategory> = new Set([
  "factual",
  "industry_lock",
  "specificity",
  "consistency",
  "citation",
  "date",
  "scope",
  "brand_voice",
  "other",
]);

const VERDICT_RANK: Record<AuditVerdict, number> = {
  approve: 0,
  approve_with_caveats: 1,
  flag: 2,
  fail: 3,
};

function isValidIssue(item: unknown): item is AuditIssue {
  if (!item || typeof item !== "object") return false;
  const x = item as Record<string, unknown>;
  return (
    typeof x.severity === "string" &&
    VALID_SEVERITIES.has(x.severity as AuditIssueSeverity) &&
    typeof x.category === "string" &&
    VALID_CATEGORIES.has(x.category as AuditIssueCategory) &&
    typeof x.quote === "string" &&
    x.quote.trim().length > 0 &&
    typeof x.rationale === "string" &&
    x.rationale.trim().length > 0
  );
}

/**
 * Local fallback synthesis. Used when the Haiku call fails OR every
 * auditor errored. Picks the strictest verdict mechanically and
 * computes agreement / consensus from the surviving reports.
 */
function fallbackChair(reports: AuditorReport[]): ChairVerdict {
  const surviving = reports.filter((r) => !r.error);

  if (surviving.length === 0) {
    return {
      verdict: "flag",
      summary:
        "All three auditors errored. No verdict available; review the raw reports manually.",
      agreement_score: 0,
      high_severity_issues: [],
      consensus_issues: [],
      usage: { input_tokens: 0, output_tokens: 0, duration_ms: 0 },
      error: "all_auditors_errored",
    };
  }

  // Strictest verdict wins.
  const strictest = surviving
    .map((r) => r.verdict)
    .reduce<AuditVerdict>(
      (acc, v) => (VERDICT_RANK[v] > VERDICT_RANK[acc] ? v : acc),
      "approve"
    );

  const agreement_score =
    surviving.filter((r) => r.verdict === strictest).length / surviving.length;

  const high_severity_issues = surviving
    .flatMap((r) => r.issues)
    .filter((i) => i.severity === "high");

  // Consensus: same quote (case-insensitive prefix) flagged by every
  // surviving auditor. Cheap heuristic; the chair's LLM pass usually
  // does a better job, but this is the safety net.
  const consensus_issues: AuditIssue[] = [];
  if (surviving.length >= 2) {
    const firstAuditorIssues = surviving[0].issues;
    for (const candidate of firstAuditorIssues) {
      const key = candidate.quote.slice(0, 80).toLowerCase();
      const allFlagged = surviving.every((r) =>
        r.issues.some(
          (i) => i.quote.slice(0, 80).toLowerCase() === key
        )
      );
      if (allFlagged) consensus_issues.push(candidate);
    }
  }

  return {
    verdict: strictest,
    summary: `Fallback synthesis (chair LLM unavailable). ${surviving.length}/${reports.length} auditors reported; strictest verdict was '${strictest}'.`,
    agreement_score,
    high_severity_issues,
    consensus_issues,
    usage: { input_tokens: 0, output_tokens: 0, duration_ms: 0 },
    error: "chair_llm_unavailable_used_fallback",
  };
}

/**
 * Run the chair LLM and parse its verdict. Falls back to the
 * mechanical synthesis if anything goes wrong.
 */
export async function runChair(
  reports: AuditorReport[]
): Promise<ChairVerdict> {
  const startedAt = Date.now();

  const surviving = reports.filter((r) => !r.error);
  if (surviving.length === 0) {
    return fallbackChair(reports);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-...")) {
    return fallbackChair(reports);
  }

  try {
    const client = new Anthropic({ apiKey });

    // Hand the chair every report (including errored ones) so it can
    // see the full picture; the chair prompt tells it to ignore
    // errored auditors when computing agreement.
    const userMessage = JSON.stringify(
      reports.map((r) => ({
        auditor: r.auditor,
        verdict: r.verdict,
        confidence: r.confidence,
        issues: r.issues,
        overall_rationale: r.overall_rationale,
        error: r.error ?? null,
      })),
      null,
      2
    );

    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1500,
      system: CHAIR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return fallbackChair(reports);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFences(textBlock.text));
    } catch {
      return fallbackChair(reports);
    }

    if (!parsed || typeof parsed !== "object") {
      return fallbackChair(reports);
    }
    const obj = parsed as Record<string, unknown>;

    const verdict =
      typeof obj.verdict === "string" &&
      VALID_VERDICTS.has(obj.verdict as AuditVerdict)
        ? (obj.verdict as AuditVerdict)
        : "flag";

    const agreement_score =
      typeof obj.agreement_score === "number" &&
      obj.agreement_score >= 0 &&
      obj.agreement_score <= 1
        ? obj.agreement_score
        : surviving.filter((r) => r.verdict === verdict).length /
          surviving.length;

    const high_severity_issues = Array.isArray(obj.high_severity_issues)
      ? obj.high_severity_issues
          .filter(isValidIssue)
          .map((i) => ({
            severity: i.severity,
            category: i.category,
            quote: i.quote.slice(0, 200),
            rationale: i.rationale.slice(0, 300),
            ...(i.suggested_fix
              ? { suggested_fix: i.suggested_fix.slice(0, 300) }
              : {}),
          }))
      : [];

    const consensus_issues = Array.isArray(obj.consensus_issues)
      ? obj.consensus_issues
          .filter(isValidIssue)
          .map((i) => ({
            severity: i.severity,
            category: i.category,
            quote: i.quote.slice(0, 200),
            rationale: i.rationale.slice(0, 300),
            ...(i.suggested_fix
              ? { suggested_fix: i.suggested_fix.slice(0, 300) }
              : {}),
          }))
      : [];

    const summary =
      typeof obj.summary === "string"
        ? obj.summary.slice(0, 500)
        : `${verdict} — ${surviving.length}/${reports.length} auditors reported.`;

    return {
      verdict,
      summary,
      agreement_score,
      high_severity_issues,
      consensus_issues,
      usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
        duration_ms: Date.now() - startedAt,
      },
    };
  } catch (err) {
    console.warn(
      `[audit-council] chair LLM call failed, using fallback:`,
      err
    );
    return fallbackChair(reports);
  }
}
