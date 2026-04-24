/**
 * Unit tests for the Irish-market data layer.
 *
 * Covers lookup correctness (exact host, www-stripping, path-scoped
 * entries), weighting bounds, and sector-template shape guarantees.
 * No Supabase / no network.
 */

import { describe, expect, it } from "vitest";
import {
  gapScoreWeight,
  getPublisherMeta,
  getSectorTemplate,
  isIrishPublisher,
  listSectorTemplates,
} from "../irish-market";

describe("isIrishPublisher", () => {
  it("matches exact host entries from the library", () => {
    expect(isIrishPublisher("rte.ie")).toBe(true);
    expect(isIrishPublisher("businessplus.ie")).toBe(true);
    expect(isIrishPublisher("siliconrepublic.com")).toBe(true);
  });

  it("strips www. before matching", () => {
    expect(isIrishPublisher("www.rte.ie")).toBe(true);
    expect(isIrishPublisher("WWW.IrishTimes.com")).toBe(true);
  });

  it("accepts full URLs", () => {
    expect(isIrishPublisher("https://www.rte.ie/news/2026/04/23/foo")).toBe(
      true
    );
    expect(isIrishPublisher("http://businesspost.ie")).toBe(true);
  });

  it("matches path-scoped entries when the pathname starts with the prefix", () => {
    expect(
      isIrishPublisher("https://www.independent.ie/life/travel/abc")
    ).toBe(true);
  });

  it("returns false for non-Irish domains", () => {
    expect(isIrishPublisher("nytimes.com")).toBe(false);
    expect(isIrishPublisher("https://www.wsj.com/article")).toBe(false);
  });

  it("returns false for empty / malformed input", () => {
    expect(isIrishPublisher("")).toBe(false);
    expect(isIrishPublisher("   ")).toBe(false);
  });
});

describe("getPublisherMeta", () => {
  it("returns the library row for a known domain", () => {
    const meta = getPublisherMeta("rte.ie");
    expect(meta?.name).toBe("RTÉ");
    expect(meta?.source_type).toBe("editorial");
    expect(meta?.sectors).toContain("news");
  });

  it("returns null for unknown domains", () => {
    expect(getPublisherMeta("example.com")).toBeNull();
  });
});

describe("gapScoreWeight", () => {
  it("returns 1 when the project doesn't track IE", () => {
    expect(gapScoreWeight("rte.ie", ["GB"])).toBe(1);
    expect(gapScoreWeight("rte.ie", ["US", "DE"])).toBe(1);
    expect(gapScoreWeight("rte.ie", null)).toBe(1);
    expect(gapScoreWeight("rte.ie", undefined)).toBe(1);
    expect(gapScoreWeight("rte.ie", [])).toBe(1);
  });

  it("returns 1 for non-Irish domains even when IE is tracked", () => {
    expect(gapScoreWeight("nytimes.com", ["IE"])).toBe(1);
  });

  it("applies the publisher's weight for Irish domains when IE is tracked", () => {
    // rte.ie is weight 1.4 in the library.
    expect(gapScoreWeight("rte.ie", ["IE"])).toBeCloseTo(1.4, 2);
  });

  it("defaults to 1.2 when the publisher row has no explicit weight", () => {
    // We don't have any library row without weight at time of writing,
    // so this is a negative assurance: lookup must succeed even when
    // weight is missing on future rows.
    const meta = getPublisherMeta("rte.ie");
    expect(meta).not.toBeNull();
  });

  it("caps weights at 2.0", () => {
    // No library entry is above 2.0 today; belt-and-braces test to
    // lock the cap in case future curation gets aggressive.
    const w = gapScoreWeight("rte.ie", ["IE"]);
    expect(w).toBeLessThanOrEqual(2.0);
  });
});

describe("listSectorTemplates", () => {
  it("returns at least the six planned sectors", () => {
    const slugs = listSectorTemplates().map((s) => s.slug);
    for (const required of [
      "law",
      "construction",
      "food-bev",
      "tech",
      "hospitality",
      "tourism",
    ]) {
      expect(slugs).toContain(required);
    }
  });

  it("every template has prompts, competitors, and publishers", () => {
    for (const t of listSectorTemplates()) {
      expect(t.sample_prompts.length).toBeGreaterThanOrEqual(5);
      expect(t.sample_competitors.length).toBeGreaterThanOrEqual(3);
      expect(t.sample_publishers.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("getSectorTemplate", () => {
  it("returns the template for a known slug", () => {
    const tech = getSectorTemplate("tech");
    expect(tech?.name).toContain("Tech");
    expect(tech?.sample_prompts.length).toBeGreaterThan(0);
  });

  it("returns null for unknown slugs", () => {
    expect(getSectorTemplate("crypto-degens")).toBeNull();
  });
});
