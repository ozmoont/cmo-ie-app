// ── Model adapter router ──
// Maps AIModel enum values to their concrete adapter. One import site
// for the run engine.
//
// To add a new model: implement ModelAdapter in ./{name}.ts, register
// below, and extend the AIModel enum in lib/types.ts.

import type { AIModel } from "@/lib/types";
import { anthropicAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import { openaiAdapter } from "./openai";
import { perplexityAdapter } from "./perplexity";
import type { ModelAdapter } from "./types";

const REGISTRY: Partial<Record<AIModel, ModelAdapter>> = {
  claude: anthropicAdapter,
  chatgpt: openaiAdapter,
  perplexity: perplexityAdapter,
  gemini: geminiAdapter,
  // google_aio: not yet implemented — needs SerpAPI or similar integration.
};

export function getAdapter(model: AIModel): ModelAdapter | null {
  return REGISTRY[model] ?? null;
}

export function listAvailableAdapters(): ModelAdapter[] {
  return Object.values(REGISTRY)
    .filter((a): a is ModelAdapter => Boolean(a))
    .filter((a) => a.available());
}

/**
 * Returns the adapters for the subset of models passed in that are both
 * registered AND have credentials configured. Used by the run engine to
 * skip unavailable models without failing the run.
 */
export function resolveAdapters(models: AIModel[]): {
  available: ModelAdapter[];
  missing: AIModel[];
  unimplemented: AIModel[];
} {
  const available: ModelAdapter[] = [];
  const missing: AIModel[] = [];
  const unimplemented: AIModel[] = [];

  for (const model of models) {
    const adapter = REGISTRY[model];
    if (!adapter) {
      unimplemented.push(model);
      continue;
    }
    if (adapter.available()) {
      available.push(adapter);
    } else {
      missing.push(model);
    }
  }

  return { available, missing, unimplemented };
}

export type { ModelAdapter, ModelResponse, ModelSource, QueryOptions } from "./types";
export { AdapterError, domainFromUrl } from "./types";
