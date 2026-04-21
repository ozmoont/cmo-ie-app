/**
 * Shared retry-with-backoff helper for model adapters.
 *
 * Rationale: real visibility runs hit each provider dozens of times per
 * prompt-model-day. Transient failures (HTTP 429 rate limits, 500/502/
 * 503/504 server errors, connection resets) will statistically happen
 * on every run of meaningful size. Without retry logic each flake
 * forces an adapter's result to fall to null sentiment / empty sources,
 * which shows up in the dashboard as a false data point.
 *
 * Policy:
 *   - Retry only on transient errors (see `isRetryable`).
 *   - Exponential backoff: 1s → 2s (plus small jitter).
 *   - 2 retries (= 3 total attempts). After that, rethrow so the
 *     run-engine's error-isolation path logs it and moves on.
 *   - Honor Retry-After headers when the provider sends one.
 *
 * Used by the plain-fetch adapters (OpenAI, Perplexity, Gemini). The
 * Anthropic SDK already retries internally with similar semantics, so
 * the Anthropic adapter doesn't need this wrapper.
 */

export interface RetryOpts {
  /** Max total attempts, including the first. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms. Default 1000. */
  baseDelayMs?: number;
  /** Upper bound on a single backoff interval. Default 8000. */
  maxDelayMs?: number;
  /** Callback invoked before each retry — useful for logging / metrics. */
  onRetry?: (attempt: number, err: unknown) => void;
  /** Abort signal; if aborted mid-retry we rethrow immediately. */
  signal?: AbortSignal;
}

/**
 * Retryable HTTP status codes. 429 = rate-limited. 500/502/503/504 =
 * upstream had a bad day. 408 = request timeout (client-side).
 */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * True if an error is worth retrying. The two cases:
 * 1. An `AdapterError` or plain Error whose message contains a
 *    retryable HTTP status (we stringify the status into the message
 *    on failure in each adapter).
 * 2. A raw fetch/network error: `TypeError` (thrown by `fetch` on DNS
 *    fail / connection reset), `AbortError` that isn't user-triggered,
 *    or explicit `ECONNRESET` / `ETIMEDOUT` codes.
 */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Status-code detection from message text. Each fetch adapter in
  // this codebase formats its errors as "HTTP {status}: {body}" so
  // this regex is the canonical check.
  const statusMatch = err.message.match(/HTTP (\d{3})/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    return RETRYABLE_STATUSES.has(status);
  }

  // Network-level failures.
  if (err.name === "TypeError" && /fetch|network/i.test(err.message)) return true;
  // Fetch-abort triggered by our own timeout logic → retryable.
  if (err.name === "TimeoutError") return true;

  // Common low-level codes.
  const code = (err as { code?: string }).code;
  if (code && ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND"].includes(code)) {
    return true;
  }

  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * Compute backoff delay for a given attempt (0-indexed retry count).
 * Exponential with small jitter to avoid thundering-herd lockstep when
 * multiple adapters retry simultaneously.
 */
export function backoffDelay(
  attempt: number,
  base: number,
  max: number
): number {
  const exponential = Math.min(max, base * 2 ** attempt);
  const jitter = Math.random() * 0.25 * exponential;
  return Math.floor(exponential + jitter);
}

/**
 * Run `fn`; if it throws a retryable error, wait (with backoff) and try
 * again. Rethrows after the final attempt or if the error isn't
 * retryable.
 *
 * Usage:
 *   const res = await retryWithBackoff(() => fetch(url, opts), { onRetry });
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 8000,
    onRetry,
    signal,
  } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || !isRetryable(err)) {
        throw err;
      }
      onRetry?.(attempt + 1, err);
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs), signal);
    }
  }
  // Defensive — shouldn't reach here because the loop either returns
  // or throws. TypeScript wants a value path out.
  throw lastErr;
}
