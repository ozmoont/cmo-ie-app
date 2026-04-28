/**
 * Phase 7 — Senior Auditor (ChatGPT / OpenAI).
 *
 * GPT-4.1 via the Responses API. We use Responses (not Chat
 * Completions) for parity with the visibility-tracking adapter, but
 * without the web_search tool — auditors evaluate from training data.
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

const MODEL = "gpt-4.1";
const ENDPOINT = "https://api.openai.com/v1/responses";

interface ResponsesPayload {
  id?: string;
  model?: string;
  output?: Array<
    | {
        type: "message";
        content: Array<{
          type: string;
          text?: string;
        }>;
      }
    | { type: string }
  >;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

function extractText(payload: ResponsesPayload): string {
  if (!payload.output) return "";
  for (const block of payload.output) {
    if (block.type !== "message") continue;
    const message = block as Extract<NonNullable<ResponsesPayload["output"]>[number], { type: "message" }>;
    for (const c of message.content) {
      if (typeof c.text === "string" && c.text.length > 0) return c.text;
    }
  }
  return "";
}

export async function runChatGPTAuditor(
  artifact: AuditableArtifact
): Promise<AuditorReport> {
  const startedAt = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return makeErrorReport({
      vendor: "chatgpt",
      model: MODEL,
      message: "OPENAI_API_KEY not configured",
      duration_ms: 0,
    });
  }

  try {
    const body = {
      model: MODEL,
      // Responses API takes `instructions` as the system-equivalent.
      instructions: buildAuditorSystemPrompt("chatgpt", artifact.artifact_type),
      input: buildAuditorUserMessage({
        artifactType: artifact.artifact_type,
        brandName: artifact.brand_name,
        brandSegment: artifact.brand_segment,
        generatedAt: artifact.generated_at,
        content: artifact.content,
      }),
      // Same headroom as Claude's 2500. Responses API caps via max_output_tokens.
      max_output_tokens: 2500,
    };

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return makeErrorReport({
        vendor: "chatgpt",
        model: MODEL,
        message: `OpenAI ${res.status}: ${errText.slice(0, 200)}`,
        duration_ms: Date.now() - startedAt,
      });
    }

    const payload = (await res.json()) as ResponsesPayload;
    const text = extractText(payload);
    if (!text) {
      return makeErrorReport({
        vendor: "chatgpt",
        model: payload.model ?? MODEL,
        message: "OpenAI returned no text content",
        duration_ms: Date.now() - startedAt,
      });
    }

    return parseAuditorReport({
      vendor: "chatgpt",
      model: payload.model ?? MODEL,
      rawText: text,
      usage: {
        input_tokens: payload.usage?.input_tokens ?? 0,
        output_tokens: payload.usage?.output_tokens ?? 0,
        duration_ms: Date.now() - startedAt,
      },
    });
  } catch (err) {
    return makeErrorReport({
      vendor: "chatgpt",
      model: MODEL,
      message: err instanceof Error ? err.message : "unknown_error",
      duration_ms: Date.now() - startedAt,
    });
  }
}
