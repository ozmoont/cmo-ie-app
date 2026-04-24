// ── AI provider pricing table ──
// USD per 1 million tokens, as of 2026-04. Keep this file as the single
// source of truth so the ops dashboard, cost warnings in docs, and any
// future billing logic all read the same numbers.
//
// Sources:
//   - Anthropic: https://www.anthropic.com/pricing
//   - OpenAI:    https://openai.com/api/pricing
//   - Perplexity: https://docs.perplexity.ai/guides/pricing
//   - Gemini:    https://ai.google.dev/pricing
//   - xAI Grok:  https://x.ai/api
//   - Copilot (Azure OpenAI):  https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/
//
// When a provider publishes a price change: bump the number here, add
// the date to the comment, and let `computeCost` pick the row by
// normalised model string. The ops dashboard then re-prices newly
// logged events at the new rate automatically.

export type Provider =
  | "anthropic"
  | "openai"
  | "perplexity"
  | "gemini"
  | "grok"
  | "copilot";

export interface PricingRow {
  /** $ per 1M input tokens */
  input_per_m: number;
  /** $ per 1M output tokens */
  output_per_m: number;
  /** Optional flat fee per web_search invocation (Anthropic only, currently). */
  web_search_per_call?: number;
}

/**
 * Model-level pricing. Matched case-insensitively by `startsWith` on the
 * normalised model string — that way "claude-haiku-4-5-20251001" matches
 * the "claude-haiku-4-5" row without needing an exact version pin.
 *
 * Order matters: more specific prefixes should come before shorter ones.
 * The first match wins.
 */
export const PRICING: Array<{
  provider: Provider;
  matchPrefix: string;
  pricing: PricingRow;
}> = [
  // ── Anthropic ──
  { provider: "anthropic", matchPrefix: "claude-opus-4",    pricing: { input_per_m: 15.0, output_per_m: 75.0, web_search_per_call: 0.01 } },
  { provider: "anthropic", matchPrefix: "claude-sonnet-4",  pricing: { input_per_m:  3.0, output_per_m: 15.0, web_search_per_call: 0.01 } },
  { provider: "anthropic", matchPrefix: "claude-haiku-4",   pricing: { input_per_m:  0.8, output_per_m:  4.0, web_search_per_call: 0.01 } },
  { provider: "anthropic", matchPrefix: "claude-3-5-sonnet",pricing: { input_per_m:  3.0, output_per_m: 15.0, web_search_per_call: 0.01 } },
  { provider: "anthropic", matchPrefix: "claude-3-5-haiku", pricing: { input_per_m:  0.8, output_per_m:  4.0, web_search_per_call: 0.01 } },

  // ── OpenAI ──
  // GPT-4.1 tiers. Web-search tool-calls are priced into the token output
  // at OpenAI's end, no per-call surcharge to model here.
  { provider: "openai",    matchPrefix: "gpt-4.1-mini",     pricing: { input_per_m:  0.4, output_per_m:  1.6 } },
  { provider: "openai",    matchPrefix: "gpt-4.1-nano",     pricing: { input_per_m:  0.1, output_per_m:  0.4 } },
  { provider: "openai",    matchPrefix: "gpt-4.1",          pricing: { input_per_m:  2.0, output_per_m:  8.0 } },
  { provider: "openai",    matchPrefix: "gpt-4o-mini",      pricing: { input_per_m:  0.15,output_per_m:  0.6 } },
  { provider: "openai",    matchPrefix: "gpt-4o",           pricing: { input_per_m:  2.5, output_per_m: 10.0 } },

  // ── Perplexity Sonar ──
  // Per-request pricing is a token model plus a request surcharge.
  // We model the token half here; the per-request surcharge (~$0.005)
  // is layered in inside the Perplexity logger callsite.
  { provider: "perplexity",matchPrefix: "sonar-pro",        pricing: { input_per_m:  3.0, output_per_m: 15.0 } },
  { provider: "perplexity",matchPrefix: "sonar",            pricing: { input_per_m:  1.0, output_per_m:  1.0 } },

  // ── Google Gemini ──
  { provider: "gemini",    matchPrefix: "gemini-2.5-pro",   pricing: { input_per_m:  1.25,output_per_m:  5.0 } },
  { provider: "gemini",    matchPrefix: "gemini-2.5-flash", pricing: { input_per_m:  0.075,output_per_m: 0.3 } },
  { provider: "gemini",    matchPrefix: "gemini-1.5-pro",   pricing: { input_per_m:  1.25,output_per_m:  5.0 } },
  { provider: "gemini",    matchPrefix: "gemini-1.5-flash", pricing: { input_per_m:  0.075,output_per_m: 0.3 } },

  // ── xAI Grok ──
  { provider: "grok",      matchPrefix: "grok-4",           pricing: { input_per_m:  3.0, output_per_m: 15.0 } },
  { provider: "grok",      matchPrefix: "grok-3",           pricing: { input_per_m:  2.0, output_per_m: 10.0 } },

  // ── Microsoft Copilot (Azure OpenAI) ──
  // Treated as a branded GPT-4.1 deployment; use the same unit economics.
  { provider: "copilot",   matchPrefix: "copilot",          pricing: { input_per_m:  2.0, output_per_m:  8.0 } },
];

/**
 * Find the pricing row for a given provider + model string.
 * Returns null for unknown models — the caller should log them as
 * $0.00 + feature="other" so the dashboard can flag "unpriced model"
 * rather than silently over/under-report spend.
 */
export function findPricing(provider: Provider, model: string): PricingRow | null {
  const m = model.toLowerCase();
  for (const row of PRICING) {
    if (row.provider !== provider) continue;
    if (m.startsWith(row.matchPrefix)) return row.pricing;
  }
  return null;
}

/**
 * Compute USD cost from tokens. Web-search surcharge is optional
 * because only Anthropic exposes the call count cleanly; adapters
 * without one pass 0 (or omit) and we only charge tokens.
 *
 * Rounds to 6 decimal places to match the DB column precision.
 */
export function computeCost(opts: {
  provider: Provider;
  model: string;
  input_tokens: number;
  output_tokens: number;
  web_search_calls?: number;
}): number {
  const p = findPricing(opts.provider, opts.model);
  if (!p) return 0;
  const inCost = (opts.input_tokens / 1_000_000) * p.input_per_m;
  const outCost = (opts.output_tokens / 1_000_000) * p.output_per_m;
  const webCost =
    p.web_search_per_call && opts.web_search_calls
      ? opts.web_search_calls * p.web_search_per_call
      : 0;
  return Math.round((inCost + outCost + webCost) * 1_000_000) / 1_000_000;
}
