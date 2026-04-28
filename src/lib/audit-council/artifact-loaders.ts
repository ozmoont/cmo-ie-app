/**
 * Phase 7 — load the full content of an audited artifact.
 *
 * Each artifact_type has its own domain table (seo_audits,
 * monthly_playbooks, projects, etc.); the auditors don't care about
 * those shapes — they consume a normalised AuditableArtifact.
 *
 * v1 (Phase 7a): only the seo_audit loader is wired. The other
 * artifact types are stubbed and throw a clear error so 7b can flip
 * them on one at a time.
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditableArtifact, AuditedArtifactType } from "./types";

interface SeoAuditRow {
  id: string;
  org_id: string;
  project_id: string;
  site_url: string | null;
  status: string;
  report_markdown: string | null;
  generated_at: string | null;
}

interface ProjectBrandRow {
  brand_name: string | null;
  brand_tracked_name: string | null;
  profile_market_segment: string | null;
}

/**
 * Load and normalise the artifact for the auditors. Returns null if
 * the artifact isn't in a state worth auditing (still pending,
 * failed, missing body, etc.) — the caller should silently skip in
 * that case rather than burn auditor calls on an empty payload.
 */
export async function loadArtifactForAudit(
  admin: SupabaseClient,
  artifactType: AuditedArtifactType,
  artifactId: string
): Promise<AuditableArtifact | null> {
  switch (artifactType) {
    case "seo_audit":
      return loadSeoAudit(admin, artifactId);

    // 7b will flip these on. Throwing rather than returning null so
    // we get a loud signal if the orchestrator ever fires for an
    // unsupported type before the loader ships.
    case "monthly_playbook":
    case "action_plan":
    case "brief":
    case "brand_profile":
    case "prompt_batch":
      throw new Error(
        `Audit Council: artifact loader for '${artifactType}' is not yet implemented (Phase 7b).`
      );

    default: {
      // Exhaustiveness check. If a new artifact_type is added to the
      // union, TypeScript will fail this assignment until the switch
      // is updated.
      const _exhaustive: never = artifactType;
      throw new Error(`Unknown artifact type: ${String(_exhaustive)}`);
    }
  }
}

async function loadSeoAudit(
  admin: SupabaseClient,
  auditId: string
): Promise<AuditableArtifact | null> {
  const { data: audit } = await admin
    .from("seo_audits")
    .select(
      "id, org_id, project_id, site_url, status, report_markdown, generated_at"
    )
    .eq("id", auditId)
    .maybeSingle<SeoAuditRow>();

  if (!audit) return null;
  if (audit.status !== "complete") return null;
  if (!audit.report_markdown || audit.report_markdown.trim().length === 0) {
    return null;
  }

  // Pull brand context off the project so the auditors can do an
  // industry-lock check without re-fetching it from the prompt.
  const { data: project } = await admin
    .from("projects")
    .select("brand_name, brand_tracked_name, profile_market_segment")
    .eq("id", audit.project_id)
    .maybeSingle<ProjectBrandRow>();

  return {
    artifact_type: "seo_audit",
    artifact_id: audit.id,
    org_id: audit.org_id,
    project_id: audit.project_id,
    brand_name:
      project?.brand_tracked_name ?? project?.brand_name ?? null,
    brand_segment: project?.profile_market_segment ?? null,
    content: audit.report_markdown,
    generated_at: audit.generated_at,
  };
}
