/**
 * Phase 7 — Audit Council shared types.
 *
 * All three auditors (Claude / ChatGPT / Gemini) and the chair
 * synthesiser produce or consume these shapes. The DB stores
 * AuditorReport as JSONB on audit_reviews.{claude,chatgpt,gemini}_report
 * and the chair's verdict on audit_reviews.chair_*; the lib enforces
 * the structure on read + write.
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

export type AuditedArtifactType =
  | "seo_audit"
  | "monthly_playbook"
  | "action_plan"
  | "brief"
  | "brand_profile"
  | "prompt_batch";

export type AuditorVendor = "claude" | "chatgpt" | "gemini";

export type AuditVerdict =
  | "approve"
  | "approve_with_caveats"
  | "flag"
  | "fail";

export type AuditIssueSeverity = "low" | "medium" | "high";

/**
 * Categories the auditors classify each issue under. Kept tight on
 * purpose — too many categories produces noise; these eight cover the
 * ways CMO.ie content has historically gone wrong.
 */
export type AuditIssueCategory =
  | "factual" // claim contradicts a known fact
  | "industry_lock" // wrong industry / segment / audience
  | "specificity" // vague filler instead of concrete advice
  | "consistency" // contradicts an earlier section of the same artifact
  | "citation" // missing or incorrect source
  | "date" // stale or anachronistic reference
  | "scope" // doesn't address the user's actual question
  | "brand_voice" // off-tone for the brand
  | "other";

export interface AuditIssue {
  severity: AuditIssueSeverity;
  category: AuditIssueCategory;
  /** ≤ 200 chars; the offending text quoted verbatim from the artifact. */
  quote: string;
  rationale: string;
  suggested_fix?: string;
}

export interface AuditorUsage {
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  /** Best-effort cost estimate in USD; computed from ai-pricing. */
  cost_usd?: number;
}

/**
 * The canonical report shape every auditor returns. Stored as JSONB
 * on the audit_reviews row.
 */
export interface AuditorReport {
  auditor: AuditorVendor;
  /** Exact model string (e.g. claude-sonnet-4-6). For telemetry. */
  model: string;
  verdict: AuditVerdict;
  /** 0-1; higher = more confident in the verdict. */
  confidence: number;
  issues: AuditIssue[];
  overall_rationale: string;
  usage: AuditorUsage;
  /**
   * Set when the auditor errored. Other fields will carry placeholder
   * values; the chair drops errored auditors from its synthesis.
   */
  error?: string;
}

export interface ChairVerdict {
  verdict: AuditVerdict;
  /** ≤ 400 chars; the inbox row summary the admin UI renders. */
  summary: string;
  /**
   * 0-1; share of auditors whose verdict matched the chair's final
   * verdict. 1.0 = unanimous; lower = the chair had to break a tie.
   */
  agreement_score: number;
  /** Issues from any auditor with severity 'high'. */
  high_severity_issues: AuditIssue[];
  /**
   * Issues every (non-errored) auditor flagged. Strongest signal
   * something is genuinely wrong. Empty array if nothing matched.
   */
  consensus_issues: AuditIssue[];
  /** Telemetry for the chair call itself. */
  usage: AuditorUsage;
  error?: string;
}

/**
 * What the council orchestrator persists to audit_reviews after all
 * three auditors + chair finish.
 */
export interface CompletedReview {
  reviewId: string;
  artifactType: AuditedArtifactType;
  artifactId: string;
  reports: {
    claude: AuditorReport;
    chatgpt: AuditorReport;
    gemini: AuditorReport;
  };
  chair: ChairVerdict;
  cost_usd: number;
  duration_ms: number;
}

/**
 * Full content of an audited artifact, as the auditors see it. The
 * artifact loaders in artifact-loaders.ts produce one of these per
 * artifact_type. The auditors don't care about the shape of the
 * underlying domain table; they read this normalised view.
 */
export interface AuditableArtifact {
  artifact_type: AuditedArtifactType;
  artifact_id: string;
  org_id: string;
  project_id: string | null;
  /** Brand context to scope the auditor's industry-lock check. */
  brand_name: string | null;
  brand_segment: string | null;
  /** Body the auditor evaluates — markdown for most types, JSON for
   *  structured artifacts (brand profile, prompt batch). */
  content: string;
  /** ISO timestamp the artifact was generated, useful for date checks. */
  generated_at: string | null;
}
