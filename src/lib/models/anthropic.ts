// ── Claude (Anthropic) adapter ──
// Uses Anthropic's native web_search tool so we get the same user-facing
// citations a real Claude user sees, not just vanilla LLM output.
//
// Docs: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool

import Anthropic from "@anthropic-ai/sdk";
import {
  AdapterError,
  domainFromUrl,
  type ModelAdapter,
  type ModelResponse,
  type ModelSource,
  type QueryOptions,
} from "./types";

const MODEL_ID = "claude-sonnet-4-6";
// Upgrade the non-search path as needed; the sonnet tier is the right
// default for production chats because Haiku makes visibility comparisons
// noisier. Cost ≈ $0.003-0.015 per chat at our token counts.

export const anthropicAdapter: ModelAdapter = {
  name: "claude",
  label: "Claude",

  available() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  async query(prompt: string, opts: QueryOptions = {}): Promise<ModelResponse> {
    if (!this.available()) {
      throw new AdapterError("claude", "ANTHROPIC_API_KEY not configured");
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    try {
      const message = await client.messages.create(
        {
          model: MODEL_ID,
          max_tokens: 1500,
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              // Bias results to the user's market; Claude honours
              // user_location hints in web_search.
              user_location: opts.country
                ? { type: "approximate", country: opts.country }
                : { type: "approximate", country: "IE" },
              max_uses: 5,
            },
          ],
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        },
        { signal: opts.signal }
      );

      // Collapse the structured content blocks into a plain text response
      // and extract citations from web_search_tool_result blocks.
      const textParts: string[] = [];
      const sources: ModelSource[] = [];
      const seen = new Set<string>();

      for (const block of message.content) {
        if (block.type === "text") {
          textParts.push(block.text);
          // Inline citations hang off each text block as block.citations
          const citations = (block as unknown as { citations?: Array<{ url?: string; title?: string }> }).citations;
          if (Array.isArray(citations)) {
            for (const c of citations) {
              if (c.url && !seen.has(c.url)) {
                seen.add(c.url);
                sources.push({
                  url: c.url,
                  domain: domainFromUrl(c.url),
                  title: c.title,
                  cited_inline: true,
                  position: sources.length + 1,
                });
              }
            }
          }
        } else if (block.type === "web_search_tool_result") {
          // Tool results list every URL Claude retrieved — the "sources
          // sidebar" equivalent. Any URL already added from an inline
          // citation stays marked cited_inline; additional ones here are
          // retrieved-but-not-cited.
          const results = (block as unknown as {
            content?: Array<{ url?: string; title?: string }>;
          }).content;
          if (Array.isArray(results)) {
            for (const r of results) {
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
      }

      return {
        text: textParts.join("\n").trim(),
        sources,
        model_version: message.model,
      };
    } catch (err) {
      throw new AdapterError(
        "claude",
        err instanceof Error ? err.message : "Unknown error",
        err
      );
    }
  },
};
