import { describe, it, expect } from "vitest";
import { computeCost, findPricing } from "@/lib/ai-pricing";

describe("findPricing", () => {
  it("matches claude-haiku-4-5 by prefix", () => {
    const p = findPricing("anthropic", "claude-haiku-4-5-20251001");
    expect(p).not.toBeNull();
    expect(p?.input_per_m).toBe(0.8);
    expect(p?.output_per_m).toBe(4.0);
    expect(p?.web_search_per_call).toBe(0.01);
  });

  it("matches gpt-4.1-mini before falling through to gpt-4.1", () => {
    // Prefix "gpt-4.1-mini" must match before the shorter "gpt-4.1"
    // row. This is the ordering contract in PRICING[].
    const p = findPricing("openai", "gpt-4.1-mini-2024-05-13");
    expect(p).not.toBeNull();
    expect(p?.input_per_m).toBe(0.4);
  });

  it("returns null for unknown models", () => {
    expect(findPricing("anthropic", "claude-foo-99")).toBeNull();
  });

  it("is case-insensitive on the model string", () => {
    const p = findPricing("openai", "GPT-4.1-2025-04-14");
    expect(p?.input_per_m).toBe(2.0);
  });
});

describe("computeCost", () => {
  it("computes input+output in USD with 6dp precision", () => {
    // 1M input + 1M output on Sonnet 4-6: $3 + $15 = $18.
    const cost = computeCost({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBe(18);
  });

  it("adds the web_search surcharge on Anthropic when calls > 0", () => {
    // Haiku: tiny token cost + 2 × $0.01 web calls = $0.02 more.
    const cost = computeCost({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      input_tokens: 1000,
      output_tokens: 500,
      web_search_calls: 2,
    });
    // 0.8 * 0.001 + 4.0 * 0.0005 = 0.0008 + 0.002 = 0.0028 + 0.02 surcharge
    expect(cost).toBeCloseTo(0.0228, 6);
  });

  it("returns 0 for unknown models rather than NaN", () => {
    const cost = computeCost({
      provider: "openai",
      model: "gpt-99-unreleased",
      input_tokens: 500_000,
      output_tokens: 500_000,
    });
    expect(cost).toBe(0);
  });
});
