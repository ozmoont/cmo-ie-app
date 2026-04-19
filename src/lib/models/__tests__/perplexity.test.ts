import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { perplexityAdapter } from "../perplexity";

const ORIGINAL_KEY = process.env.PERPLEXITY_API_KEY;

function mockFetch(response: unknown, ok = true, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  }) as unknown as typeof fetch;
}

describe("perplexityAdapter", () => {
  beforeEach(() => {
    process.env.PERPLEXITY_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.PERPLEXITY_API_KEY = ORIGINAL_KEY;
    vi.restoreAllMocks();
  });

  it("reports unavailable when no API key is set", () => {
    delete process.env.PERPLEXITY_API_KEY;
    expect(perplexityAdapter.available()).toBe(false);
  });

  it("reports available when API key is set", () => {
    expect(perplexityAdapter.available()).toBe(true);
  });

  it("parses a standard sonar response with search_results and inline markers", async () => {
    mockFetch({
      id: "abc",
      model: "sonar-pro",
      choices: [
        {
          message: {
            role: "assistant",
            content:
              "North Design [1] is a leading studio. Kingston Lafferty [2] is another. Unmentioned studio here.",
          },
        },
      ],
      search_results: [
        { url: "https://northdesign.ie/", title: "North Design" },
        {
          url: "https://kingstonlaffertydesign.com/",
          title: "Kingston Lafferty Design",
        },
        { url: "https://irish-times.com/design", title: "Irish Times" },
      ],
    });

    const res = await perplexityAdapter.query("best dublin interior design");
    expect(res.sources).toHaveLength(3);
    expect(res.sources[0].domain).toBe("northdesign.ie");
    // [1] and [2] referenced inline → first two are cited inline.
    expect(res.sources[0].cited_inline).toBe(true);
    expect(res.sources[1].cited_inline).toBe(true);
    // Third source has no [3] marker in the body → retrieved, not cited.
    expect(res.sources[2].cited_inline).toBe(false);
    expect(res.model_version).toBe("sonar-pro");
  });

  it("treats all citations as inline when no [N] markers appear", async () => {
    mockFetch({
      id: "def",
      model: "sonar-pro",
      choices: [
        {
          message: {
            role: "assistant",
            content: "Short answer without numbered markers.",
          },
        },
      ],
      citations: ["https://example.ie/a", "https://example.ie/b"],
    });

    const res = await perplexityAdapter.query("q");
    expect(res.sources).toHaveLength(2);
    expect(res.sources.every((s) => s.cited_inline)).toBe(true);
  });

  it("throws AdapterError on non-OK response", async () => {
    mockFetch({ error: "bad" }, false, 500);
    await expect(perplexityAdapter.query("q")).rejects.toThrow(
      /perplexity.*HTTP 500/
    );
  });
});
