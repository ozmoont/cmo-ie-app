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
      // and extract citations. Parsing is extracted to
      // `parseAnthropicContent` so we can unit-test it against fixtures
      // of real Claude responses without a live API call.
      const { text, sources } = parseAnthropicContent(message.content);

      return {
        text,
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

// ── Pure parser (exported for tests) ────────────────────────────────
// Takes Claude's structured content-block array and produces:
//   - `text`: every text block joined with newlines, trimmed.
//   - `sources`: URLs extracted in order, each tagged `cited_inline` if
//     it appeared in a text block's `citations`, `false` if it appeared
//     only in a `web_search_tool_result` (sidebar-only retrieval).
//
// Keep this pure: no network, no SDK types, just shape-narrowing on
// `unknown[]`. That way our fixtures can be hand-written JSON blobs
// and the tests stay stable across SDK version bumps.
type AnthropicContentBlock =
  | {
      type: "text";
      text: string;
      citations?: Array<{ url?: string; title?: string }>;
    }
  | {
      type: "web_search_tool_result";
      content?: Array<{ url?: string; title?: string }>;
    }
  | { type: string };

export function parseAnthropicContent(
  content: unknown
): { text: string; sources: ModelSource[] } {
  if (!Array.isArray(content)) {
    return { text: "", sources: [] };
  }

  // Two-pass walk so inline citations always beat tool-result sidebar
  // URLs. Claude often emits tool_result BEFORE the text block that
  // cites it (tool_use → tool_result → text), so a single-pass walk
  // would mis-tag cited URLs as sidebar-only.
  const textParts: string[] = [];
  const sources: ModelSource[] = [];
  const seen = new Set<string>();

  // Pass 1: text blocks. Collect text + inline-cited URLs.
  for (const raw of content) {
    const block = raw as AnthropicContentBlock;
    if (block.type !== "text") continue;
    const b = block as Extract<AnthropicContentBlock, { type: "text" }>;
    if (typeof b.text === "string") textParts.push(b.text);
    if (Array.isArray(b.citations)) {
      for (const c of b.citations) {
        if (c?.url && !seen.has(c.url)) {
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
  }

  // Pass 2: web_search_tool_result blocks. Add any remaining URLs as
  // cited_inline: false (sidebar-only / retrieved but not cited).
  for (const raw of content) {
    const block = raw as AnthropicContentBlock;
    if (block.type !== "web_search_tool_result") continue;
    const b = block as Extract<
      AnthropicContentBlock,
      { type: "web_search_tool_result" }
    >;
    if (!Array.isArray(b.content)) continue;
    for (const r of b.content) {
      if (r?.url && !seen.has(r.url)) {
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
  // Other block types (tool_use, thinking, etc.) ignored — no sources.

  return {
    text: textParts.join("\n").trim(),
    sources,
  };
}
