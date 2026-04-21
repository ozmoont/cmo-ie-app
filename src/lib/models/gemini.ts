// ── Gemini (Google) adapter ──
// Uses the Generative Language API v1beta with Google Search grounding.
// The grounding tool gives us the same "search + summarise" experience a
// real Gemini user gets; groundingMetadata returns the source URLs.
//
// Docs: https://ai.google.dev/gemini-api/docs/grounding
// Pricing: Flash ~$0.0001-0.0003 per 1k tokens + grounding fee.

import {
  AdapterError,
  domainFromUrl,
  type ModelAdapter,
  type ModelResponse,
  type ModelSource,
  type QueryOptions,
} from "./types";
import { retryWithBackoff } from "./retry";

const MODEL_ID = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

interface GeminiPayload {
  candidates?: Array<{
    content: {
      parts: Array<{ text?: string }>;
    };
    groundingMetadata?: {
      // Per-sentence support links; the inline-cited subset.
      groundingSupports?: Array<{
        segment: { startIndex?: number; endIndex?: number; text?: string };
        groundingChunkIndices: number[];
      }>;
      // The full list of chunks retrieved — equivalent to "sources sidebar".
      groundingChunks?: Array<{
        web?: { uri: string; title?: string };
      }>;
    };
  }>;
  modelVersion?: string;
}

export const geminiAdapter: ModelAdapter = {
  name: "gemini",
  label: "Gemini",

  available() {
    return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  },

  async query(prompt: string, opts: QueryOptions = {}): Promise<ModelResponse> {
    const apiKey =
      opts.apiKey ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_API_KEY ??
      "";
    if (!apiKey) {
      throw new AdapterError(
        "gemini",
        "GEMINI_API_KEY (or GOOGLE_API_KEY) not configured"
      );
    }

    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      // Google Search grounding tool — mandatory for visibility tracking.
      // Without it, Gemini answers from training data and never cites.
      tools: [{ google_search: {} }],
      generationConfig: {
        maxOutputTokens: 1500,
        temperature: 0.3,
      },
    };

    let payload: GeminiPayload;
    try {
      payload = await retryWithBackoff(
        async () => {
          const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: opts.signal,
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new AdapterError(
              "gemini",
              `HTTP ${res.status}: ${errText.slice(0, 400)}`
            );
          }
          return (await res.json()) as GeminiPayload;
        },
        {
          signal: opts.signal,
          onRetry: (attempt, err) =>
            console.warn(
              `[gemini] retry ${attempt}: ${err instanceof Error ? err.message.slice(0, 160) : err}`
            ),
        }
      );
    } catch (err) {
      if (err instanceof AdapterError) throw err;
      throw new AdapterError(
        "gemini",
        err instanceof Error ? err.message : "Fetch failed",
        err
      );
    }

    const candidate = payload.candidates?.[0];
    if (!candidate) {
      return { text: "", sources: [], model_version: MODEL_ID };
    }

    const text = (candidate.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    // Mark a chunk as cited inline if any groundingSupport references it.
    const chunks = candidate.groundingMetadata?.groundingChunks ?? [];
    const supports = candidate.groundingMetadata?.groundingSupports ?? [];
    const citedIndices = new Set<number>();
    for (const s of supports) {
      for (const idx of s.groundingChunkIndices ?? []) {
        citedIndices.add(idx);
      }
    }

    const sources: ModelSource[] = [];
    const seen = new Set<string>();
    chunks.forEach((chunk, idx) => {
      const url = chunk.web?.uri;
      if (!url || seen.has(url)) return;
      seen.add(url);
      sources.push({
        url,
        domain: domainFromUrl(url),
        title: chunk.web?.title,
        cited_inline: citedIndices.has(idx),
        position: sources.length + 1,
      });
    });

    return {
      text,
      sources,
      model_version: payload.modelVersion ?? MODEL_ID,
    };
  },
};
