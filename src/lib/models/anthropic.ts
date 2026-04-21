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

/**
 * Country codes Anthropic's web_search_20250305 tool explicitly supports
 * as a user_location hint. Anything outside this set is rejected with a
 * 400 "Country code X is not supported" error at request time, so we
 * filter upstream.
 *
 * Source: Anthropic docs on tool use — supported markets for the web
 * search tool. Conservative list; expand as Anthropic adds more.
 *
 * Notable omissions: IE (Ireland), plus most of the EU outside DE/FR/IT/ES
 * and most of APAC outside JP/IN/AU. For unsupported countries we drop
 * the location hint entirely and rely on the `marketContext` in the
 * prompt to nudge the answer toward the right market.
 */
const SUPPORTED_WEB_SEARCH_COUNTRIES = new Set([
  "US",
  "GB",
  "CA",
  "AU",
  "DE",
  "FR",
  "IT",
  "ES",
  "JP",
  "IN",
  "BR",
  "MX",
  "NL",
  "SE",
  "NO",
  "DK",
  "FI",
  "PL",
  "CH",
  "AT",
  "BE",
  // Known NOT supported (return 400 at request time): IE, NZ, ZA, various APAC.
  // When Anthropic adds these, move them here.
]);

export const anthropicAdapter: ModelAdapter = {
  name: "claude",
  label: "Claude",

  available() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  async query(prompt: string, opts: QueryOptions = {}): Promise<ModelResponse> {
    // Prefer the BYOK override, fall back to env var. Trial plans
    // require an org-level key; paid plans use CMO.ie's managed key
    // unless the org has specified its own.
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AdapterError("claude", "ANTHROPIC_API_KEY not configured");
    }

    const client = new Anthropic({ apiKey });

    // Only pass user_location when the country is on Anthropic's
    // supported list. Otherwise the request 400s with "Country code X
    // is not supported". For unsupported markets (Ireland is a frequent
    // one) the search still runs globally; we nudge the answer toward
    // the right region via marketContext in the user prompt below.
    const requestedCountry = opts.country?.toUpperCase();
    const countryForLocation =
      requestedCountry && SUPPORTED_WEB_SEARCH_COUNTRIES.has(requestedCountry)
        ? requestedCountry
        : null;

    const marketHint = opts.marketContext ?? (requestedCountry === "IE" ? "Irish market" : undefined);
    const userContent = marketHint
      ? `Context: answer this for the ${marketHint}.\n\n${prompt}`
      : prompt;

    try {
      const message = await client.messages.create(
        {
          model: MODEL_ID,
          max_tokens: 1500,
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              ...(countryForLocation
                ? {
                    user_location: {
                      type: "approximate" as const,
                      country: countryForLocation,
                    },
                  }
                : {}),
              max_uses: 5,
            },
          ],
          messages: [
            {
              role: "user",
              content: userContent,
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
