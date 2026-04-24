/**
 * Tests for parseAnthropicContent.
 *
 * Fixtures are hand-written approximations of what the Anthropic
 * messages.create response looks like with the web_search tool
 * enabled. They cover the patterns we've seen in production:
 *
 *   - Single text block, no tool use → text-only extraction
 *   - Text block with inline citations → cited_inline: true
 *   - web_search_tool_result with URLs not in any text block →
 *     cited_inline: false
 *   - Same URL both inline AND in the tool result → deduped, keeps
 *     cited_inline: true (inline wins)
 *   - Thinking / tool_use blocks interleaved → ignored, don't crash
 *   - Missing / null citations array → handled gracefully
 *   - Citation without a URL → skipped
 *
 * These lock in the behaviour so the citation-rate column on the
 * Sources dashboard can't silently drift between SDK bumps.
 */

import { describe, expect, it } from "vitest";
import { parseAnthropicContent } from "../anthropic";

describe("parseAnthropicContent: text + inline citations", () => {
  it("extracts text and marks citation URLs as cited_inline", () => {
    const content = [
      {
        type: "text",
        text: "Irish Times reports strong growth.",
        citations: [
          { url: "https://www.irishtimes.com/business/foo", title: "Foo" },
        ],
      },
    ];
    const out = parseAnthropicContent(content);
    expect(out.text).toBe("Irish Times reports strong growth.");
    expect(out.sources).toHaveLength(1);
    expect(out.sources[0]).toMatchObject({
      url: "https://www.irishtimes.com/business/foo",
      domain: "irishtimes.com",
      cited_inline: true,
      position: 1,
    });
  });

  it("handles multiple text blocks with different citations", () => {
    const content = [
      {
        type: "text",
        text: "First para.",
        citations: [{ url: "https://a.ie/x" }],
      },
      {
        type: "text",
        text: "Second para.",
        citations: [{ url: "https://b.com/y" }],
      },
    ];
    const out = parseAnthropicContent(content);
    expect(out.text).toBe("First para.\nSecond para.");
    expect(out.sources.map((s) => s.url)).toEqual([
      "https://a.ie/x",
      "https://b.com/y",
    ]);
    for (const s of out.sources) expect(s.cited_inline).toBe(true);
  });

  it("tracks positions in the order URLs first appear", () => {
    const content = [
      {
        type: "text",
        text: "Intro.",
        citations: [{ url: "https://first.ie" }, { url: "https://second.ie" }],
      },
    ];
    const out = parseAnthropicContent(content);
    expect(out.sources[0].position).toBe(1);
    expect(out.sources[1].position).toBe(2);
  });
});

describe("parseAnthropicContent: web_search_tool_result sidebar URLs", () => {
  it("marks URLs from tool results as cited_inline: false", () => {
    const content = [
      { type: "text", text: "Some analysis.", citations: [] },
      {
        type: "web_search_tool_result",
        content: [
          { url: "https://side.ie/a" },
          { url: "https://side.ie/b" },
        ],
      },
    ];
    const out = parseAnthropicContent(content);
    expect(out.sources).toHaveLength(2);
    expect(out.sources.every((s) => !s.cited_inline)).toBe(true);
  });

  it("does not duplicate when the same URL is both inline and in tool results — inline wins", () => {
    const content = [
      {
        type: "text",
        text: "Cited.",
        citations: [{ url: "https://both.ie/x", title: "X" }],
      },
      {
        type: "web_search_tool_result",
        content: [
          { url: "https://both.ie/x" },
          { url: "https://unique.ie/y" },
        ],
      },
    ];
    const out = parseAnthropicContent(content);
    expect(out.sources).toHaveLength(2);
    const both = out.sources.find((s) => s.url === "https://both.ie/x");
    const uniq = out.sources.find((s) => s.url === "https://unique.ie/y");
    expect(both?.cited_inline).toBe(true);
    expect(uniq?.cited_inline).toBe(false);
  });

  it("preserves order: inline citations come before sidebar-only URLs when text blocks come first", () => {
    const content = [
      {
        type: "text",
        text: "Cited in the body.",
        citations: [{ url: "https://inline.ie" }],
      },
      {
        type: "web_search_tool_result",
        content: [{ url: "https://sidebar.ie" }],
      },
    ];
    const out = parseAnthropicContent(content);
    expect(out.sources[0].url).toBe("https://inline.ie");
    expect(out.sources[0].cited_inline).toBe(true);
    expect(out.sources[1].url).toBe("https://sidebar.ie");
    expect(out.sources[1].cited_inline).toBe(false);
  });
});

describe("parseAnthropicContent: robustness", () => {
  it("returns empty values when content is not an array", () => {
    expect(parseAnthropicContent(null)).toEqual({ text: "", sources: [] });
    expect(parseAnthropicContent(undefined)).toEqual({ text: "", sources: [] });
    expect(parseAnthropicContent({})).toEqual({ text: "", sources: [] });
  });

  it("ignores tool_use, thinking, and other unknown block types", () => {
    const content = [
      { type: "thinking", thinking: "hmm" },
      { type: "tool_use", name: "web_search", input: {} },
      { type: "text", text: "Real answer." },
      { type: "unknown_future_block_type", foo: "bar" },
    ];
    const out = parseAnthropicContent(content);
    expect(out.text).toBe("Real answer.");
    expect(out.sources).toHaveLength(0);
  });

  it("handles a text block with no citations array", () => {
    const content = [{ type: "text", text: "No citations here." }];
    const out = parseAnthropicContent(content);
    expect(out.text).toBe("No citations here.");
    expect(out.sources).toEqual([]);
  });

  it("skips citation entries that have no url", () => {
    const content = [
      {
        type: "text",
        text: "Partial.",
        citations: [
          { title: "No URL here" },
          { url: "" },
          { url: "https://real.ie" },
        ],
      },
    ];
    const out = parseAnthropicContent(content);
    expect(out.sources).toHaveLength(1);
    expect(out.sources[0].url).toBe("https://real.ie");
  });

  it("trims outer whitespace on the joined text (internal whitespace preserved)", () => {
    const content = [
      { type: "text", text: "\n\nHello.\n\n" },
      { type: "text", text: "World.\n" },
    ];
    const out = parseAnthropicContent(content);
    // Outer \n stripped by trim(); internal newlines between blocks
    // are preserved as-is (we don't aggressively collapse).
    expect(out.text.startsWith("Hello.")).toBe(true);
    expect(out.text.endsWith("World.")).toBe(true);
    expect(out.text).toContain("Hello.");
    expect(out.text).toContain("World.");
  });
});

describe("parseAnthropicContent: realistic citation-heavy fixture", () => {
  // Approximation of what Claude returns on a prompt like "list the
  // best SaaS companies in Ireland with sources" — 6 inline citations
  // across 3 text blocks, plus 4 sidebar-only URLs on the tool result.
  it("handles a citation-heavy response without drift", () => {
    const content = [
      { type: "thinking", thinking: "let me search" },
      { type: "tool_use", name: "web_search", input: { query: "best Irish SaaS" } },
      {
        type: "web_search_tool_result",
        content: [
          { url: "https://siliconrepublic.com/sr1", title: "Silicon Republic" },
          { url: "https://techireland.org/list", title: "Tech Ireland list" },
          { url: "https://businesspost.ie/article-1", title: "Business Post" },
          { url: "https://fora.ie/fora-1", title: "Fora" },
          { url: "https://example.com/irrelevant", title: "Irrelevant aggregator" },
        ],
      },
      {
        type: "text",
        text: "Ireland's SaaS scene is active. ",
        citations: [
          { url: "https://siliconrepublic.com/sr1", title: "Silicon Republic" },
        ],
      },
      {
        type: "text",
        text: "Notable companies include Intercom and Stripe's Dublin office.",
        citations: [
          { url: "https://techireland.org/list", title: "Tech Ireland list" },
          { url: "https://businesspost.ie/article-1", title: "Business Post" },
        ],
      },
      {
        type: "text",
        text: "Fora also profiles Workhuman and Fenergo regularly.",
        citations: [
          { url: "https://fora.ie/fora-1", title: "Fora" },
        ],
      },
    ];

    const out = parseAnthropicContent(content);
    expect(out.text).toContain("Ireland's SaaS scene is active.");
    expect(out.text).toContain("Fora also profiles");

    // 5 URLs total (4 inline-deduped + 1 sidebar-only)
    expect(out.sources).toHaveLength(5);

    const inlineCount = out.sources.filter((s) => s.cited_inline).length;
    const sidebarCount = out.sources.filter((s) => !s.cited_inline).length;
    expect(inlineCount).toBe(4);
    expect(sidebarCount).toBe(1);

    // The sidebar-only domain should be the one we never cite inline.
    expect(out.sources.find((s) => !s.cited_inline)?.domain).toBe(
      "example.com"
    );
  });
});
