/**
 * Unit tests for the gap-aware brief scaffolding. These cover the
 * string-shaping primitives that feed the Claude prompt — not the
 * Anthropic call itself. The contract we want to lock in:
 *
 * 1. Each source_type emits a unique playbook instruction.
 * 2. `null` / `other` source types fall back to a safe generic one.
 * 3. renderGapContext always emits scope + domain, adds optional
 *    fields only when set, and never prints `undefined`.
 * 4. deriveActionTitle picks a scope-appropriate default.
 */

import { describe, expect, it } from "vitest";
import type { SourceGap } from "../types";
import {
  deriveActionTitle,
  playbookInstruction,
  renderGapContext,
} from "../gap-brief-templates";

const baseGap: SourceGap = {
  scope: "domain",
  domain: "example.ie",
  captured_at: "2026-04-22T00:00:00.000Z",
};

describe("playbookInstruction", () => {
  it("returns a unique non-empty string for each known source_type", () => {
    const types: NonNullable<SourceGap["source_type"]>[] = [
      "editorial",
      "corporate",
      "ugc",
      "reference",
      "your_own",
      "social",
      "other",
    ];
    const seen = new Set<string>();
    for (const t of types) {
      const out = playbookInstruction({ ...baseGap, source_type: t });
      expect(out.length).toBeGreaterThan(20);
      seen.add(out);
    }
    expect(seen.size).toBe(types.length);
  });

  it("returns the generic-fallback instruction when source_type is null", () => {
    const out = playbookInstruction({ ...baseGap, source_type: null });
    expect(out).toContain("Source type unclear");
  });

  it("returns an empty string when no gap is provided", () => {
    expect(playbookInstruction(null)).toBe("");
    expect(playbookInstruction(undefined)).toBe("");
  });

  it("keeps editorial playbook focused on pitch / draft subject lines", () => {
    const out = playbookInstruction({ ...baseGap, source_type: "editorial" });
    expect(out.toLowerCase()).toContain("pitch");
    expect(out.toLowerCase()).toContain("subject line");
  });

  it("keeps UGC playbook focused on community reply, not marketing post", () => {
    const out = playbookInstruction({ ...baseGap, source_type: "ugc" });
    expect(out.toLowerCase()).toContain("community");
    expect(out.toLowerCase()).toContain("reply");
  });
});

describe("renderGapContext", () => {
  it("always prints scope + domain", () => {
    const text = renderGapContext(baseGap);
    expect(text).toContain("Scope: domain");
    expect(text).toContain("Domain: example.ie");
  });

  it("omits fields that are not set (no 'undefined' in output)", () => {
    const text = renderGapContext(baseGap);
    expect(text).not.toMatch(/undefined|null/);
    expect(text).not.toContain("URL:");
    expect(text).not.toContain("Source type:");
    expect(text).not.toContain("Page type:");
    expect(text).not.toContain("Competitors present here:");
  });

  it("adds optional fields when present", () => {
    const text = renderGapContext({
      ...baseGap,
      scope: "url",
      url: "https://example.ie/articles/foo",
      source_type: "editorial",
      page_type: "article",
      competitors: ["Acme", "Beta"],
      gap_score: 0.4234,
    });
    expect(text).toContain("Scope: url");
    expect(text).toContain("URL: https://example.ie/articles/foo");
    expect(text).toContain("Source type: editorial");
    expect(text).toContain("Page type: article");
    expect(text).toContain("Competitors present here: Acme, Beta");
    // gap_score is rendered to 3 decimals.
    expect(text).toContain("Gap score: 0.423");
  });
});

describe("deriveActionTitle", () => {
  it("picks an editorial-coloured title for domain-scope editorial gaps", () => {
    expect(
      deriveActionTitle({
        ...baseGap,
        source_type: "editorial",
      })
    ).toBe("Earn coverage on example.ie");
  });

  it("picks a submission-coloured title for reference gaps", () => {
    expect(
      deriveActionTitle({
        ...baseGap,
        source_type: "reference",
      })
    ).toBe("Get listed on example.ie");
  });

  it("uses the host when scope is url", () => {
    expect(
      deriveActionTitle({
        ...baseGap,
        scope: "url",
        url: "https://www.irishtimes.com/foo/bar",
        source_type: "editorial",
      })
    ).toBe("Pitch to irishtimes.com");
  });

  it("falls back to a generic 'Act on <domain>' when the type is unknown", () => {
    expect(
      deriveActionTitle({
        ...baseGap,
      })
    ).toBe("Act on example.ie");
  });
});
