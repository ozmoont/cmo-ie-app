/**
 * Phase 7 — Senior Auditor (Gemini / Google).
 *
 * Gemini 2.5 Pro via the Generative Language API v1beta. No grounding
 * — auditors evaluate from training data in v1.
 *
 * Note: the rest of cmo-ie uses gemini-2.5-flash for visibility runs
 * (cheaper, fast, fine for short Q&A). The auditor uses gemini-2.5-pro
 * for the deeper reasoning the rubric demands.
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import {
  buildAuditorSystemPrompt,
  buildAuditorUserMessage,
} from "../prompts";
import type {
  AuditableArtifact,
  AuditorReport,
} from "../types";
import { makeErrorReport, parseAuditorReport } from "./parse";

const MODEL = "gemini-2.5-pro";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

interface GeminiPayload {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  modelVersion?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

function extractText(payload: GeminiPayload): string {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .filter((s) => s.length > 0)
    .join("\n")
    .trim();
}

export async function runGeminiAuditor(
  artifact: AuditableArtifact
): Promise<AuditorReport> {
  const startedAt = Date.now();
  const apiKey =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (!apiKey) {
    return makeErrorReport({
      vendor: "gemini",
      model: MODEL,
      message: "GEMINI_API_KEY (or GOOGLE_API_KEY) not configured",
      duration_ms: 0,
    });
  }

  try {
    // Gemini doesn't have a separate system field; we prepend the
    // system instructions to the user message, matching how the
    // visibility adapter handles it.
    const systemPrompt = buildAuditorSystemPrompt(
      "gemini",
      artifact.artifact_type
    );
    const userPrompt = buildAuditorUserMessage({
      artifactType: artifact.artifact_type,
      brandName: artifact.brand_name,
      brandSegment: artifact.brand_segment,
      generatedAt: artifact.generated_at,
      content: artifact.content,
    });

    const body = {
      systemInstruction: {
        role: "system",
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 2500,
        // Low temperature — JSON output, deterministic-ish judgments.
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    };

    const url = `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return makeErrorReport({
        vendor: "gemini",
        model: MODEL,
        message: `Gemini ${res.status}: ${errText.slice(0, 200)}`,
        duration_ms: Date.now() - startedAt,
      });
    }

    const payload = (await res.json()) as GeminiPayload;
    const text = extractText(payload);
    if (!text) {
      return makeErrorReport({
        vendor: "gemini",
        model: payload.modelVersion ?? MODEL,
        message: "Gemini returned no text content",
        duration_ms: Date.now() - startedAt,
      });
    }

    return parseAuditorReport({
      vendor: "gemini",
      model: payload.modelVersion ?? MODEL,
      rawText: text,
      usage: {
        input_tokens: payload.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
        duration_ms: Date.now() - startedAt,
      },
    });
  } catch (err) {
    return makeErrorReport({
      vendor: "gemini",
      model: MODEL,
      message: err instanceof Error ? err.message : "unknown_error",
      duration_ms: Date.now() - startedAt,
    });
  }
}
