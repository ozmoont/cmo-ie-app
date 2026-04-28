/**
 * Phase 7 — shared auditor response parser.
 *
 * Every auditor is asked to emit the same JSON shape. This module
 * does the parsing + validation in one place so the three vendor
 * wrappers stay thin.
 *
 * Defensive on purpose: each auditor returns an `AuditorReport` even
 * on parse failure so the chair can synthesise from whatever survived.
 * A bad parse becomes an `AuditorReport` with `error` set and a
 * verdict of 'flag' (so the chair doesn't dismiss it as approve).
 */

import { stripJsonFences } from "@/lib/anthropic-errors";
import type {
  AuditIssue,
  AuditIssueCategory,
  AuditIssueSeverity,
  AuditVerdict,
  AuditorReport,
  AuditorUsage,
  AuditorVendor,
} from "../types";

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

function clampToUnit(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function isValidIssue(item: unknown): item is AuditIssue {
  if (!item || typeof item !== "object") return false;
  const x = item as Record<string, unknown>;
  if (typeof x.severity !== "string" || !VALID_SEVERITIES.has(x.severity as AuditIssueSeverity)) {
    return false;
  }
  if (
    typeof x.category !== "string" ||
    !VALID_CATEGORIES.has(x.category as AuditIssueCategory)
  ) {
    return false;
  }
  if (typeof x.quote !== "string" || x.quote.trim().length === 0) return false;
  if (typeof x.rationale !== "string" || x.rationale.trim().length === 0) return false;
  if (
    x.suggested_fix !== undefined &&
    typeof x.suggested_fix !== "string"
  ) {
    return false;
  }
  return true;
}

function normaliseIssue(raw: AuditIssue): AuditIssue {
  return {
    severity: raw.severity,
    category: raw.category,
    quote: raw.quote.slice(0, 200),
    rationale: raw.rationale.slice(0, 300),
    ...(raw.suggested_fix
      ? { suggested_fix: raw.suggested_fix.slice(0, 300) }
      : {}),
  };
}

/**
 * Parse the auditor's text response into an AuditorReport. Catches
 * malformed JSON / missing fields and returns an `error` report
 * instead of throwing — auditor robustness is more important than
 * hard failures here.
 */
export function parseAuditorReport(input: {
  vendor: AuditorVendor;
  model: string;
  rawText: string;
  usage: AuditorUsage;
}): AuditorReport {
  const { vendor, model, rawText, usage } = input;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(rawText));
  } catch {
    return {
      auditor: vendor,
      model,
      verdict: "flag",
      confidence: 0,
      issues: [],
      overall_rationale: `Auditor returned malformed JSON: ${rawText.slice(0, 200)}`,
      usage,
      error: "malformed_json",
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      auditor: vendor,
      model,
      verdict: "flag",
      confidence: 0,
      issues: [],
      overall_rationale: "Auditor returned a non-object response.",
      usage,
      error: "non_object_response",
    };
  }

  const obj = parsed as Record<string, unknown>;
  const verdict =
    typeof obj.verdict === "string" &&
    VALID_VERDICTS.has(obj.verdict as AuditVerdict)
      ? (obj.verdict as AuditVerdict)
      : "flag";

  const issues = Array.isArray(obj.issues)
    ? obj.issues.filter(isValidIssue).map(normaliseIssue)
    : [];

  const overall_rationale =
    typeof obj.overall_rationale === "string"
      ? obj.overall_rationale.slice(0, 600)
      : "";

  return {
    auditor: vendor,
    model,
    verdict,
    confidence: clampToUnit(obj.confidence),
    issues,
    overall_rationale,
    usage,
  };
}

/**
 * Build a placeholder AuditorReport for a vendor that errored before
 * we could even parse. Used by the orchestrator when an auditor's
 * SDK call throws (rate limit, network, missing key, etc.) so the
 * chair still has something to fold into agreement_score (it'll
 * ignore errored auditors per the chair prompt rules).
 */
export function makeErrorReport(input: {
  vendor: AuditorVendor;
  model: string;
  message: string;
  duration_ms: number;
}): AuditorReport {
  return {
    auditor: input.vendor,
    model: input.model,
    verdict: "flag",
    confidence: 0,
    issues: [],
    overall_rationale: `Auditor errored: ${input.message.slice(0, 200)}`,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      duration_ms: input.duration_ms,
    },
    error: input.message.slice(0, 200),
  };
}
