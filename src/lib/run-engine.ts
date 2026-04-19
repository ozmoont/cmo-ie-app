/**
 * CMO.ie Daily Run Engine
 *
 * Executes visibility checks across AI models for a project's prompts.
 * For each prompt × model combination:
 *   1. Queries the AI model
 *   2. Checks if the brand is mentioned
 *   3. Extracts sentiment
 *   4. Extracts cited URLs/domains
 *   5. Stores results + citations in Supabase
 */

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AIModel, Prompt, Competitor } from "@/lib/types";
import { MODEL_LABELS } from "@/lib/types";

// ── Types ──

interface RunResult {
  prompt_id: string;
  model: AIModel;
  brand_mentioned: boolean;
  mention_position: number | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  response_snippet: string;
  citations: {
    url: string;
    domain: string;
    is_brand_domain: boolean;
    is_competitor_domain: boolean;
    position: number;
  }[];
}

export type ProgressCallback = (event: {
  type: "start" | "prompt_start" | "model_done" | "model_error" | "saving" | "complete" | "error";
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

// ── System Prompts ──

const QUERY_SYSTEM = `You are simulating how different AI search engines respond to user queries.
You will be told which AI model to simulate (ChatGPT, Perplexity, Gemini, Google AI Overviews, or Claude).
Respond AS that model would - with the style, format, and citation patterns typical of that model.

Important:
- Perplexity always cites sources with URLs
- ChatGPT gives conversational answers, sometimes with recommendations
- Google AI Overviews gives concise summaries with source links
- Gemini gives detailed answers with occasional citations
- Claude gives thorough, balanced answers

Respond naturally to the user's question. Include real-sounding company names, websites, and recommendations that would be typical for this type of query in the Irish market. Do NOT artificially insert or exclude any particular brand - respond as the real model would based on what's publicly known.`;

const ANALYSIS_SYSTEM = `You analyse AI model responses to detect brand mentions, sentiment, and citations.

Given a brand name, competitor names, and an AI response, return JSON (no markdown fences):
{
  "brand_mentioned": boolean,
  "mention_position": number | null (1 = first mentioned, 2 = second, etc. null if not mentioned),
  "sentiment": "positive" | "neutral" | "negative" | null (null if brand not mentioned),
  "citations": [
    {
      "url": string (full URL if present, or construct from domain),
      "domain": string (e.g. "acmelegal.ie"),
      "is_brand_domain": boolean,
      "is_competitor_domain": boolean,
      "position": number (order of appearance, 1-indexed)
    }
  ]
}

Rules:
- brand_mentioned is true if the brand name appears anywhere in the response (case-insensitive)
- mention_position counts all companies/brands mentioned in order
- sentiment is about how the brand is portrayed (positive = recommended, neutral = just listed, negative = criticized)
- Extract ALL URLs and domains mentioned, even if just as text references
- Check each domain against the brand's website and competitor websites`;

const MODEL_STYLES: Record<AIModel, string> = {
  chatgpt: "ChatGPT (conversational, helpful, sometimes recommends specific companies)",
  perplexity: "Perplexity (always cites sources with [1] [2] style references and URLs, research-focused)",
  google_aio: "Google AI Overviews (concise summary, pulls from top search results, shows source links)",
  gemini: "Gemini (detailed, balanced, occasionally cites sources)",
  claude: "Claude (thorough, balanced, mentions companies when relevant)",
};

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

  const activePrompts = prompts.filter((p) => p.is_active);
  const totalSteps = activePrompts.length * models.length;

  const emit = onProgress ?? (() => {});

  emit({
    type: "start",
    message: `Starting run: ${activePrompts.length} prompts × ${models.length} models = ${totalSteps} checks`,
    total: totalSteps,
    current: 0,
  });

  const today = new Date().toISOString().split("T")[0];

  // 1. Check if a run already exists for today
  const { data: existingRun } = await admin
    .from("daily_runs")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("run_date", today)
    .single();

  let run: { id: string };

  if (existingRun) {
    const { data: oldResults } = await admin
      .from("results")
      .select("id")
      .eq("run_id", existingRun.id);

    if (oldResults && oldResults.length > 0) {
      const oldResultIds = oldResults.map((r) => r.id);
      await admin.from("citations").delete().in("result_id", oldResultIds);
      await admin.from("results").delete().eq("run_id", existingRun.id);
    }

    await admin
      .from("daily_runs")
      .update({ status: "running", started_at: new Date().toISOString(), completed_at: null })
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
  const allResults: RunResult[] = [];
  let stepCount = 0;

  try {
    // 2. For each prompt × model, query and analyse
    for (const prompt of activePrompts) {
      emit({
        type: "prompt_start",
        message: `Checking prompt: "${prompt.text.slice(0, 60)}..."`,
        current: stepCount,
        total: totalSteps,
        detail: { prompt: prompt.text },
      });

      for (const model of models) {
        stepCount++;
        const modelLabel = MODEL_LABELS[model] ?? model;

        try {
          // ── Cache check: reuse recent result for same prompt text + model ──
          const cacheHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
          const { data: cachedResults } = await admin
            .from("results")
            .select("brand_mentioned, mention_position, sentiment, response_snippet, id")
            .eq("prompt_id", prompt.id)
            .eq("model", model)
            .gte("created_at", cacheHoursAgo)
            .order("created_at", { ascending: false })
            .limit(1);

          if (
            cachedResults &&
            cachedResults.length > 0 &&
            cachedResults[0].response_snippet &&
            !cachedResults[0].response_snippet.startsWith("[Error")
          ) {
            const cached = cachedResults[0];
            // Fetch cached citations too
            const { data: cachedCitations } = await admin
              .from("citations")
              .select("url, domain, is_brand_domain, is_competitor_domain, position")
              .eq("result_id", cached.id);

            allResults.push({
              prompt_id: prompt.id,
              model,
              brand_mentioned: cached.brand_mentioned,
              mention_position: cached.mention_position,
              sentiment: cached.sentiment,
              response_snippet: cached.response_snippet ?? "",
              citations: (cachedCitations ?? []).map((c) => ({
                url: c.url,
                domain: c.domain,
                is_brand_domain: c.is_brand_domain,
                is_competitor_domain: c.is_competitor_domain,
                position: c.position ?? 0,
              })),
            });

            emit({
              type: "model_done",
              message: `${modelLabel}: Cached - ${cached.brand_mentioned ? "Mentioned" : "Not mentioned"}`,
              current: stepCount,
              total: totalSteps,
              detail: {
                prompt: prompt.text,
                model: modelLabel,
                brand_mentioned: cached.brand_mentioned,
                sentiment: cached.sentiment ?? undefined,
              },
            });
            continue; // Skip API call
          }

          // Step A: Simulate the AI model's response
          const queryResponse = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 800,
            system: QUERY_SYSTEM,
            messages: [
              {
                role: "user",
                content: `Simulate a response from ${MODEL_STYLES[model]}.

The user asked: "${prompt.text}"

Context: This is about the Irish market. The brand we're tracking is "${brandName}" (website: ${websiteUrl ?? "unknown"}). Respond naturally as the model would.`,
              },
            ],
          });

          const responseText =
            queryResponse.content.find((b) => b.type === "text")?.type === "text"
              ? (queryResponse.content.find((b) => b.type === "text") as { type: "text"; text: string }).text
              : "";

          // Step B: Analyse the response
          const analysisResponse = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 800,
            system: ANALYSIS_SYSTEM,
            messages: [
              {
                role: "user",
                content: `Brand name: "${brandName}"
Brand website: "${websiteUrl ?? "unknown"}"
Competitors: ${competitors.map((c) => `${c.name} (${c.website_url ?? "unknown"})`).join(", ") || "none"}

AI model response to analyse:
---
${responseText}
---

Return the analysis JSON.`,
              },
            ],
          });

          let analysisText =
            analysisResponse.content.find((b) => b.type === "text")?.type === "text"
              ? (analysisResponse.content.find((b) => b.type === "text") as { type: "text"; text: string }).text
              : "{}";

          // Strip markdown code fences if Haiku wraps JSON in ```json ... ```
          analysisText = analysisText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

          const analysis = JSON.parse(analysisText);

          const result: RunResult = {
            prompt_id: prompt.id,
            model,
            brand_mentioned: analysis.brand_mentioned ?? false,
            mention_position: analysis.mention_position ?? null,
            sentiment: analysis.sentiment ?? null,
            response_snippet: responseText.slice(0, 500),
            citations: analysis.citations ?? [],
          };

          allResults.push(result);

          emit({
            type: "model_done",
            message: `${modelLabel}: ${result.brand_mentioned ? "Mentioned" : "Not mentioned"}${result.brand_mentioned && result.mention_position ? ` (position #${result.mention_position})` : ""}${result.sentiment ? `, ${result.sentiment} sentiment` : ""} - ${result.citations.length} citations found`,
            current: stepCount,
            total: totalSteps,
            detail: {
              prompt: prompt.text,
              model: modelLabel,
              brand_mentioned: result.brand_mentioned,
              sentiment: result.sentiment ?? undefined,
              citationCount: result.citations.length,
            },
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(
            `Run ${runId}: Error processing ${model}/${prompt.id}:`,
            errMsg
          );
          allResults.push({
            prompt_id: prompt.id,
            model,
            brand_mentioned: false,
            mention_position: null,
            sentiment: null,
            response_snippet: `[Error: ${errMsg.slice(0, 200)}]`,
            citations: [],
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

    // 3. Save results
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

    // 4. Insert citations
    const citationInserts: {
      result_id: string;
      url: string;
      domain: string;
      is_brand_domain: boolean;
      is_competitor_domain: boolean;
      position: number;
    }[] = [];

    for (const result of allResults) {
      const matchedResult = insertedResults?.find(
        (ir) => ir.prompt_id === result.prompt_id && ir.model === result.model
      );
      if (!matchedResult) continue;

      for (const citation of result.citations) {
        citationInserts.push({
          result_id: matchedResult.id,
          url: citation.url,
          domain: citation.domain,
          is_brand_domain: citation.is_brand_domain,
          is_competitor_domain: citation.is_competitor_domain,
          position: citation.position,
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

    // 5. Mark run as complete
    await admin
      .from("daily_runs")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    const mentionedCount = allResults.filter((r) => r.brand_mentioned).length;
    const visScore = Math.round((mentionedCount / allResults.length) * 100);

    emit({
      type: "complete",
      message: `Run complete! Visibility score: ${visScore}% (${mentionedCount}/${allResults.length} mentions). ${citationInserts.length} citations tracked.`,
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
