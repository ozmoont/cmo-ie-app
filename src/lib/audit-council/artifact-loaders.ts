/**
 * Phase 7 — load the full content of an audited artifact.
 *
 * Each artifact_type has its own domain table (seo_audits,
 * monthly_playbooks, projects, etc.); the auditors don't care about
 * those shapes — they consume a normalised AuditableArtifact.
 *
 * v1 (Phase 7a): seo_audit only.
 * v2 (Phase 7b): action_plan, monthly_playbook, brand_profile, prompt_batch.
 *                'brief' stays unimplemented because briefs are streamed
 *                back to the customer rather than persisted — until we
 *                add a `briefs` table, there's no stable artifact_id to
 *                audit. Tracked in docs/phase-7-audit-council.md.
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditableArtifact, AuditedArtifactType } from "./types";

interface ProjectBrandRow {
  org_id: string;
  brand_name: string | null;
  brand_tracked_name: string | null;
  website_url: string | null;
  profile_short_description: string | null;
  profile_market_segment: string | null;
  profile_brand_identity: string | null;
  profile_target_audience: string | null;
  profile_products_services:
    | { name: string; description: string }[]
    | null;
  profile_updated_at: string | null;
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
    case "action_plan":
      return loadActionPlan(admin, artifactId);
    case "monthly_playbook":
      return loadMonthlyPlaybook(admin, artifactId);
    case "brand_profile":
      return loadBrandProfile(admin, artifactId);
    case "prompt_batch":
      return loadPromptBatch(admin, artifactId);

    case "brief":
      // Briefs are streamed to the customer + discarded; no row to
      // load. Will be implemented when we add a briefs table.
      throw new Error(
        "Audit Council: 'brief' loader is unimplemented because briefs are not persisted. See docs/phase-7-audit-council.md."
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

// ── seo_audit ─────────────────────────────────────────────────────

interface SeoAuditRow {
  id: string;
  org_id: string;
  project_id: string;
  site_url: string | null;
  status: string;
  report_markdown: string | null;
  generated_at: string | null;
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

  const project = await loadProjectBrand(admin, audit.project_id);

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

// ── action_plan ───────────────────────────────────────────────────

interface ActionPlanRow {
  id: string;
  project_id: string;
  status: string | null;
  raw_output: unknown;
  created_at: string;
  tier: string;
}

interface ActionItemRow {
  id: string;
  plan_id: string;
  prompt_text: string | null;
  root_cause: string | null;
  competitor_advantage: string | null;
  opportunity_type: string | null;
  position: number;
}

interface ActionStepRow {
  id: string;
  item_id: string;
  title: string;
  description: string | null;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  category: "content" | "technical" | "outreach" | "brand";
  position: number;
}

async function loadActionPlan(
  admin: SupabaseClient,
  planId: string
): Promise<AuditableArtifact | null> {
  const { data: plan } = await admin
    .from("action_plans")
    .select("id, project_id, status, raw_output, created_at, tier")
    .eq("id", planId)
    .maybeSingle<ActionPlanRow>();
  if (!plan) return null;
  if (plan.status !== "complete") return null;

  // Pull items + steps so the auditor sees the same structure the
  // customer reads in the UI, not just raw_output JSON.
  const { data: items } = await admin
    .from("action_items")
    .select(
      "id, plan_id, prompt_text, root_cause, competitor_advantage, opportunity_type, position"
    )
    .eq("plan_id", plan.id)
    .order("position", { ascending: true })
    .returns<ActionItemRow[]>();

  const itemRows = items ?? [];
  let stepRows: ActionStepRow[] = [];
  if (itemRows.length > 0) {
    const { data: steps } = await admin
      .from("action_steps")
      .select(
        "id, item_id, title, description, effort, impact, category, position"
      )
      .in(
        "item_id",
        itemRows.map((i) => i.id)
      )
      .order("position", { ascending: true })
      .returns<ActionStepRow[]>();
    stepRows = steps ?? [];
  }

  const project = await loadProjectBrand(admin, plan.project_id);

  const content = renderActionPlanMarkdown({
    plan,
    items: itemRows,
    steps: stepRows,
    brandName: project?.brand_tracked_name ?? project?.brand_name ?? null,
  });

  if (content.trim().length === 0) return null;

  return {
    artifact_type: "action_plan",
    artifact_id: plan.id,
    org_id: project?.org_id ?? "",
    project_id: plan.project_id,
    brand_name: project?.brand_tracked_name ?? project?.brand_name ?? null,
    brand_segment: project?.profile_market_segment ?? null,
    content,
    generated_at: plan.created_at,
  };
}

function renderActionPlanMarkdown(input: {
  plan: ActionPlanRow;
  items: ActionItemRow[];
  steps: ActionStepRow[];
  brandName: string | null;
}): string {
  const lines: string[] = [];
  lines.push(
    `# Action plan — ${input.brandName ?? "project"} (tier: ${input.plan.tier})`
  );
  lines.push("");
  if (input.items.length === 0) {
    lines.push("_No items in this plan._");
    return lines.join("\n");
  }

  // Index steps by item so we can group them under their parent.
  const stepsByItem = new Map<string, ActionStepRow[]>();
  for (const step of input.steps) {
    const list = stepsByItem.get(step.item_id) ?? [];
    list.push(step);
    stepsByItem.set(step.item_id, list);
  }

  for (const item of input.items) {
    lines.push(
      `## ${item.position + 1}. ${item.opportunity_type ?? "Opportunity"}`
    );
    lines.push("");
    if (item.prompt_text) {
      lines.push(`**Prompt:** ${item.prompt_text}`);
      lines.push("");
    }
    if (item.root_cause) {
      lines.push(`**Root cause:** ${item.root_cause}`);
      lines.push("");
    }
    if (item.competitor_advantage) {
      lines.push(`**Competitor advantage:** ${item.competitor_advantage}`);
      lines.push("");
    }
    const itemSteps = stepsByItem.get(item.id) ?? [];
    if (itemSteps.length > 0) {
      lines.push(`**Steps:**`);
      for (const step of itemSteps) {
        lines.push(
          `- [${step.category} · effort ${step.effort} · impact ${step.impact}] ${step.title}`
        );
        if (step.description) {
          lines.push(`  ${step.description}`);
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

// ── monthly_playbook ──────────────────────────────────────────────

interface MonthlyPlaybookRow {
  id: string;
  project_id: string;
  month: string;
  subject: string | null;
  body_markdown: string | null;
  generated_at: string | null;
}

async function loadMonthlyPlaybook(
  admin: SupabaseClient,
  playbookId: string
): Promise<AuditableArtifact | null> {
  const { data: playbook } = await admin
    .from("monthly_playbooks")
    .select(
      "id, project_id, month, subject, body_markdown, generated_at"
    )
    .eq("id", playbookId)
    .maybeSingle<MonthlyPlaybookRow>();
  if (!playbook) return null;
  if (
    !playbook.body_markdown ||
    playbook.body_markdown.trim().length === 0
  ) {
    return null;
  }

  const project = await loadProjectBrand(admin, playbook.project_id);

  // Prepend the subject so the auditor sees what the customer sees in
  // their email inbox.
  const content = playbook.subject
    ? `# ${playbook.subject}\n\n${playbook.body_markdown}`
    : playbook.body_markdown;

  return {
    artifact_type: "monthly_playbook",
    artifact_id: playbook.id,
    org_id: project?.org_id ?? "",
    project_id: playbook.project_id,
    brand_name:
      project?.brand_tracked_name ?? project?.brand_name ?? null,
    brand_segment: project?.profile_market_segment ?? null,
    content,
    generated_at: playbook.generated_at,
  };
}

// ── brand_profile ─────────────────────────────────────────────────

async function loadBrandProfile(
  admin: SupabaseClient,
  projectId: string
): Promise<AuditableArtifact | null> {
  const project = await loadProjectBrand(admin, projectId);
  if (!project) return null;
  if (
    !project.profile_short_description ||
    project.profile_short_description.trim().length === 0
  ) {
    // Empty profile — nothing to audit.
    return null;
  }

  // Render the structured profile as markdown so the auditor can
  // evaluate consistency between the fields. Audit looks for the
  // industry-lock failure mode: segment doesn't match the audience or
  // products.
  const lines: string[] = [];
  lines.push(`# Brand profile — ${project.brand_tracked_name ?? project.brand_name ?? "project"}`);
  if (project.website_url) {
    lines.push(`Website: ${project.website_url}`);
  }
  lines.push("");
  lines.push(`## Short description`);
  lines.push(project.profile_short_description ?? "");
  lines.push("");
  lines.push(`## Market segment`);
  lines.push(project.profile_market_segment ?? "_(empty)_");
  lines.push("");
  lines.push(`## Brand identity`);
  lines.push(project.profile_brand_identity ?? "_(empty)_");
  lines.push("");
  lines.push(`## Target audience`);
  lines.push(project.profile_target_audience ?? "_(empty)_");
  lines.push("");
  lines.push(`## Products / services`);
  if (
    project.profile_products_services &&
    project.profile_products_services.length > 0
  ) {
    for (const ps of project.profile_products_services) {
      lines.push(`- **${ps.name}** — ${ps.description}`);
    }
  } else {
    lines.push("_(empty)_");
  }

  return {
    artifact_type: "brand_profile",
    artifact_id: projectId,
    org_id: project.org_id,
    project_id: projectId,
    brand_name: project.brand_tracked_name ?? project.brand_name ?? null,
    brand_segment: project.profile_market_segment ?? null,
    content: lines.join("\n"),
    generated_at: project.profile_updated_at,
  };
}

// ── prompt_batch ──────────────────────────────────────────────────

interface PromptBatchRow {
  id: string;
  project_id: string;
  text: string;
  category: string;
  generated_batch_id: string;
  created_at: string;
}

async function loadPromptBatch(
  admin: SupabaseClient,
  batchId: string
): Promise<AuditableArtifact | null> {
  const { data: prompts } = await admin
    .from("prompts")
    .select("id, project_id, text, category, generated_batch_id, created_at")
    .eq("generated_batch_id", batchId)
    .order("created_at", { ascending: true })
    .returns<PromptBatchRow[]>();

  if (!prompts || prompts.length === 0) return null;

  // Every prompt in a batch belongs to the same project; pluck from
  // the first row.
  const projectId = prompts[0].project_id;
  const project = await loadProjectBrand(admin, projectId);

  // Hand the auditor JSON. The Phase 6 batch generator emits
  // structured data; auditing it as JSON is closer to the wire format
  // the rest of the pipeline sees than re-rendering it as markdown.
  const payload = {
    batch_id: batchId,
    count: prompts.length,
    prompts: prompts.map((p) => ({
      id: p.id,
      text: p.text,
      category: p.category,
    })),
  };

  return {
    artifact_type: "prompt_batch",
    artifact_id: batchId,
    org_id: project?.org_id ?? "",
    project_id: projectId,
    brand_name: project?.brand_tracked_name ?? project?.brand_name ?? null,
    brand_segment: project?.profile_market_segment ?? null,
    content: JSON.stringify(payload, null, 2),
    generated_at: prompts[0].created_at,
  };
}

// ── shared helper ─────────────────────────────────────────────────

async function loadProjectBrand(
  admin: SupabaseClient,
  projectId: string
): Promise<ProjectBrandRow | null> {
  const { data } = await admin
    .from("projects")
    .select(
      "org_id, brand_name, brand_tracked_name, website_url, profile_short_description, profile_market_segment, profile_brand_identity, profile_target_audience, profile_products_services, profile_updated_at"
    )
    .eq("id", projectId)
    .maybeSingle<ProjectBrandRow>();
  return data ?? null;
}
