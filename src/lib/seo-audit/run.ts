/**
 * SEO audit pipeline.
 *
 * Given a paid/included audit row in 'pending' status:
 *   1. Mark generating, progress 5%
 *   2. Fetch site snapshot (existing helper from brand-profile)
 *   3. Fetch PSI Lighthouse data
 *   4. Pull the active SEO Auditor skill version
 *   5. Call Claude Sonnet with skill_md as system prompt + signals
 *   6. Parse markdown report + JSON summary
 *   7. Save to seo_audits, status → complete
 *   8. Fire-and-forget observer pass for self-learning
 *
 * Errors at any stage flip the row to 'failed' (or 'unavailable' if
 * the site itself was the problem) so the UI can render the right
 * message.
 *
 * Designed to be fire-and-forget from the API route — the user's
 * POST returns immediately with a 'pending' row, this runs in the
 * background, and the page polls the row to surface progress.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSiteSnapshot } from "@/lib/brand-profile";
import { runPsi, PsiError, type PsiResult } from "@/lib/seo-audit/psi";
import { logAiUsage } from "@/lib/ai-usage-logger";

const SONNET_MODEL = "claude-sonnet-4-6";
// Audit reports are big — we want enough headroom for a 9-phase
// audit + JSON summary. 12k tokens covers everything observed in
// dev runs (typical output ~8k).
const MAX_OUTPUT_TOKENS = 12_000;

interface SkillVersion {
  id: string;
  version_number: number;
  skill_md: string;
}

/**
 * Run the audit. Updates the seo_audits row through generating →
 * complete (or failed). Never throws — failures are persisted as
 * status='failed' or 'unavailable'.
 */
export async function runSeoAudit(auditId: string): Promise<void> {
  const admin = createAdminClient();

  // Hydrate the audit + the active skill version.
  const { data: audit } = await admin
    .from("seo_audits")
    .select(
      "id, site_url, customer_email, org_id, project_id, source"
    )
    .eq("id", auditId)
    .maybeSingle<{
      id: string;
      site_url: string;
      customer_email: string;
      org_id: string | null;
      project_id: string | null;
      source: string;
    }>();
  if (!audit) {
    console.error(`[seo-audit ${auditId}] audit row not found`);
    return;
  }

  // Find the active SEO Auditor skill. We look up by slug
  // ('howl-seo-auditor' from plugin.json) and pick whichever version
  // skills.current_version_id points at.
  const skill = await loadActiveSeoSkill(admin);
  if (!skill) {
    await failAudit(
      admin,
      auditId,
      "failed",
      "No SEO skill is active. An admin needs to upload + activate the howl-seo-auditor skill at /admin/skills first."
    );
    return;
  }

  await setProgress(admin, auditId, "generating", "Starting audit…", 5);

  // ── Step 1: Site snapshot ────────────────────────────────────
  // We try to fetch a snapshot, but treat a thin/missing snapshot as
  // a soft signal — not a fatal. Webflow / Cloudflare / Framer /
  // Vercel-protected sites often return < 200 chars to a server fetch
  // even when they're perfectly indexable by Google. Bailing here was
  // failing real audits unnecessarily. Instead we hand Claude the
  // snapshot we DO have (even if empty) plus the live URL, and rely on
  // its web_search tool to fill the gap.
  await setProgress(admin, auditId, "generating", "Fetching site content…", 15);
  let siteSnapshot: string | null = null;
  try {
    siteSnapshot = await fetchSiteSnapshot(audit.site_url);
  } catch (err) {
    // Even a hard fetch error shouldn't kill the audit — Claude can
    // still crawl with web_search. Just note the failure for the prompt.
    console.warn(
      `[seo-audit ${auditId}] snapshot fetch failed (non-fatal):`,
      err instanceof Error ? err.message : err
    );
  }
  const snapshotIsThin = !siteSnapshot || siteSnapshot.length < 200;
  if (snapshotIsThin) {
    console.info(
      `[seo-audit ${auditId}] snapshot thin (${siteSnapshot?.length ?? 0} chars) — Claude will crawl via web_search`
    );
  }

  // ── Step 2: PageSpeed Insights ────────────────────────────────
  await setProgress(admin, auditId, "generating", "Running PageSpeed Insights…", 30);
  let psi: PsiResult | null = null;
  try {
    psi = await runPsi(audit.site_url);
  } catch (err) {
    // PSI failure isn't fatal — the audit can still run on snapshot
    // alone. Log it and continue with psi=null; the skill prompt
    // handles missing data gracefully.
    console.warn(
      `[seo-audit ${auditId}] PSI failed (non-fatal):`,
      err instanceof PsiError ? err.message : err
    );
  }

  // ── Step 3: Sonnet analysis ───────────────────────────────────
  await setProgress(
    admin,
    auditId,
    "generating",
    "Analysing with Claude (Sonnet)…",
    50
  );

  if (!process.env.ANTHROPIC_API_KEY) {
    await failAudit(
      admin,
      auditId,
      "failed",
      "ANTHROPIC_API_KEY not configured on the server."
    );
    return;
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userMessage = buildAuditPrompt({
    siteUrl: audit.site_url,
    siteSnapshot,
    snapshotIsThin,
    psi,
    auditId,
  });

  const sonnetStartedAt = Date.now();
  let assistantText: string;
  try {
    // Web search lets Claude crawl the live site itself. Critical for
    // Webflow / Cloudflare / SPA sites where our server-side snapshot
    // came back thin. Cap at 8 calls — a 9-phase audit needs to look
    // at the homepage + a few key inner pages + competitor SERPs.
    // At ~$0.01/call this caps the surcharge at ~$0.08 per audit on
    // top of token cost.
    //
    // Note: `user_location` is intentionally omitted. Anthropic's
    // web_search tool doesn't accept "IE" (returns 400 at request
    // time — see SUPPORTED_WEB_SEARCH_COUNTRIES in models/anthropic.ts
    // for the allow-list). The skill's system prompt already tells
    // Claude this is an Irish-market audit, so the locale hint is
    // belt-and-braces we don't need.
    const response = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: skill.skill_md,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 8,
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });
    // Concatenate ALL text blocks — when web_search is enabled Claude
    // emits multiple text blocks interleaved with tool_use /
    // tool_result blocks. Picking just the first one drops 80% of the
    // report.
    const textBlocks = response.content.filter((b) => b.type === "text");
    if (textBlocks.length === 0) {
      throw new Error("Claude returned no text content");
    }
    assistantText = textBlocks
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n\n")
      .trim();

    // Count web_search invocations for cost attribution.
    const web_search_calls = response.content.filter(
      (b) => (b as { type?: string }).type === "server_tool_use"
    ).length;

    logAiUsage({
      provider: "anthropic",
      model: response.model ?? SONNET_MODEL,
      feature: "seo_audit",
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      web_search_calls,
      org_id: audit.org_id,
      project_id: audit.project_id,
      duration_ms: Date.now() - sonnetStartedAt,
      success: true,
    });
  } catch (err) {
    logAiUsage({
      provider: "anthropic",
      model: SONNET_MODEL,
      feature: "seo_audit",
      org_id: audit.org_id,
      project_id: audit.project_id,
      duration_ms: Date.now() - sonnetStartedAt,
      success: false,
      error_code: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
    await failAudit(
      admin,
      auditId,
      "failed",
      `Claude analysis failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
    return;
  }

  // ── Step 4: Parse + save ──────────────────────────────────────
  await setProgress(admin, auditId, "generating", "Building report…", 85);

  const { markdown, summary } = parseAuditResponse(assistantText);

  await admin
    .from("seo_audits")
    .update({
      status: "complete",
      report_markdown: markdown,
      report_summary: summary,
      generated_at: new Date().toISOString(),
      progress_step: "Done",
      progress_percent: 100,
      skill_version_id: skill.id,
    })
    .eq("id", auditId);

  // ── Step 5: Self-learning observer (fire-and-forget) ─────────
  // Don't block the user's audit on the observer pass. If it errors
  // we just don't get a learning row this time — the audit is fine.
  void runObserverPass({
    admin,
    client,
    auditId,
    skill,
    siteUrl: audit.site_url,
    auditOutput: markdown,
  }).catch((err) => {
    console.error(`[seo-audit ${auditId}] observer pass failed:`, err);
  });
}

// ── Internal helpers ────────────────────────────────────────────

async function loadActiveSeoSkill(
  admin: SupabaseClient
): Promise<SkillVersion | null> {
  const { data: skill } = await admin
    .from("skills")
    .select("current_version_id")
    .eq("slug", "howl-seo-auditor")
    .eq("status", "active")
    .maybeSingle<{ current_version_id: string | null }>();
  if (!skill?.current_version_id) return null;

  const { data: version } = await admin
    .from("skill_versions")
    .select("id, version_number, skill_md")
    .eq("id", skill.current_version_id)
    .maybeSingle<SkillVersion>();
  return version ?? null;
}

async function setProgress(
  admin: SupabaseClient,
  auditId: string,
  status: string,
  step: string,
  percent: number
): Promise<void> {
  await admin
    .from("seo_audits")
    .update({
      status,
      progress_step: step,
      progress_percent: percent,
    })
    .eq("id", auditId);
}

async function failAudit(
  admin: SupabaseClient,
  auditId: string,
  status: "failed" | "unavailable",
  message: string
): Promise<void> {
  await admin
    .from("seo_audits")
    .update({
      status,
      error_message: message,
      progress_step: null,
      progress_percent: null,
    })
    .eq("id", auditId);
}

/**
 * Build the user message we send to Claude. The skill_md is the
 * system prompt — it tells Claude how to think about an SEO audit.
 * The user message is the data-only payload: which site, what we
 * scraped, what PSI returned.
 *
 * The skill expects the platform-mode JSON contract from
 * AGENT_SDK_INTEGRATION.md, so we emit our request in that exact
 * shape: a `Platform audit request:` preamble + JSON.
 */
function buildAuditPrompt(args: {
  siteUrl: string;
  siteSnapshot: string | null;
  snapshotIsThin: boolean;
  psi: PsiResult | null;
  auditId: string;
}): string {
  const { siteUrl, siteSnapshot, snapshotIsThin, psi, auditId } = args;
  const intake = {
    url: siteUrl,
    audit_type: "full",
    client_id: auditId,
  };

  const psiBlock = psi
    ? `\n\nPageSpeed Insights data:\n${JSON.stringify(psi, null, 2)}`
    : "\n\nPageSpeed Insights: data unavailable (site may be blocking the Lighthouse user agent)";

  // Three states for the snapshot block:
  //   - We have a full snapshot (>= 200 chars) → embed it
  //   - We have a thin snapshot (< 200 chars but not null) → embed it
  //     with a note explaining it's incomplete
  //   - Snapshot is null (fetch threw) → tell Claude to crawl directly
  // In ALL cases the web_search tool is available, so Claude can fill
  // in gaps by visiting the live URL itself.
  const snapshotBlock = (() => {
    if (siteSnapshot && !snapshotIsThin) {
      return [
        "Site snapshot (server-fetched HTML, scripts/styles stripped):",
        "```",
        siteSnapshot.slice(0, 8000),
        "```",
      ].join("\n");
    }
    if (siteSnapshot) {
      return [
        "Site snapshot (PARTIAL — server fetch returned thin content,",
        "likely Webflow/Cloudflare/Framer/SPA. Use web_search to crawl",
        "the live site for the rest):",
        "```",
        siteSnapshot.slice(0, 8000),
        "```",
      ].join("\n");
    }
    return [
      "Site snapshot: UNAVAILABLE — server-side fetch was blocked or",
      "returned no usable HTML. Use the web_search tool to crawl the",
      "live site (homepage + key inner pages) to get the content you",
      "need for the audit.",
    ].join("\n");
  })();

  return [
    "Platform audit request:",
    "",
    "```json",
    JSON.stringify(intake, null, 2),
    "```",
    "",
    snapshotBlock,
    psiBlock,
    "",
    "You have the web_search tool available. Use it to:",
    `  • Crawl ${siteUrl} (homepage + 2-4 key inner pages) for content,`,
    "    titles, meta descriptions, and structure when the snapshot is",
    "    thin or missing.",
    "  • Check Irish-market competitor presence (search 'site:.ie ...').",
    "  • Verify recent SEO best practice claims if you cite them.",
    "Cap your searches at 8 — be deliberate, not exhaustive.",
    "",
    "Produce the full SEO audit per your methodology. Output the",
    "Markdown report first, then end with the JSON summary block as",
    "specified in your Platform Mode Contract.",
  ].join("\n");
}

/**
 * Pull the markdown report + the JSON summary from the assistant
 * response. The skill emits the JSON as a fenced ```json block at
 * the very end, so we strip it from the markdown and parse separately.
 */
function parseAuditResponse(text: string): {
  markdown: string;
  summary: Record<string, unknown> | null;
} {
  // Match the LAST ```json ... ``` block — the skill puts its
  // structured summary at the very end.
  const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```\s*$/i;
  const match = text.match(jsonBlockRegex);

  let summary: Record<string, unknown> | null = null;
  let markdown = text.trim();

  if (match) {
    try {
      summary = JSON.parse(match[1]) as Record<string, unknown>;
      // Strip the JSON block from the end so the markdown view doesn't
      // show it — the summary becomes the structured metadata.
      markdown = text.slice(0, match.index).trim();
    } catch {
      // Skill emitted something that looked like JSON but didn't parse.
      // Keep the raw response in markdown and leave summary null.
    }
  }

  return { markdown, summary };
}

/**
 * Self-learning observer pass.
 *
 * After each successful audit, ask Claude:
 *   "Looking at the audit you just produced + current best practices
 *    in the active skill content, did you observe any new SEO patterns
 *    that aren't yet captured? List 0-3 concrete, evidenced patterns."
 *
 * Each observation goes to skill_learnings with status='pending'.
 * Admin reviews + accepts via /admin/skills/learnings.
 */
async function runObserverPass(args: {
  admin: SupabaseClient;
  client: Anthropic;
  auditId: string;
  skill: SkillVersion;
  siteUrl: string;
  auditOutput: string;
}): Promise<void> {
  const { admin, client, auditId, skill, siteUrl, auditOutput } = args;

  const systemPrompt = `You are observing an SEO auditor's work to improve the skill over time. Your job:

Given the audit output and the skill content that produced it, identify 0-3 SEO PATTERNS or RECENT BEST PRACTICES that are NOT yet captured in the skill content.

Each observation must be:
- Concrete and actionable (not generic advice)
- Evidenced — cite a specific signal in the audit data, the site, or known recent change (e.g. "Google's March 2026 helpful content update prioritises X")
- Novel — only include if it's genuinely missing from the existing skill
- High-confidence — only include patterns you'd defend in front of an SEO professional

If nothing meets that bar, return an empty array. Quality > quantity.

Return ONLY this JSON, no markdown fences, no commentary:
{
  "learnings": [
    {
      "observation": "...",
      "suggested_location": "Phase 5 / Technical SEO / Core Web Vitals" | "Phase 7 / AI Resilience" | etc,
      "suggested_diff": "Exact text to add to the skill",
      "evidence_url": "https://...",
      "confidence": 0.0-1.0
    }
  ]
}`;

  const userMessage = `Active skill content (truncated to first 8k chars):
\`\`\`markdown
${skill.skill_md.slice(0, 8000)}
\`\`\`

Audit output (truncated to first 6k chars):
\`\`\`markdown
${auditOutput.slice(0, 6000)}
\`\`\`

Audited site: ${siteUrl}

Return the JSON.`;

  const startedAt = Date.now();
  let response;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    logAiUsage({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      feature: "seo_observer",
      duration_ms: Date.now() - startedAt,
      success: false,
      error_code: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
    return;
  }
  logAiUsage({
    provider: "anthropic",
    model: response.model,
    feature: "seo_observer",
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    duration_ms: Date.now() - startedAt,
    success: true,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return;
  const raw = textBlock.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: { learnings?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(
      `[seo-audit ${auditId}] observer pass: couldn't parse JSON`
    );
    return;
  }
  if (!Array.isArray(parsed.learnings) || parsed.learnings.length === 0) return;

  // Find the skill row for the FK.
  const { data: skillRow } = await admin
    .from("skills")
    .select("id")
    .eq("slug", "howl-seo-auditor")
    .maybeSingle<{ id: string }>();
  if (!skillRow) return;

  type Learning = {
    observation?: unknown;
    suggested_location?: unknown;
    suggested_diff?: unknown;
    evidence_url?: unknown;
    confidence?: unknown;
  };

  const rows = (parsed.learnings as Learning[])
    .filter((l): l is Learning & { observation: string } =>
      typeof l.observation === "string" && l.observation.length > 10
    )
    .map((l) => ({
      skill_id: skillRow.id,
      observed_against_version_id: skill.id,
      source_audit_id: auditId,
      observation: String(l.observation).slice(0, 2000),
      suggested_location:
        typeof l.suggested_location === "string"
          ? l.suggested_location.slice(0, 200)
          : null,
      suggested_diff:
        typeof l.suggested_diff === "string"
          ? l.suggested_diff.slice(0, 4000)
          : null,
      evidence_url:
        typeof l.evidence_url === "string"
          ? l.evidence_url.slice(0, 500)
          : null,
      confidence:
        typeof l.confidence === "number" &&
        l.confidence >= 0 &&
        l.confidence <= 1
          ? l.confidence
          : null,
      status: "pending" as const,
    }));

  if (rows.length > 0) {
    await admin.from("skill_learnings").insert(rows);
  }
}
