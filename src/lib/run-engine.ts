/**
 * CMO.ie Daily Run Engine
 *
 * Executes real visibility checks across AI models for a project's prompts.
 * For each prompt × model combination:
 *   1. Calls the real provider via its adapter (Claude, ChatGPT, Gemini,
 *      Perplexity — all with web search / grounding enabled).
 *   2. Analyses the returned text with Claude to extract brand-mention,
 *      position, and sentiment.
 *   3. Persists results + sources (cited inline vs retrieved) to Supabase.
 *
 * Contrast with the previous version (pre-migration 005) which used
 * Claude Haiku to *roleplay* as each model. See
 * docs/data-collection-sources.md for the audit that drove the rewrite.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveAdapters,
  AdapterError,
  type ApiKeyOverrides,
  type ModelSource,
} from "@/lib/models";
import {
  matchBrands,
  findTrackedBrandMatch,
  type MatchableBrand,
  type BrandMatch,
} from "@/lib/brand-matching";
import type { AIModel, Prompt, Competitor, Project } from "@/lib/types";
import { MODEL_LABELS } from "@/lib/types";

// ── Types ──

interface RunResult {
  prompt_id: string;
  model: AIModel;
  model_version: string;
  brand_mentioned: boolean;
  mention_position: number | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  response_snippet: string;
  sources: (ModelSource & {
    is_brand_domain: boolean;
    is_competitor_domain: boolean;
  })[];
  /** Every brand named in the response, ordered by first mention. Persisted into result_brand_mentions. */
  brand_mentions: BrandMatch[];
}

export type ProgressCallback = (event: {
  type:
    | "start"
    | "prompt_start"
    | "model_done"
    | "model_error"
    | "model_skipped"
    | "saving"
    | "complete"
    | "error";
  message: string;
  current?: number;
  total?: number;
  detail?: {
    prompt?: string;
    model?: string;
    brand_mentioned?: boolean;
    sentiment?: string;
    citationCount?: number;
  };
}) => void;

// ── Analysis prompt ──
// Kept on Claude Haiku — it's a structured-extraction task where Haiku
// is both fast and cheap enough. We only ask for brand mention, position
// and sentiment now; source extraction is handled natively by each
// adapter so we don't need Claude to re-parse URLs.

// Brand detection is now handled deterministically by lib/brand-matching
// using tracked_name + aliases + regex. Claude is only used for sentiment
// — a task that genuinely needs LLM nuance. This collapses the analysis
// call from ~4 classifications to 1, and makes position ranking exact
// instead of Claude's approximation.
const SENTIMENT_SYSTEM = `You analyse an AI model's response and score the sentiment toward one specific brand.

Return ONLY this JSON (no markdown fences):
{ "sentiment": "positive" | "neutral" | "negative" | null }

Rules:
- "positive" = the response recommends, praises, or endorses the brand ("leading", "trusted", "best-in-class").
- "neutral"  = the brand is mentioned factually without evaluative language.
- "negative" = the response criticises, warns against, or contrasts the brand unfavourably.
- null       = the brand is not meaningfully discussed (e.g. only appears as a URL).`;

// Helper: normalise a hostname for comparison (no www, lowercase).
// Exported for tests — no external callers should rely on this.
export function normDomain(u: string | null | undefined): string | null {
  if (!u) return null;
  // Case-insensitive scheme check: "HTTPS://…" and "http://…" both count
  // as "already has a scheme". Otherwise we'd prefix `https://` onto an
  // already-prefixed upper-case URL and end up with `https://HTTPS://…`,
  // which then parses with hostname "https".
  const hasScheme = /^https?:\/\//i.test(u);
  try {
    const host = new URL(hasScheme ? u : `https://${u}`).hostname;
    return host.replace(/^www\./, "").toLowerCase();
  } catch {
    return u
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .toLowerCase();
  }
}

export function tagSources(
  sources: ModelSource[],
  brandDomains: Set<string>,
  competitorDomains: { domain: string }[]
): RunResult["sources"] {
  const compSet = new Set(
    competitorDomains.map((c) => c.domain).filter((d): d is string => Boolean(d))
  );
  return sources.map((s) => {
    const d = s.domain.toLowerCase();
    return {
      ...s,
      is_brand_domain: brandDomains.has(d),
      is_competitor_domain: compSet.has(d),
    };
  });
}

/**
 * Build the list of MatchableBrand objects for a project — the tracked
 * brand plus every competitor. Used by the run engine's analysis step.
 *
 * Exported for tests; also useful anywhere that wants to re-run brand
 * matching against an arbitrary text (e.g. historical backfills).
 */
export function buildMatchables(
  project: Pick<
    Project,
    | "id"
    | "brand_display_name"
    | "brand_tracked_name"
    | "brand_aliases"
    | "brand_regex_pattern"
  > & {
    brand_name?: string;
  },
  competitors: Competitor[]
): MatchableBrand[] {
  // `||` (not `??`) so that empty strings from partially-migrated rows
  // also fall through to the legacy `name` / `brand_name` columns.
  return [
    {
      id: "project",
      display_name: project.brand_display_name || project.brand_name || "",
      tracked_name: project.brand_tracked_name || project.brand_name || "",
      aliases: project.brand_aliases ?? [],
      regex_pattern: project.brand_regex_pattern ?? null,
      is_tracked_brand: true,
    },
    ...competitors.map((c) => ({
      id: c.id,
      display_name: c.display_name || c.name,
      tracked_name: c.tracked_name || c.name,
      aliases: c.aliases ?? [],
      regex_pattern: c.regex_pattern ?? null,
      is_tracked_brand: false,
    })),
  ];
}

/**
 * Sentiment-only analysis: asks Claude how positively the tracked brand
 * is described, given that we've already confirmed via matchBrands()
 * that the brand is mentioned. Returns null when the brand isn't in the
 * text (skipping the API call entirely).
 */
async function sentimentForTrackedBrand(
  anthropic: Anthropic,
  trackedBrandName: string,
  responseText: string,
  trackedBrandMatched: boolean
): Promise<"positive" | "neutral" | "negative" | null> {
  if (!trackedBrandMatched || !responseText.trim()) return null;

  try {
    const analysis = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system: SENTIMENT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Brand: "${trackedBrandName}"

Response to analyse:
---
${responseText.slice(0, 6000)}
---

Return JSON only.`,
        },
      ],
    });

    const raw =
      analysis.content.find((b) => b.type === "text")?.type === "text"
        ? (
            analysis.content.find((b) => b.type === "text") as {
              type: "text";
              text: string;
            }
          ).text
        : "{}";

    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (
      parsed.sentiment === "positive" ||
      parsed.sentiment === "neutral" ||
      parsed.sentiment === "negative"
    ) {
      return parsed.sentiment;
    }
    return null;
  } catch {
    // Never fail the run on a sentiment-analysis hiccup.
    return null;
  }
}

/**
 * Fetch the BYOK API keys stored on the project's organisation.
 * Returns a sparse override map keyed by AIModel — callers merge this
 * into the adapter resolution + query calls.
 *
 * Keys present here take precedence over CMO.ie-managed env-var keys.
 * On trial plans, org keys are mandatory (the org has no access to
 * managed keys); on paid plans, they're an optional override for power
 * users who want to use their own billing with the provider.
 */
async function loadOrgApiKeys(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string
): Promise<ApiKeyOverrides> {
  const { data: project } = await admin
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.org_id) return {};

  const { data: org } = await admin
    .from("organisations")
    .select(
      "anthropic_api_key, openai_api_key, google_api_key, perplexity_api_key"
    )
    .eq("id", project.org_id)
    .maybeSingle();
  if (!org) return {};

  const overrides: ApiKeyOverrides = {};
  if (org.anthropic_api_key) overrides.claude = org.anthropic_api_key;
  if (org.openai_api_key) overrides.chatgpt = org.openai_api_key;
  if (org.google_api_key) overrides.gemini = org.google_api_key;
  if (org.perplexity_api_key) overrides.perplexity = org.perplexity_api_key;
  return overrides;
}

/**
 * Subset of the Project shape the run engine actually needs. Accepting
 * a partial type rather than the full record keeps callers flexible
 * (they can pass a lean projection) and decouples the run engine from
 * the full DB schema.
 */
type RunEngineProject = Pick<
  Project,
  | "id"
  | "brand_name"
  | "website_url"
  | "brand_display_name"
  | "brand_tracked_name"
  | "brand_aliases"
  | "brand_regex_pattern"
  | "brand_domains"
>;

export async function executeRun(
  project: RunEngineProject,
  prompts: Prompt[],
  models: AIModel[],
  competitors: Competitor[],
  onProgress?: ProgressCallback
): Promise<{ runId: string; resultCount: number }> {
  const admin = createAdminClient();
  const projectId = project.id;
  const websiteUrl = project.website_url;

  // Load any BYOK overrides for this project's org. Empty object means
  // every model falls back to CMO.ie-managed env-var keys.
  const apiKeys = await loadOrgApiKeys(admin, projectId);

  // Analysis step uses the org's Anthropic key when set (keeps BYOK
  // semantics consistent — the org's own account is charged), else the
  // managed key.
  const anthropic = new Anthropic({
    apiKey: apiKeys.claude ?? process.env.ANTHROPIC_API_KEY!,
  });

  const emit = onProgress ?? (() => {});

  // Resolve which of the requested models we can actually run. Org
  // overrides let an adapter light up even when its env-var key is unset.
  const { available, missing, unimplemented } = resolveAdapters(models, {
    apiKeys,
  });

  if (available.length === 0) {
    throw new Error(
      `No model adapters available. Missing API keys for: ${[
        ...missing,
        ...unimplemented,
      ].join(", ") || "all requested models"}`
    );
  }

  const activePrompts = prompts.filter((p) => p.is_active);
  const totalSteps = activePrompts.length * available.length;
  const today = new Date().toISOString().split("T")[0];

  emit({
    type: "start",
    message: `Starting run: ${activePrompts.length} prompts × ${available.length} models = ${totalSteps} checks${
      missing.length || unimplemented.length
        ? ` (skipping: ${[...missing, ...unimplemented].join(", ")})`
        : ""
    }`,
    total: totalSteps,
    current: 0,
  });

  // Upsert today's run row.
  const { data: existingRun } = await admin
    .from("daily_runs")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("run_date", today)
    .maybeSingle();

  let run: { id: string };

  if (existingRun) {
    const { data: oldResults } = await admin
      .from("results")
      .select("id")
      .eq("run_id", existingRun.id);
    if (oldResults && oldResults.length > 0) {
      const ids = oldResults.map((r) => r.id);
      await admin.from("citations").delete().in("result_id", ids);
      await admin.from("results").delete().eq("run_id", existingRun.id);
    }
    await admin
      .from("daily_runs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        completed_at: null,
      })
      .eq("id", existingRun.id);
    run = { id: existingRun.id };
  } else {
    const { data: newRun, error: runError } = await admin
      .from("daily_runs")
      .insert({
        project_id: projectId,
        run_date: today,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (runError || !newRun) {
      throw new Error(`Failed to create run: ${runError?.message}`);
    }
    run = newRun;
  }

  const runId = run.id;

  // Domains come from the upgraded brand_domains / competitor.domains
  // arrays (migration 006) with a fallback to the legacy website_url
  // column for projects that haven't been re-indexed yet.
  const brandDomains = new Set(
    [
      ...(project.brand_domains ?? []),
      normDomain(websiteUrl) ?? "",
    ].filter((d): d is string => Boolean(d))
  );
  const competitorDomainsByCompetitor: { id: string; domain: string }[] = [];
  for (const c of competitors) {
    const domains =
      c.domains && c.domains.length
        ? c.domains
        : ([normDomain(c.website_url)].filter(Boolean) as string[]);
    for (const d of domains) competitorDomainsByCompetitor.push({ id: c.id, domain: d });
  }
  const competitorDomains = competitorDomainsByCompetitor.map((c) => ({
    domain: c.domain,
  }));

  // Brand matching setup — built once per run and reused for every
  // (prompt × model) combination.
  const matchables = buildMatchables(project, competitors);
  const trackedBrandName = project.brand_tracked_name ?? project.brand_name;

  const allResults: RunResult[] = [];
  let stepCount = 0;

  try {
    for (const prompt of activePrompts) {
      emit({
        type: "prompt_start",
        message: `Checking prompt: "${prompt.text.slice(0, 60)}..."`,
        current: stepCount,
        total: totalSteps,
        detail: { prompt: prompt.text },
      });

      // Run all adapters concurrently for this prompt. Each adapter hits
      // a different provider so rate limits don't conflict; the only
      // shared provider is Anthropic (used both as a model and for the
      // analysis step), and its limits are generous enough to absorb
      // ~4-5 concurrent requests per prompt. Prompts remain sequential
      // to bound peak concurrency regardless of prompt count.
      await Promise.all(
        available.map(async (adapter) => {
          const modelLabel = MODEL_LABELS[adapter.name] ?? adapter.name;

          try {
            // Step A — real provider call with web search. Pass the
            // org's BYOK key when one exists for this model; otherwise
            // the adapter falls back to the managed env-var key.
            const modelResponse = await adapter.query(prompt.text, {
              country: "IE", // TODO: per-prompt country once schema lands
              marketContext: "Irish market",
              apiKey: apiKeys[adapter.name],
            });

            // Step B — Deterministic brand matching using tracked_name +
            // aliases + regex. We no longer ask Claude to detect brands,
            // only to score sentiment on our tracked brand IF it's
            // mentioned. Position ordering is computed directly from
            // match offsets in the response text.
            const brandMatches = matchBrands(matchables, modelResponse.text);
            const trackedMatch = findTrackedBrandMatch(brandMatches);

            const sentiment = await sentimentForTrackedBrand(
              anthropic,
              trackedBrandName,
              modelResponse.text,
              trackedMatch !== null
            );

            const taggedSources = tagSources(
              modelResponse.sources,
              brandDomains,
              competitorDomains
            );

            const result: RunResult = {
              prompt_id: prompt.id,
              model: adapter.name,
              model_version: modelResponse.model_version,
              brand_mentioned: trackedMatch !== null,
              mention_position: trackedMatch?.position ?? null,
              sentiment,
              response_snippet: modelResponse.text.slice(0, 500),
              sources: taggedSources,
              brand_mentions: brandMatches,
            };

            // stepCount is incremented at completion time (not start time)
            // so the emit reflects actual work done. Safe without locks —
            // JS is single-threaded at the microtask boundary.
            allResults.push(result);
            stepCount++;

            emit({
              type: "model_done",
              message: `${modelLabel}: ${
                result.brand_mentioned
                  ? `Mentioned${result.mention_position ? ` (position #${result.mention_position})` : ""}`
                  : "Not mentioned"
              }${result.sentiment ? `, ${result.sentiment}` : ""} — ${
                taggedSources.length
              } sources (${taggedSources.filter((s) => s.cited_inline).length} cited inline)`,
              current: stepCount,
              total: totalSteps,
              detail: {
                prompt: prompt.text,
                model: modelLabel,
                brand_mentioned: result.brand_mentioned,
                sentiment: result.sentiment ?? undefined,
                citationCount: taggedSources.length,
              },
            });
          } catch (err) {
            const errMsg =
              err instanceof AdapterError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : String(err);
            console.error(
              `Run ${runId}: ${adapter.name}/${prompt.id} failed:`,
              errMsg
            );

            allResults.push({
              prompt_id: prompt.id,
              model: adapter.name,
              model_version: "error",
              brand_mentioned: false,
              mention_position: null,
              sentiment: null,
              response_snippet: `[Error: ${errMsg.slice(0, 200)}]`,
              sources: [],
              brand_mentions: [],
            });
            stepCount++;

            emit({
              type: "model_error",
              message: `${modelLabel}: ${errMsg.slice(0, 100)}`,
              current: stepCount,
              total: totalSteps,
              detail: { prompt: prompt.text, model: modelLabel },
            });
          }
        })
      );
    }

    // Persist results + sources.
    emit({
      type: "saving",
      message: `Saving ${allResults.length} results to database...`,
      current: totalSteps,
      total: totalSteps,
    });

    const resultInserts = allResults.map((r) => ({
      run_id: runId,
      prompt_id: r.prompt_id,
      model: r.model,
      model_version: r.model_version,
      brand_mentioned: r.brand_mentioned,
      mention_position: r.mention_position,
      sentiment: r.sentiment,
      response_snippet: r.response_snippet,
    }));

    const { data: insertedResults, error: resultsError } = await admin
      .from("results")
      .insert(resultInserts)
      .select("id, prompt_id, model");

    if (resultsError) {
      throw new Error(`Failed to insert results: ${resultsError.message}`);
    }

    const citationInserts: {
      result_id: string;
      url: string;
      domain: string;
      is_brand_domain: boolean;
      is_competitor_domain: boolean;
      position: number;
      was_cited_inline: boolean;
    }[] = [];

    for (const result of allResults) {
      const matched = insertedResults?.find(
        (ir) => ir.prompt_id === result.prompt_id && ir.model === result.model
      );
      if (!matched) continue;
      for (const s of result.sources) {
        citationInserts.push({
          result_id: matched.id,
          url: s.url,
          domain: s.domain,
          is_brand_domain: s.is_brand_domain,
          is_competitor_domain: s.is_competitor_domain,
          position: s.position,
          was_cited_inline: s.cited_inline,
        });
      }
    }

    if (citationInserts.length > 0) {
      const { error: citationsError } = await admin
        .from("citations")
        .insert(citationInserts);
      if (citationsError) {
        console.error("Failed to insert citations:", citationsError);
      }
    }

    // Persist per-response brand mentions — the data SoV, gap analysis,
    // and per-brand detail pages consume.
    const mentionInserts: {
      result_id: string;
      brand_name: string;
      competitor_id: string | null;
      is_tracked_brand: boolean;
      position: number;
      sentiment: "positive" | "neutral" | "negative" | null;
    }[] = [];
    for (const result of allResults) {
      const matched = insertedResults?.find(
        (ir) => ir.prompt_id === result.prompt_id && ir.model === result.model
      );
      if (!matched) continue;
      for (const m of result.brand_mentions) {
        const isTracked = m.brand.is_tracked_brand === true;
        mentionInserts.push({
          result_id: matched.id,
          brand_name: m.brand.display_name,
          competitor_id: isTracked ? null : (m.brand.id as string),
          is_tracked_brand: isTracked,
          position: m.position,
          // For now only the tracked brand gets a sentiment score (it's
          // the one the existing Claude analysis focuses on). Per-brand
          // sentiment for competitors can come in a follow-up.
          sentiment: isTracked ? (result.sentiment ?? null) : null,
        });
      }
    }
    if (mentionInserts.length > 0) {
      const { error: mentionsError } = await admin
        .from("result_brand_mentions")
        .insert(mentionInserts);
      if (mentionsError) {
        console.error("Failed to insert brand mentions:", mentionsError);
      }
    }

    await admin
      .from("daily_runs")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    const successResults = allResults.filter(
      (r) => !r.response_snippet.startsWith("[Error")
    );
    const mentioned = successResults.filter((r) => r.brand_mentioned).length;
    const visScore = successResults.length
      ? Math.round((mentioned / successResults.length) * 100)
      : 0;

    emit({
      type: "complete",
      message: `Run complete. Visibility ${visScore}% (${mentioned}/${successResults.length} mentions). ${citationInserts.length} sources recorded across ${available.length} models.`,
      current: totalSteps,
      total: totalSteps,
    });

    return { runId, resultCount: allResults.length };
  } catch (err) {
    await admin
      .from("daily_runs")
      .update({ status: "failed" })
      .eq("id", runId);
    emit({
      type: "error",
      message: err instanceof Error ? err.message : "Run failed",
    });
    throw err;
  }
}
