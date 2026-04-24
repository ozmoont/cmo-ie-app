// ── Grok (xAI) adapter ──
// Uses xAI's OpenAI-compatible API with the `live_search` feature so
// we capture real sources the same way ChatGPT/Perplexity do. xAI
// exposes search_parameters on chat.completions; we enable it and
// parse the citations out of the returned message.
//
// Docs: https://docs.x.ai/docs/guides/live-search
//
// Required env var: XAI_API_KEY. Falls back gracefully via `available()`
// when unset — the run engine just skips this adapter for that project.

import {
  AdapterError,
  domainFromUrl,
  type ModelAdapter,
  type ModelResponse,
  type ModelSource,
  type QueryOptions,
} from "./types";
import { retryWithBackoff } from "./retry";

const ENDPOINT = "https://api.x.ai/v1/chat/completions";
const MODEL_ID = "grok-4";

// xAI's live search returns `citations` on the top-level response when
// live_search is enabled. Shape is a flat array of URLs or objects.
interface ChatCompletionsPayload {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      // Some xAI responses echo citations inside the message; we
      // support both shapes to be defensive.
      citations?: Array<string | { url?: string; title?: string }>;
    };
    finish_reason: string;
  }>;
  citations?: Array<string | { url?: string; title?: string }>;
  /** xAI echoes OpenAI's usage shape. */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function keyFor(opts?: QueryOptions): string | null {
  return opts?.apiKey ?? process.env.XAI_API_KEY ?? null;
}

async function runGrok(
  prompt: string,
  opts: QueryOptions
): Promise<ChatCompletionsPayload> {
  const apiKey = keyFor(opts);
  if (!apiKey) {
    throw new AdapterError("grok", "XAI_API_KEY not configured");
  }

  const systemPrompt = opts.marketContext
    ? `You are answering user questions about the ${opts.marketContext}. Be factual. Cite sources when relevant.`
    : "Answer factually and cite sources when relevant.";

  const body = {
    model: MODEL_ID,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    // Enable xAI's native search. `mode: "on"` forces the tool to run.
    // We opt out of X/Twitter-source-only results via `sources` so the
    // search is web-wide — that matches how Perplexity / Claude's
    // web_search behave and keeps comparisons fair.
    search_parameters: {
      mode: "on",
      sources: [{ type: "web" }, { type: "news" }],
      return_citations: true,
    },
    max_tokens: 2048,
    temperature: 0.3,
  };

  const res = await retryWithBackoff(async () => {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `xAI HTTP ${response.status}: ${errText.slice(0, 200)}`
      );
    }
    return response.json() as Promise<ChatCompletionsPayload>;
  });

  return res;
}

function parseSources(
  raw: ChatCompletionsPayload,
  responseText: string
): ModelSource[] {
  // Prefer the top-level `citations` array. Fall back to message-level.
  const primary = raw.citations ?? raw.choices[0]?.message?.citations ?? [];
  const urls: string[] = [];
  for (const c of primary) {
    const url = typeof c === "string" ? c : c?.url;
    if (url && typeof url === "string") urls.push(url);
  }

  // De-dupe while preserving first-seen order — xAI sometimes repeats
  // the same URL for multi-hop answers.
  const seen = new Set<string>();
  const sources: ModelSource[] = [];
  let position = 1;
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    // `cited_inline = true` when the URL appears in the response body.
    // Best-effort string scan — the response text is already truncated
    // to a manageable size.
    const citedInline = responseText.includes(url);
    sources.push({
      url,
      domain: domainFromUrl(url),
      cited_inline: citedInline,
      position: position++,
    });
  }
  return sources;
}

export const grokAdapter: ModelAdapter = {
  name: "grok",
  label: "Grok",
  available(): boolean {
    return Boolean(process.env.XAI_API_KEY);
  },
  async query(prompt, opts = {}): Promise<ModelResponse> {
    try {
      const payload = await runGrok(prompt, opts);
      const text = payload.choices[0]?.message?.content ?? "";
      if (!text) {
        throw new AdapterError("grok", "xAI returned an empty response");
      }
      return {
        text,
        sources: parseSources(payload, text),
        model_version: payload.model ?? MODEL_ID,
        usage: {
          input_tokens: payload.usage?.prompt_tokens ?? 0,
          output_tokens: payload.usage?.completion_tokens ?? 0,
        },
      };
    } catch (err) {
      if (err instanceof AdapterError) throw err;
      throw new AdapterError(
        "grok",
        err instanceof Error ? err.message : String(err),
        err
      );
    }
  },
};
