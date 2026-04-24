// ── ChatGPT (OpenAI) adapter ──
// Uses OpenAI's Responses API with the web_search tool so we capture the
// same citations a ChatGPT user sees with web search enabled. Chat
// Completions without search would give a materially different answer.
//
// Docs: https://platform.openai.com/docs/guides/tools-web-search

import {
  AdapterError,
  domainFromUrl,
  type ModelAdapter,
  type ModelResponse,
  type ModelSource,
  type QueryOptions,
} from "./types";
import { retryWithBackoff } from "./retry";

const ENDPOINT = "https://api.openai.com/v1/responses";
const MODEL_ID = "gpt-4.1";

// Shape we need from the Responses API. The full schema is wider; we
// only pin what we consume so provider drift doesn't crash us.
interface ResponsesPayload {
  id: string;
  model: string;
  output: Array<
    | {
        type: "message";
        content: Array<{
          type: string;
          text?: string;
          annotations?: Array<{
            type: string;
            url?: string;
            title?: string;
          }>;
        }>;
      }
    | {
        type: "web_search_call";
        // Newer SDKs expose `action.sources` on this block with every
        // URL the search tool retrieved, including uncited ones.
        action?: {
          sources?: Array<{ url?: string; title?: string }>;
        };
      }
    | { type: string }
  >;
  /** OpenAI token usage. Absent on cached fixtures; treat as zero. */
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    // The Responses API also reports total_tokens + reasoning_tokens;
    // we don't need either for pricing.
  };
}

export const openaiAdapter: ModelAdapter = {
  name: "chatgpt",
  label: "ChatGPT",

  available() {
    return Boolean(process.env.OPENAI_API_KEY);
  },

  async query(prompt: string, opts: QueryOptions = {}): Promise<ModelResponse> {
    const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AdapterError("chatgpt", "OPENAI_API_KEY not configured");
    }

    const body = {
      model: MODEL_ID,
      input: prompt,
      tools: [
        {
          type: "web_search",
          // Geo hints; OpenAI accepts ISO-3166 alpha-2 under user_location.
          user_location: opts.country
            ? { type: "approximate", country: opts.country }
            : { type: "approximate", country: "IE" },
        },
      ],
      // Always let the tool fire; we don't want a shortcut answer.
      tool_choice: "auto",
    };

    let payload: ResponsesPayload;
    try {
      payload = await retryWithBackoff(
        async () => {
          const res = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: opts.signal,
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new AdapterError(
              "chatgpt",
              `HTTP ${res.status}: ${errText.slice(0, 400)}`
            );
          }
          return (await res.json()) as ResponsesPayload;
        },
        {
          signal: opts.signal,
          onRetry: (attempt, err) =>
            console.warn(
              `[chatgpt] retry ${attempt}: ${err instanceof Error ? err.message.slice(0, 160) : err}`
            ),
        }
      );
    } catch (err) {
      if (err instanceof AdapterError) throw err;
      throw new AdapterError(
        "chatgpt",
        err instanceof Error ? err.message : "Fetch failed",
        err
      );
    }

    const textParts: string[] = [];
    const sources: ModelSource[] = [];
    const seen = new Set<string>();

    for (const block of payload.output) {
      if (block.type === "message" && "content" in block) {
        for (const c of block.content) {
          if (typeof c.text === "string") textParts.push(c.text);
          // url_citation annotations → inline citations
          if (Array.isArray(c.annotations)) {
            for (const a of c.annotations) {
              if (a.url && a.type?.includes("citation") && !seen.has(a.url)) {
                seen.add(a.url);
                sources.push({
                  url: a.url,
                  domain: domainFromUrl(a.url),
                  title: a.title,
                  cited_inline: true,
                  position: sources.length + 1,
                });
              }
            }
          }
        }
      } else if (block.type === "web_search_call" && "action" in block) {
        // Tool-level sources list — everything retrieved, including
        // uncited background sources.
        const retrieved = block.action?.sources ?? [];
        for (const r of retrieved) {
          if (r.url && !seen.has(r.url)) {
            seen.add(r.url);
            sources.push({
              url: r.url,
              domain: domainFromUrl(r.url),
              title: r.title,
              cited_inline: false,
              position: sources.length + 1,
            });
          }
        }
      }
    }

    return {
      text: textParts.join("\n").trim(),
      sources,
      model_version: payload.model,
      usage: {
        input_tokens: payload.usage?.input_tokens ?? 0,
        output_tokens: payload.usage?.output_tokens ?? 0,
      },
    };
  },
};
