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
import { resolveAdapters, AdapterError, type ModelSource } from "@/lib/models";
import type { AIModel, Prompt, Competitor } from "@/lib/types";
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

const ANALYSIS_SYSTEM = `You analyse an AI model's response to a marketing-research prompt and return structured JSON about brand mentions.

Given a brand name, a list of tracked competitor brands, and the response text, return ONLY the following JSON (no markdown fences):
{
  "brand_mentioned": boolean,
  "mention_position": number | null,
  "sentiment": "positive" | "neutral" | "negative" | null
}

Rules:
- brand_mentioned is true if the brand name (or a close variant) appears anywhere in the text.
- mention_position is 1-indexed across ALL brands mentioned in the text (including brands NOT in the tracked competitor list). Set to null if brand_mentioned is false.
- sentiment reflects how the response describes the brand. "positive" = recommended, praised, trusted. "neutral" = listed factually, mentioned without evaluative language. "negative" = criticised, warned against, contrasted unfavourably. Set to null if brand_mentioned is false.
- Do NOT return citations or URLs; those are captured upstream.`;

// Helper: normalise a hostname for comparison (no www, lowercase).
function normDomain(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const host = new URL(u.startsWith("http") ? u : `https://${u}`).hostname;
    return host.replace(/^www\./, "").toLowerCase();
  } catch {
    return u.replace(/^https?:\/\//, "").replace(/^www\./, "").toLowerCase();
  }
}

function tagSources(
  sources: ModelSource[],
  brandDomain: string | null,
  competitorDomains: { domain: string }[]
): RunResult["sources"] {
  const compSet = new Set(
    competitorDomains.map((c) => c.domain).filter((d): d is string => Boolean(d))
  );
  return sources.map((s) => {
    const d = s.domain.toLowerCase();
    return {
      ...s,
      is_brand_domain: Boolean(brandDomain && d === brandDomain),
      is_competitor_domain: compSet.has(d),
    };
  });
}

async function analyseResponse(
  anthropic: Anthropic,
  brandName: string,
  competitorNames: string[],
  responseText: string
): Promise<{
  brand_mentioned: boolean;
  mention_position: number | null;
  sentiment: "positive" | "neutral" | "negative" | null;
}> {
  if (!responseText.trim()) {
    return { brand_mentioned: false, mention_position: null, sentiment: null };
  }

  const analysis = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: ANALYSIS_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Brand: "${brandName}"
Competitors: ${competitorNames.length ? competitorNames.join(", ") : "none"}

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

  try {
    const parsed = JSON.parse(cleaned);
    return {
      brand_mentioned: Boolean(parsed.brand_mentioned),
      mention_position:
        typeof parsed.mention_position === "number"
          ? parsed.mention_position
          : null,
      sentiment:
        parsed.sentiment === "positive" ||
        parsed.sentiment === "neutral" ||
        parsed.sentiment === "negative"
          ? parsed.sentiment
          : null,
    };
  } catch {
    return { brand_mentioned: false, mention_position: null, sentiment: null };
  }
}

export async function executeRun(
  projectId: string,
  brandName: string,
  websiteUrl: string | null,
  prompts: Prompt[],
  models: AIModel[],
  competitors: Competitor[],
  onProgress?: ProgressCallback
): Promise<{ runId: string; resultCount: number }> {
  const admin = createAdminClient();
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const emit = onProgress ?? (() => {});

  // Resolve which of the requested models we can actually run.
  const { available, missing, unimplemented } = resolveAdapters(models);

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
  const brandDomain = normDomain(websiteUrl);
  const competitorDomains = competitors
    .map((c) => ({ domain: normDomain(c.website_url) ?? "" }))
    .filter((c) => c.domain);
  const competitorNames = competitors.map((c) => c.name);

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

      for (const adapter of available) {
        stepCount++;
        const modelLabel = MODEL_LABELS[adapter.name] ?? adapter.name;

        try {
          // Step A — real provider call with web search.
          const modelResponse = await adapter.query(prompt.text, {
            country: "IE", // TODO: per-prompt country once schema lands
            marketContext: "Irish market",
          });

          // Step B — Claude analysis for brand + sentiment + position.
          // (Source extraction is already done by the adapter.)
          const analysis = await analyseResponse(
            anthropic,
            brandName,
            competitorNames,
            modelResponse.text
          );

          const taggedSources = tagSources(
            modelResponse.sources,
            brandDomain,
            competitorDomains
          );

          const result: RunResult = {
            prompt_id: prompt.id,
            model: adapter.name,
            model_version: modelResponse.model_version,
            brand_mentioned: analysis.brand_mentioned,
            mention_position: analysis.mention_position,
            sentiment: analysis.sentiment,
            response_snippet: modelResponse.text.slice(0, 500),
            sources: taggedSources,
          };

          allResults.push(result);

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
          });

          emit({
            type: "model_error",
            message: `${modelLabel}: ${errMsg.slice(0, 100)}`,
            current: stepCount,
            total: totalSteps,
            detail: { prompt: prompt.text, model: modelLabel },
          });
        }
      }
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
