import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAdapters } from "..";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "PERPLEXITY_API_KEY",
] as const;

describe("resolveAdapters — BYOK overrides", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it("returns no adapters available when no keys are set anywhere", () => {
    const { available, missing } = resolveAdapters([
      "claude",
      "chatgpt",
      "gemini",
      "perplexity",
    ]);
    expect(available).toHaveLength(0);
    expect(missing).toEqual(["claude", "chatgpt", "gemini", "perplexity"]);
  });

  it("lights up an adapter when only the env-var key is set", () => {
    process.env.ANTHROPIC_API_KEY = "env-key";
    const { available, missing } = resolveAdapters([
      "claude",
      "chatgpt",
    ]);
    expect(available.map((a) => a.name)).toEqual(["claude"]);
    expect(missing).toEqual(["chatgpt"]);
  });

  it("lights up an adapter when only a BYOK override is supplied", () => {
    const { available, missing } = resolveAdapters(
      ["claude", "perplexity"],
      { apiKeys: { perplexity: "byok-key" } }
    );
    expect(available.map((a) => a.name)).toEqual(["perplexity"]);
    expect(missing).toEqual(["claude"]);
  });

  it("treats env-var AND override as redundantly available (override wins)", () => {
    process.env.OPENAI_API_KEY = "env-openai";
    const { available } = resolveAdapters(["chatgpt"], {
      apiKeys: { chatgpt: "byok-openai" },
    });
    expect(available.map((a) => a.name)).toEqual(["chatgpt"]);
  });

  it("keeps unimplemented models in their own bucket", () => {
    process.env.ANTHROPIC_API_KEY = "k";
    const { available, missing, unimplemented } = resolveAdapters([
      "claude",
      "google_aio",
    ]);
    expect(available.map((a) => a.name)).toEqual(["claude"]);
    expect(missing).toEqual([]);
    expect(unimplemented).toEqual(["google_aio"]);
  });
});
