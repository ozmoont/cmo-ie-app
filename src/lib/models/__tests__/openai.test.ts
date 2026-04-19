import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openaiAdapter } from "../openai";

const ORIGINAL = process.env.OPENAI_API_KEY;

function mockFetch(response: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  }) as unknown as typeof fetch;
}

describe("openaiAdapter", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL;
    vi.restoreAllMocks();
  });

  it("parses message content and url_citation annotations as inline", async () => {
    mockFetch({
      id: "resp_1",
      model: "gpt-4.1-2025-04-14",
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              { url: "https://extra.ie/deep", title: "Extra source" },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "North Design is a strong option.",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://northdesign.ie/",
                  title: "North Design",
                },
              ],
            },
          ],
        },
      ],
    });

    const res = await openaiAdapter.query("q");
    expect(res.text).toContain("North Design");
    // Two sources total: one cited inline, one retrieved.
    expect(res.sources).toHaveLength(2);
    const inline = res.sources.find((s) => s.cited_inline);
    const retrieved = res.sources.find((s) => !s.cited_inline);
    expect(inline?.domain).toBe("northdesign.ie");
    expect(retrieved?.domain).toBe("extra.ie");
    expect(res.model_version).toBe("gpt-4.1-2025-04-14");
  });

  it("surfaces HTTP errors as AdapterError with status code", async () => {
    mockFetch({ error: "rate limited" }, false);
    await expect(openaiAdapter.query("q")).rejects.toThrow(/chatgpt.*HTTP 500/);
  });
});
