/**
 * Phase 7 — Senior Auditor (Claude / Anthropic).
 *
 * Sonnet 4.6 evaluates the artifact against the shared rubric. No web
 * search — auditors evaluate from training data in v1; real grounding
 * is a v2 extension.
 *
 * Source-of-truth design doc: docs/phase-7-audit-council.md
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  buildAuditorSystemPrompt,
  buildAuditorUserMessage,
} from "../prompts";
import type {
  AuditableArtifact,
  AuditorReport,
} from "../types";
import { makeErrorReport, parseAuditorReport } from "./parse";

const MODEL = "claude-sonnet-4-6";

export async function runClaudeAuditor(
  artifact: AuditableArtifact
): Promise<AuditorReport> {
  const startedAt = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-...")) {
    return makeErrorReport({
      vendor: "claude",
      model: MODEL,
      message: "ANTHROPIC_API_KEY not configured",
      duration_ms: 0,
    });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      // Audit reports are dense JSON; 2500 max_tokens leaves headroom
      // even for artifacts with a dozen issues.
      max_tokens: 2500,
      system: buildAuditorSystemPrompt("claude", artifact.artifact_type),
      messages: [
        {
          role: "user",
          content: buildAuditorUserMessage({
            artifactType: artifact.artifact_type,
            brandName: artifact.brand_name,
            brandSegment: artifact.brand_segment,
            generatedAt: artifact.generated_at,
            content: artifact.content,
          }),
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return makeErrorReport({
        vendor: "claude",
        model: response.model ?? MODEL,
        message: "Sonnet returned no text content",
        duration_ms: Date.now() - startedAt,
      });
    }

    return parseAuditorReport({
      vendor: "claude",
      model: response.model ?? MODEL,
      rawText: textBlock.text,
      usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
        duration_ms: Date.now() - startedAt,
      },
    });
  } catch (err) {
    return makeErrorReport({
      vendor: "claude",
      model: MODEL,
      message: err instanceof Error ? err.message : "unknown_error",
      duration_ms: Date.now() - startedAt,
    });
  }
}
