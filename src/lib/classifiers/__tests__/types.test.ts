import { describe, expect, it } from "vitest";
import {
  canonicaliseDomain,
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_PLAYBOOK,
  PAGE_TYPES,
  PAGE_TYPE_LABELS,
} from "../types";

describe("canonicaliseDomain", () => {
  it("strips scheme, www, and path", () => {
    expect(canonicaliseDomain("https://www.acme.ie/about/us")).toBe("acme.ie");
    expect(canonicaliseDomain("http://Acme.IE/")).toBe("acme.ie");
    expect(canonicaliseDomain("www.irishtimes.com")).toBe("irishtimes.com");
  });

  it("lowercases everything", () => {
    expect(canonicaliseDomain("HTTPS://IrishTimes.COM/X")).toBe(
      "irishtimes.com"
    );
  });

  it("returns empty for empty / whitespace input", () => {
    expect(canonicaliseDomain("")).toBe("");
    expect(canonicaliseDomain("   ")).toBe("");
  });

  it("handles already-clean input unchanged", () => {
    expect(canonicaliseDomain("hubspot.com")).toBe("hubspot.com");
  });
});

describe("SOURCE_TYPES / PAGE_TYPES enums", () => {
  it("every source_type has a label + playbook entry", () => {
    for (const t of SOURCE_TYPES) {
      expect(SOURCE_TYPE_LABELS[t]).toBeTruthy();
      expect(SOURCE_TYPE_PLAYBOOK[t]).toBeTruthy();
    }
  });

  it("every page_type has a label entry", () => {
    for (const t of PAGE_TYPES) {
      expect(PAGE_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  it("SOURCE_TYPES enum values match the migration 010 CHECK constraint", () => {
    // Guard against drift between the enum in types.ts and the DB check.
    const expected = [
      "editorial",
      "corporate",
      "ugc",
      "reference",
      "your_own",
      "social",
      "other",
    ];
    expect([...SOURCE_TYPES]).toEqual(expected);
  });

  it("PAGE_TYPES enum values match the migration 010 CHECK constraint", () => {
    const expected = [
      "article",
      "listicle",
      "how_to",
      "comparison",
      "review",
      "product_page",
      "landing",
      "directory",
      "forum_thread",
      "faq",
      "other",
    ];
    expect([...PAGE_TYPES]).toEqual(expected);
  });
});
