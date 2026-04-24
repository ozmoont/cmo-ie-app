// ── Model Adapter Types ──
// Shared shape for every provider-specific adapter. Each adapter wraps one
// AI model's API (Anthropic, OpenAI, Google, Perplexity, etc.) and exposes
// a narrow, consistent interface the run engine can iterate over.
//
// Design notes:
// - Sources come back with `cited_inline` distinguishing in-response
//   citations from "also-consulted" items in the sidebar. This is the
//   sources-vs-citations split Peec leans on — we capture it at ingest
//   even though UI consumes it later.
// - `raw` is kept for debugging but never surfaced to the UI.
// - Adapters are stateless; all config is passed in.

import type { AIModel } from "@/lib/types";

/**
 * A single URL an AI model referenced when answering the prompt.
 * `cited_inline` = the model explicitly linked it in the response body.
 * `cited_inline = false` means it was in the model's source list/sidebar
 * but not referenced inline (equivalent to Peec's "source but not citation").
 */
export interface ModelSource {
  url: string;
  domain: string;
  title?: string;
  cited_inline: boolean;
  position: number; // 1-indexed order of appearance in the source list
}

/**
 * Token + tool-call usage for one adapter call. Optional so tests and
 * older providers can still return a ModelResponse without supplying
 * it. Feeds directly into `lib/ai-pricing` + `lib/ai-usage-logger` so
 * the ops dashboard has per-call attribution.
 */
export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  /** Provider-specific surcharge counters. Currently only Anthropic
   *  exposes `web_search` call count on the response. */
  web_search_calls?: number;
}

/**
 * The canonical response shape every adapter returns. Everything the
 * run engine needs to persist a chat.
 */
export interface ModelResponse {
  /** Full text body of the model's response. */
  text: string;
  /** Ordered list of URLs the model accessed / cited. */
  sources: ModelSource[];
  /** Which concrete model/version produced this (e.g. "gpt-4.1-2025-04-14"). */
  model_version: string;
  /**
   * Token usage + tool-call counts. Absent on older mock fixtures; the
   * usage logger treats absence as zero (which correctly means "no
   * data" rather than "free").
   */
  usage?: ModelUsage;
  /**
   * Opaque raw provider response for debugging. Never rendered; should be
   * truncated or dropped before logging. Never persisted to the DB.
   */
  raw?: unknown;
}

/**
 * Per-call options the run engine may pass to an adapter.
 * Kept intentionally small — adapter-specific knobs live inside adapters.
 */
export interface QueryOptions {
  /** ISO-3166 alpha-2 country code for geo-aware queries. Default "IE". */
  country?: string;
  /**
   * Optional hint — when supplied, we inject market context into system
   * prompts where the provider allows it. Does NOT bias for or against
   * the brand; the point is to scope the response to "how would this
   * question be answered for this market".
   */
  marketContext?: string;
  /** Abort signal, honored best-effort. */
  signal?: AbortSignal;
  /**
   * Explicit API key override. Takes precedence over any env var. Used
   * by the BYOK flow where an org supplies its own provider credentials
   * (trial plan requirement, and a power-user option on paid plans).
   */
  apiKey?: string;
}

/**
 * Per-model API key overrides, keyed by AIModel enum. Used by the router
 * to decide which adapters are effectively "available" when an org has
 * its own keys that differ from the env-var defaults.
 */
export type ApiKeyOverrides = Partial<Record<import("@/lib/types").AIModel, string>>;

/**
 * Adapter interface. One per AIModel.
 *
 * `available()` gates the run engine — if the required API key or config
 * is missing, the model is skipped gracefully rather than failing the run.
 */
export interface ModelAdapter {
  name: AIModel;
  /** Human-friendly label for error messages and logs. */
  label: string;
  /**
   * Is this adapter usable right now? Should be cheap and synchronous —
   * no network calls. Typically just checks env vars.
   */
  available(): boolean;
  /**
   * Run the prompt against this model with web search / grounding enabled
   * where supported.
   */
  query(prompt: string, opts?: QueryOptions): Promise<ModelResponse>;
}

/**
 * Thrown by adapters when the provider returned an unrecoverable error.
 * The run engine catches this and moves on to the next model.
 */
export class AdapterError extends Error {
  constructor(
    public readonly adapter: AIModel,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`[${adapter}] ${message}`);
    this.name = "AdapterError";
  }
}

/**
 * Helper: pull a hostname out of a URL safely. Used by adapters that
 * return URLs without pre-computed domains.
 */
export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
