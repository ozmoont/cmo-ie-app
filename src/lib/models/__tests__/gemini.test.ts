import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geminiAdapter } from "../gemini";

const ORIGINAL_GEMINI = process.env.GEMINI_API_KEY;
const ORIGINAL_GOOGLE = process.env.GOOGLE_API_KEY;

function mockFetch(response: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  }) as unknown as typeof fetch;
}

describe("geminiAdapter", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = ORIGINAL_GEMINI;
    process.env.GOOGLE_API_KEY = ORIGINAL_GOOGLE;
    vi.restoreAllMocks();
  });

  it("falls back to GOOGLE_API_KEY if GEMINI_API_KEY is unset", () => {
    delete process.env.GEMINI_API_KEY;
    expect(geminiAdapter.available()).toBe(false);
    process.env.GOOGLE_API_KEY = "fallback-key";
    expect(geminiAdapter.available()).toBe(true);
  });

  it("flags sources cited by groundingSupports as inline", async () => {
    mockFetch({
      modelVersion: "gemini-2.5-flash",
      candidates: [
        {
          content: { parts: [{ text: "Answer with grounded facts." }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://a.ie/", title: "A" } },
              { web: { uri: "https://b.ie/", title: "B" } },
              { web: { uri: "https://c.ie/", title: "C" } },
            ],
            // Only chunk 0 and 2 are referenced by any support.
            groundingSupports: [
              {
                segment: { text: "Answer" },
                groundingChunkIndices: [0],
              },
              {
                segment: { text: "grounded facts" },
                groundingChunkIndices: [2],
              },
            ],
          },
        },
      ],
    });

    const res = await geminiAdapter.query("q");
    expect(res.sources).toHaveLength(3);
    expect(res.sources[0].cited_inline).toBe(true); // index 0 supported
    expect(res.sources[1].cited_inline).toBe(false); // index 1 retrieved only
    expect(res.sources[2].cited_inline).toBe(true); // index 2 supported
  });

  it("returns empty response when no candidates come back", async () => {
    mockFetch({ candidates: [] });
    const res = await geminiAdapter.query("q");
    expect(res.text).toBe("");
    expect(res.sources).toEqual([]);
  });
});
