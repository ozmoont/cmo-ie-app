import { describe, expect, it, vi } from "vitest";
import {
  backoffDelay,
  isRetryable,
  retryWithBackoff,
} from "../retry";
import { AdapterError } from "../types";

describe("isRetryable", () => {
  it("retries on 429 / 500 / 502 / 503 / 504", () => {
    for (const code of [429, 500, 502, 503, 504, 408, 425]) {
      expect(isRetryable(new Error(`HTTP ${code}: server busy`))).toBe(true);
    }
  });

  it("does not retry on 4xx client errors", () => {
    for (const code of [400, 401, 403, 404]) {
      expect(isRetryable(new Error(`HTTP ${code}: nope`))).toBe(false);
    }
  });

  it("retries AdapterError instances with retryable status", () => {
    const err = new AdapterError("chatgpt", "HTTP 503: temporarily unavailable");
    expect(isRetryable(err)).toBe(true);
  });

  it("retries on network failures", () => {
    const err = new TypeError("fetch failed");
    expect(isRetryable(err)).toBe(true);
  });

  it("retries on low-level error codes", () => {
    const err = new Error("connection dropped");
    (err as Error & { code: string }).code = "ECONNRESET";
    expect(isRetryable(err)).toBe(true);
  });

  it("ignores non-errors", () => {
    expect(isRetryable("just a string")).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(42)).toBe(false);
  });
});

describe("backoffDelay", () => {
  it("grows exponentially with attempts", () => {
    // Attempt 0: base + jitter up to 25% (so 1000-1250)
    // Attempt 1: 2x base
    // Attempt 2: 4x base
    // Attempt 3: capped at max
    const a0 = backoffDelay(0, 1000, 8000);
    const a1 = backoffDelay(1, 1000, 8000);
    const a2 = backoffDelay(2, 1000, 8000);
    expect(a0).toBeGreaterThanOrEqual(1000);
    expect(a0).toBeLessThanOrEqual(1250);
    expect(a1).toBeGreaterThanOrEqual(2000);
    expect(a1).toBeLessThanOrEqual(2500);
    expect(a2).toBeGreaterThanOrEqual(4000);
    expect(a2).toBeLessThanOrEqual(5000);
  });

  it("caps at maxDelayMs even with high attempt counts", () => {
    const a10 = backoffDelay(10, 1000, 8000);
    expect(a10).toBeGreaterThanOrEqual(8000);
    expect(a10).toBeLessThanOrEqual(10000); // 8000 + 25% jitter
  });
});

describe("retryWithBackoff", () => {
  it("returns immediately when fn succeeds first time", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retryWithBackoff(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable errors then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 503: busy"))
      .mockRejectedValueOnce(new Error("HTTP 503: busy"))
      .mockResolvedValueOnce("success");

    const onRetry = vi.fn();
    const result = await retryWithBackoff(fn, {
      baseDelayMs: 1, // speed up the test
      maxDelayMs: 1,
      onRetry,
    });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-retryable errors", async () => {
    const err = new Error("HTTP 401: unauthorized");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(retryWithBackoff(fn, { baseDelayMs: 1 })).rejects.toThrow(
      /401/
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows after exhausting maxAttempts", async () => {
    const err = new Error("HTTP 503: persistent");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      retryWithBackoff(fn, { baseDelayMs: 1, maxAttempts: 3 })
    ).rejects.toThrow(/503/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects custom maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 503: busy"));
    await expect(
      retryWithBackoff(fn, { baseDelayMs: 1, maxAttempts: 5 })
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("aborts mid-retry when the signal fires", async () => {
    const controller = new AbortController();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 503"))
      .mockImplementationOnce(() => {
        // Abort during the delay between retry 1 and retry 2.
        controller.abort();
        return Promise.reject(new Error("HTTP 503"));
      });
    await expect(
      retryWithBackoff(fn, {
        baseDelayMs: 10,
        maxAttempts: 5,
        signal: controller.signal,
      })
    ).rejects.toThrow(/Aborted/);
    // fn is called at least once; exact count depends on timing.
    expect(fn.mock.calls.length).toBeGreaterThan(0);
  });
});
