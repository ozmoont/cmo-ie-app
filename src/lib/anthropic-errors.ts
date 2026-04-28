/**
 * Shared Anthropic SDK error → user-facing shape mapper.
 *
 * The Anthropic SDK throws errors with this nested shape:
 *   { status, error: { error: { type, message } }, message }
 *
 * This helper sniffs the inner message for well-known phrases —
 * billing, auth, rate limiting — and returns a {status, code, message}
 * triple the API route can hand straight to NextResponse.json. The
 * goal is that an operator hitting "Top up credits" in the UI gets a
 * useful instruction, not a generic 500.
 *
 * Lifted out of /api/prompts/suggest as part of Phase 6 so the four
 * prompt-related routes (suggest / generate / score / mirror) share a
 * single error-mapping path.
 */

export interface MappedAnthropicError {
  status: number;
  code: string;
  message: string;
}

export function mapAnthropicError(err: unknown): MappedAnthropicError {
  const anyErr = err as {
    status?: number;
    error?: { error?: { type?: string; message?: string } };
    message?: string;
  };
  const inner = anyErr.error?.error;
  const text = (inner?.message ?? anyErr.message ?? "").toLowerCase();
  const status = anyErr.status ?? 500;

  if (text.includes("credit balance is too low")) {
    return {
      status: 402,
      code: "anthropic_credits_exhausted",
      message:
        "Your Anthropic account is out of credits. Top up at console.anthropic.com/settings/billing and retry.",
    };
  }
  if (status === 401 || text.includes("authentication")) {
    return {
      status: 401,
      code: "anthropic_auth_failed",
      message:
        "Anthropic API key is missing or invalid. Check ANTHROPIC_API_KEY in your env or the org's BYOK key.",
    };
  }
  if (status === 429 || text.includes("rate limit")) {
    return {
      status: 429,
      code: "anthropic_rate_limited",
      message:
        "Anthropic rate limit hit. Retry in 30-60s; if it keeps happening, you're on a plan with low concurrent limits.",
    };
  }
  return {
    status: 500,
    code: "anthropic_call_failed",
    message: "The Anthropic call failed. Check the server log for details.",
  };
}

/**
 * Strip ```json fences if Claude returned a code-block-wrapped JSON
 * payload. Idempotent — passes through plain JSON unchanged. Returns
 * the raw JSON string ready for JSON.parse.
 */
export function stripJsonFences(raw: string): string {
  let trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }
  return trimmed;
}
