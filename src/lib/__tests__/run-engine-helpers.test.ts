/**
 * Unit tests for the run-engine's pure helper functions.
 *
 * These isolate the domain-matching and source-tagging logic from the
 * orchestration code (DB writes, streaming progress, concurrent adapter
 * calls). The orchestration path is covered by the smoke test + will be
 * further covered by a focused integration test once Supabase mocking
 * lands in a future sprint.
 */

import { describe, expect, it } from "vitest";
import {
  buildMatchables,
  normDomain,
  tagSources,
} from "../run-engine";
import type { Competitor, Project } from "../types";
import type { ModelSource } from "../models";

const makeProject = (over: Partial<Project> = {}): Project => ({
  id: "p1",
  org_id: "o1",
  name: "Acme Legal",
  brand_name: "Acme",
  website_url: "https://acme.ie",
  brand_display_name: "Acme Legal",
  brand_tracked_name: "Acme",
  brand_aliases: ["Acme Legal"],
  brand_regex_pattern: null,
  brand_domains: ["acme.ie"],
  profile_short_description: null,
  profile_market_segment: null,
  profile_brand_identity: null,
  profile_target_audience: null,
  profile_products_services: [],
  profile_updated_at: null,
  country_codes: ["IE"],
  models: ["claude"],
  is_pitch: false,
  created_at: new Date().toISOString(),
  ...over,
});

const makeCompetitor = (over: Partial<Competitor> = {}): Competitor => ({
  id: "c1",
  project_id: "p1",
  name: "Mason Hayes Curran",
  display_name: "Mason Hayes Curran",
  tracked_name: "Mason Hayes Curran",
  aliases: ["MHC"],
  regex_pattern: null,
  color: null,
  domains: ["mhc.ie"],
  website_url: "https://mhc.ie",
  created_at: new Date().toISOString(),
  ...over,
});

describe("normDomain", () => {
  it("returns null for null/undefined/empty", () => {
    expect(normDomain(null)).toBeNull();
    expect(normDomain(undefined)).toBeNull();
  });

  it("strips scheme and www", () => {
    expect(normDomain("https://www.acme.ie")).toBe("acme.ie");
    expect(normDomain("http://acme.ie/")).toBe("acme.ie");
  });

  it("lowercases hostnames", () => {
    expect(normDomain("HTTPS://Acme.IE/path")).toBe("acme.ie");
  });

  it("handles hostnames without scheme", () => {
    expect(normDomain("acme.ie")).toBe("acme.ie");
    expect(normDomain("www.acme.ie/foo")).toBe("acme.ie");
  });

  it("drops path / query / fragment", () => {
    expect(normDomain("https://acme.ie/path/deep?q=1#frag")).toBe("acme.ie");
  });
});

describe("buildMatchables", () => {
  it("puts the project brand first and marks it as tracked", () => {
    const matchables = buildMatchables(makeProject(), [makeCompetitor()]);
    expect(matchables).toHaveLength(2);
    expect(matchables[0].id).toBe("project");
    expect(matchables[0].is_tracked_brand).toBe(true);
    expect(matchables[1].is_tracked_brand).toBe(false);
  });

  it("carries over aliases and regex from the project brand", () => {
    const project = makeProject({
      brand_aliases: ["Acme", "Acme Legal", "AcmeIE"],
      brand_regex_pattern: "\\bAcme\\b",
    });
    const [trackedMatchable] = buildMatchables(project, []);
    expect(trackedMatchable.aliases).toEqual(["Acme", "Acme Legal", "AcmeIE"]);
    expect(trackedMatchable.regex_pattern).toBe("\\bAcme\\b");
  });

  it("falls back to legacy brand_name when tracked_name is empty", () => {
    const project = makeProject({
      brand_tracked_name: "",
      brand_display_name: "",
      brand_name: "LegacyBrand",
    });
    const [tracked] = buildMatchables(project, []);
    expect(tracked.tracked_name).toBe("LegacyBrand");
    expect(tracked.display_name).toBe("LegacyBrand");
  });

  it("maps competitor fields 1:1 with fallback on display/tracked name", () => {
    const comp = makeCompetitor({
      display_name: "",
      tracked_name: "",
      name: "LegacyCompetitor",
      aliases: ["LC"],
    });
    const matchables = buildMatchables(makeProject(), [comp]);
    const m = matchables[1];
    expect(m.id).toBe("c1");
    expect(m.tracked_name).toBe("LegacyCompetitor");
    expect(m.display_name).toBe("LegacyCompetitor");
    expect(m.aliases).toEqual(["LC"]);
  });
});

describe("tagSources", () => {
  const srcs: ModelSource[] = [
    {
      url: "https://acme.ie/about",
      domain: "acme.ie",
      cited_inline: true,
      position: 1,
    },
    {
      url: "https://mhc.ie/team",
      domain: "mhc.ie",
      cited_inline: false,
      position: 2,
    },
    {
      url: "https://irishtimes.com/x",
      domain: "irishtimes.com",
      cited_inline: true,
      position: 3,
    },
  ];

  it("flags brand-owned domains", () => {
    const tagged = tagSources(srcs, new Set(["acme.ie"]), [{ domain: "mhc.ie" }]);
    expect(tagged[0].is_brand_domain).toBe(true);
    expect(tagged[1].is_brand_domain).toBe(false);
    expect(tagged[2].is_brand_domain).toBe(false);
  });

  it("flags competitor-owned domains", () => {
    const tagged = tagSources(srcs, new Set(["acme.ie"]), [{ domain: "mhc.ie" }]);
    expect(tagged[0].is_competitor_domain).toBe(false);
    expect(tagged[1].is_competitor_domain).toBe(true);
    expect(tagged[2].is_competitor_domain).toBe(false);
  });

  it("treats neither-brand-nor-competitor domains as third-party", () => {
    const tagged = tagSources(srcs, new Set(["acme.ie"]), [{ domain: "mhc.ie" }]);
    expect(tagged[2].is_brand_domain).toBe(false);
    expect(tagged[2].is_competitor_domain).toBe(false);
  });

  it("preserves position + cited_inline from the adapter-provided source", () => {
    const tagged = tagSources(srcs, new Set(), []);
    expect(tagged.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(tagged.map((s) => s.cited_inline)).toEqual([true, false, true]);
  });

  it("handles empty input", () => {
    expect(tagSources([], new Set(), [])).toEqual([]);
  });
});
