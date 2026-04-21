// ── Perplexity (Sonar) adapter ──
// Sonar models run web search on every call by default and return a
// `citations` array alongside the response. OpenAI-compatible chat
// completions shape, plain fetch — no SDK.
//
// Docs: https://docs.perplexity.ai/api-reference/chat-completions
// Pricing: Sonar small ≈ $0.001/1k tokens, search ≈ $0.005/call.

import {
  AdapterError,
  domainFromUrl,
  type ModelAdapter,
  type ModelResponse,
  type ModelSource,
  type QueryOptions,
} from "./types";
import { retryWithBackoff } from "./retry";

const ENDPOINT = "https://api.perplexity.ai/chat/completions";
const MODEL_ID = "sonar-pro";
// sonar-pro is the stronger tier and returns more citations than base
// sonar. We can drop to "sonar" for cost-sensitive plans later.

interface PerplexityPayload {
  id: string;
  model: string;
  choices: Array<{
    message: { role: string; content: string };
  }>;
  // Perplexity returns citations both as a top-level array and as
  // search_results with richer metadata. We prefer search_results when
  // present.
  citations?: string[];
  search_results?: Array<{
    title?: string;
    url: string;
    date?: string | null;
  }>;
}

export const perplexityAdapter: ModelAdapter = {
  name: "perplexity",
  label: "Perplexity",

  available() {
    return Boolean(process.env.PERPLEXITY_API_KEY);
  },

  async query(prompt: string, opts: QueryOptions = {}): Promise<ModelResponse> {
    const apiKey = opts.apiKey ?? process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new AdapterError("perplexity", "PERPLEXITY_API_KEY not configured");
    }

    const body = {
      model: MODEL_ID,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      // Sonar accepts a web_search_options object for geo + recency filters.
      web_search_options: {
        user_location: {
          country: (opts.country ?? "IE").toUpperCase(),
        },
      },
      return_citations: true,
      max_tokens: 1500,
    };

    let payload: PerplexityPayload;
    try {
      payload = await retryWithBackoff(
        async () => {
          const res = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(body),
            signal: opts.signal,
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new AdapterError(
              "perplexity",
              `HTTP ${res.status}: ${errText.slice(0, 400)}`
            );
          }
          return (await res.json()) as PerplexityPayload;
        },
        {
          signal: opts.signal,
          onRetry: (attempt, err) =>
            console.warn(
              `[perplexity] retry ${attempt}: ${err instanceof Error ? err.message.slice(0, 160) : err}`
            ),
        }
      );
    } catch (err) {
      if (err instanceof AdapterError) throw err;
      throw new AdapterError(
        "perplexity",
        err instanceof Error ? err.message : "Fetch failed",
        err
      );
    }

    const text = payload.choices?.[0]?.message?.content ?? "";
    const sources: ModelSource[] = [];
    const seen = new Set<string>();

    // Prefer search_results (has titles), fall back to citations (URL-only).
    const rawSources: Array<{ url: string; title?: string }> =
      payload.search_results ??
      (payload.citations?.map((url) => ({ url })) ?? []);

    // Perplexity citations come back as a flat list with no per-URL
    // cited-inline signal. Heuristic: if the response text contains the
    // index reference [1] [2] etc., those entries ARE cited inline; the
    // remainder are "also consulted". We detect by looking for [N] tokens
    // in the text body.
    const inlineIndices = new Set<number>();
    const matches = text.match(/\[(\d{1,2})\]/g);
    if (matches) {
      for (const m of matches) {
        const n = Number(m.slice(1, -1));
        if (Number.isFinite(n) && n > 0) inlineIndices.add(n);
      }
    }

    rawSources.forEach((s, idx) => {
      if (!s.url || seen.has(s.url)) return;
      seen.add(s.url);
      const oneBasedIdx = idx + 1;
      sources.push({
        url: s.url,
        domain: domainFromUrl(s.url),
        title: s.title,
        // Perplexity inline-refs are 1-indexed against the citations list.
        cited_inline: inlineIndices.has(oneBasedIdx) || inlineIndices.size === 0,
        // If no [N] markers at all, assume every citation is inline (Sonar
        // sometimes omits markers on short answers).
        position: sources.length + 1,
      });
    });

    return {
      text: text.trim(),
      sources,
      model_version: payload.model,
    };
  },
};
