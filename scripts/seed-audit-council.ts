/**
 * scripts/seed-audit-council.ts
 *
 * Phase 7c — backfill the Audit Council against artifacts that
 * completed before Phase 7 shipped. Walks each domain table, finds
 * rows without an audit_reviews row, and enqueues a council review.
 *
 * Idempotent: enqueueAuditReview itself dedupes on
 * (artifact_type, artifact_id), so re-running is safe.
 *
 * Usage (run from repo root):
 *
 *   npx tsx scripts/seed-audit-council.ts            # all types, all rows
 *   npx tsx scripts/seed-audit-council.ts --limit 5  # 5 per type
 *   npx tsx scripts/seed-audit-council.ts --type seo_audit
 *   npx tsx scripts/seed-audit-council.ts --type seo_audit --limit 1 --dry-run
 *
 * Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY (whatever the
 * audit-council needs to actually run). Safe to run from any machine
 * with Vercel env pulled into .env.local.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAuditReview } from "@/lib/audit-council/enqueue";
import type { AuditedArtifactType } from "@/lib/audit-council/types";

interface CliArgs {
  type: AuditedArtifactType | "all";
  limit: number | null;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { type: "all", limit: null, dryRun: false };
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === "--dry-run") {
      args.dryRun = true;
    } else if (flag === "--limit") {
      const v = process.argv[++i];
      args.limit = v ? parseInt(v, 10) : null;
    } else if (flag === "--type") {
      const v = process.argv[++i];
      if (
        v === "seo_audit" ||
        v === "monthly_playbook" ||
        v === "action_plan" ||
        v === "brand_profile" ||
        v === "prompt_batch"
      ) {
        args.type = v;
      } else {
        throw new Error(
          `--type must be one of seo_audit, monthly_playbook, action_plan, brand_profile, prompt_batch (got: ${v})`
        );
      }
    } else {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return args;
}

interface BackfillRow {
  artifact_type: AuditedArtifactType;
  artifact_id: string;
  org_id: string;
  project_id: string | null;
  hint: string;
}

async function findSeoAudits(limit: number | null): Promise<BackfillRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("seo_audits")
    .select("id, org_id, project_id, site_url")
    .eq("status", "complete")
    .not("org_id", "is", null)
    .not("report_markdown", "is", null);
  if (limit) query = query.limit(limit);
  const { data } = await query;
  return (data ?? []).map((r) => ({
    artifact_type: "seo_audit" as const,
    artifact_id: r.id as string,
    org_id: r.org_id as string,
    project_id: (r.project_id as string) ?? null,
    hint: (r.site_url as string) ?? "",
  }));
}

async function findActionPlans(limit: number | null): Promise<BackfillRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("action_plans")
    .select("id, project_id, projects(org_id, brand_name)")
    .eq("status", "complete")
    .is("superseded_at", null);
  if (limit) query = query.limit(limit);
  const { data } = await query;
  const out: BackfillRow[] = [];
  for (const r of data ?? []) {
    const row = r as {
      id: string;
      project_id: string;
      projects?: { org_id?: string; brand_name?: string } | null;
    };
    const project = row.projects;
    if (!project?.org_id) continue;
    out.push({
      artifact_type: "action_plan",
      artifact_id: row.id,
      org_id: project.org_id,
      project_id: row.project_id,
      hint: project.brand_name ?? "",
    });
  }
  return out;
}

async function findMonthlyPlaybooks(
  limit: number | null
): Promise<BackfillRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("monthly_playbooks")
    .select("id, project_id, month, projects(org_id, brand_name)");
  if (limit) query = query.limit(limit);
  const { data } = await query;
  const out: BackfillRow[] = [];
  for (const r of data ?? []) {
    const row = r as {
      id: string;
      project_id: string;
      month: string | null;
      projects?: { org_id?: string; brand_name?: string } | null;
    };
    const project = row.projects;
    if (!project?.org_id) continue;
    out.push({
      artifact_type: "monthly_playbook",
      artifact_id: row.id,
      org_id: project.org_id,
      project_id: row.project_id,
      hint: `${project.brand_name ?? ""} ${row.month ?? ""}`.trim(),
    });
  }
  return out;
}

async function findBrandProfiles(limit: number | null): Promise<BackfillRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("projects")
    .select("id, org_id, brand_name")
    .not("profile_short_description", "is", null);
  if (limit) query = query.limit(limit);
  const { data } = await query;
  return (data ?? [])
    .filter((r) => r.org_id)
    .map((r) => ({
      artifact_type: "brand_profile" as const,
      artifact_id: r.id as string,
      org_id: r.org_id as string,
      project_id: r.id as string,
      hint: (r.brand_name as string) ?? "",
    }));
}

async function findPromptBatches(limit: number | null): Promise<BackfillRow[]> {
  const admin = createAdminClient();
  // Distinct generated_batch_id where it isn't null. We pull a generous
  // window of rows then dedupe in JS — simpler than a SQL distinct
  // through Supabase's REST builder.
  const { data } = await admin
    .from("prompts")
    .select("generated_batch_id, project_id, projects(org_id, brand_name)")
    .not("generated_batch_id", "is", null)
    .limit(limit ? limit * 50 : 5000);
  if (!data) return [];

  const seen = new Map<string, BackfillRow>();
  for (const r of data) {
    const batchId = r.generated_batch_id as string;
    if (!batchId || seen.has(batchId)) continue;
    const project = (r as { projects?: { org_id?: string; brand_name?: string } }).projects;
    if (!project?.org_id) continue;
    seen.set(batchId, {
      artifact_type: "prompt_batch",
      artifact_id: batchId,
      org_id: project.org_id,
      project_id: r.project_id as string,
      hint: project.brand_name ?? "",
    });
    if (limit && seen.size >= limit) break;
  }
  return Array.from(seen.values());
}

const FINDERS: Record<
  Exclude<AuditedArtifactType, "brief">,
  (limit: number | null) => Promise<BackfillRow[]>
> = {
  seo_audit: findSeoAudits,
  action_plan: findActionPlans,
  monthly_playbook: findMonthlyPlaybooks,
  brand_profile: findBrandProfiles,
  prompt_batch: findPromptBatches,
};

async function alreadyReviewed(
  artifactType: AuditedArtifactType,
  artifactId: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("audit_reviews")
    .select("id")
    .eq("artifact_type", artifactType)
    .eq("artifact_id", artifactId)
    .maybeSingle();
  return Boolean(data);
}

async function main() {
  const args = parseArgs();
  console.log("Audit Council backfill — args:", args);

  const types =
    args.type === "all"
      ? (Object.keys(FINDERS) as Array<keyof typeof FINDERS>)
      : [args.type as keyof typeof FINDERS];

  let totalFound = 0;
  let totalSkipped = 0;
  let totalEnqueued = 0;
  let totalFailed = 0;

  for (const t of types) {
    console.log(`\n── ${t} ──`);
    const rows = await FINDERS[t](args.limit);
    console.log(`Found ${rows.length} candidates.`);
    totalFound += rows.length;

    for (const row of rows) {
      const existing = await alreadyReviewed(t, row.artifact_id);
      if (existing) {
        totalSkipped += 1;
        continue;
      }
      if (args.dryRun) {
        console.log(`  would enqueue: ${row.artifact_id} (${row.hint})`);
        continue;
      }
      try {
        await enqueueAuditReview({
          artifactType: t,
          artifactId: row.artifact_id,
          orgId: row.org_id,
          projectId: row.project_id,
        });
        totalEnqueued += 1;
        console.log(`  enqueued: ${row.artifact_id} (${row.hint})`);
      } catch (err) {
        totalFailed += 1;
        console.error(
          `  FAILED: ${row.artifact_id}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  found:    ${totalFound}`);
  console.log(`  skipped:  ${totalSkipped} (already reviewed)`);
  console.log(`  enqueued: ${totalEnqueued}`);
  console.log(`  failed:   ${totalFailed}`);
  console.log(`\nReviews run inline (not background); refresh /admin/audit-council to see verdicts.`);
}

main().catch((err) => {
  console.error("Backfill crashed:", err);
  process.exit(1);
});
