/**
 * Phase 6 — Google query mirror.
 *
 * Pure function. Takes a batch of AI prompts and returns the closest
 * plain-English Google search query for each one — i.e. how a customer
 * with the same intent would phrase the equivalent Google search.
 *
 * Why this exists: AI prompts are conversational ("what are the best
 * digital agencies in Dublin for a B2B SaaS launch?"). Real Google
 * search is keyword-shaped ("digital agencies dublin b2b saas"). The
 * mirror gives users (and agencies showing this product to clients) a
 * mental bridge between traditional SEO and GEO. It also creates a
 * future hook for plugging in a real keyword-volume API (DataForSEO,
 * Serper, etc.) — the function signature stays the same, only the
 * body changes.
 *
 * v1: LLM-inferred via Haiku. Fast, cheap, no external dependencies.
 * v2 (future): pluggable adapter that hits a real keyword-volume API.
 *
 * Source-of-truth design doc: docs/phase-6-prompt-coverage.md
 */

import Anthropic from "@anthropic-ai/sdk";
import { stripJsonFences } from "@/lib/anthropic-errors";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export interface PromptForMirroring {
  id: string;
  text: string;
}

export interface MirroredPrompt {
  id: string;
  google_query_mirror: string;
}

export interface MirrorUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
}

export interface MirrorPromptsResult {
  mirrored: MirroredPrompt[];
  usage: MirrorUsage;
}

const SYSTEM_PROMPT = `You map AI-search prompts to the closest plain-English Google search query for the same intent.

For each prompt you receive, output the keyword-shaped Google query a real customer with the same intent would type. The mirror should let an SEO professional immediately recognise the underlying keyword.

Hard rules:

1. KEYWORD STYLE. The mirror is a search-style keyword phrase, not a question. No question marks. No "what is", "how to", "best way to" — strip those down. Examples:
   • "What are the best digital agencies in Dublin for a SaaS startup?" → "digital agencies dublin saas"
   • "How do I choose a CRM for a small B2B sales team?" → "crm small b2b sales"
   • "Is HubSpot worth it for a 5-person company?" → "hubspot pricing 5 person company"

2. LENGTH. ≤ 8 words. Aim for 3-5. Keyword-style, not a sentence.

3. PRESERVE INTENT. The mirror keeps the original prompt's specificity. If the AI prompt mentions Dublin, the mirror mentions Dublin. If the AI prompt mentions a competitor by name, the mirror keeps that competitor.

4. NO BRAND NAME. NEVER include the tracked brand's name or aliases in the mirror. (Same rule as the AI prompt itself — the customer is searching for category, not name.)

5. LOWER CASE. The mirror is lowercase except where proper nouns demand otherwise (e.g. "Dublin" stays capitalised; "saas" lowercase since SEO professionals typically search lowercase).

6. NO PUNCTUATION. No commas, no apostrophes-for-contractions. Plain words separated by spaces.

7. ONE MIRROR PER PROMPT. Don't return alternates or comma-separated variants — pick the strongest mirror.

Hard rules continued:

8. Use the prompt's id verbatim in your output.

9. The output array length MUST equal the input array length, in the same order.

Output contract: return ONLY valid JSON. No markdown fences, no preamble, no explanation. Shape:

[{"id": string, "google_query_mirror": string}]`;

function isValidMirrored(item: unknown): item is MirroredPrompt {
  if (!item || typeof item !== "object") return false;
  const x = item as { id?: unknown; google_query_mirror?: unknown };
  if (typeof x.id !== "string" || x.id.length === 0) return false;
  if (
    typeof x.google_query_mirror !== "string" ||
    x.google_query_mirror.trim().length === 0
  ) {
    return false;
  }
  return true;
}

/**
 * Normalise the model's mirror output. We trust the model on content
 * but enforce length and case rules client-side so a sloppy emit
 * doesn't poison the DB. The 8-word cap mirrors the system prompt.
 */
function normaliseMirror(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\?$/, "") // trailing question mark, if it slipped through
    .replace(/[,.;:'"]/g, "") // punctuation
    .replace(/\s+/g, " ");
  const words = cleaned.split(" ");
  return words.slice(0, 8).join(" ").toLowerCase();
}

/**
 * Mirror a batch of AI prompts to plain-English Google search queries.
 * Pure: no DB writes, no telemetry inside (caller logs usage).
 *
 * v1 implementation is LLM-inferred via Haiku. The function signature
 * is shaped so a future v2 can swap in a real keyword API without
 * touching anything outside this file.
 */
export async function mirrorPrompts(input: {
  brandName: string;
  prompts: PromptForMirroring[];
}): Promise<MirrorPromptsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-...")) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  if (input.prompts.length === 0) {
    return {
      mirrored: [],
      usage: {
        model: HAIKU_MODEL,
        input_tokens: 0,
        output_tokens: 0,
        duration_ms: 0,
      },
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const startedAt = Date.now();

  const userMessage = [
    `Brand context: the tracked brand is "${input.brandName}". Do not include this name (or any obvious alias) in any mirror.`,
    "",
    "Mirror the following prompts:",
    JSON.stringify(
      input.prompts.map((p) => ({ id: p.id, text: p.text }))
    ),
  ].join("\n");

  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Haiku returned no text content for prompt mirroring");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(textBlock.text));
  } catch {
    throw new Error(
      `Haiku returned malformed JSON for mirroring: ${textBlock.text.slice(0, 200)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Haiku returned a non-array response for mirror batch");
  }

  const mirrored: MirroredPrompt[] = parsed
    .filter(isValidMirrored)
    .map((row) => ({
      id: row.id,
      google_query_mirror: normaliseMirror(row.google_query_mirror),
    }))
    // Drop any whose mirror collapsed to empty after normalisation.
    .filter((row) => row.google_query_mirror.length > 0);

  return {
    mirrored,
    usage: {
      model: response.model ?? HAIKU_MODEL,
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      duration_ms: Date.now() - startedAt,
    },
  };
}
