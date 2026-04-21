import { describe, expect, it } from "vitest";
import { normaliseProfile } from "../brand-profile";

describe("normaliseProfile", () => {
  it("passes through a well-formed profile", () => {
    const raw = {
      short_description: "Dublin-based employment-law firm for SMEs.",
      market_segment: "Irish employment law",
      brand_identity: "Challenger",
      target_audience: "Small-to-medium businesses in Ireland",
      products_services: [
        { name: "HR advisory", description: "Ongoing HR counsel" },
        { name: "Tribunal representation", description: "WRC claims" },
      ],
    };
    expect(normaliseProfile(raw)).toEqual(raw);
  });

  it("fills missing string fields with empty strings", () => {
    const result = normaliseProfile({});
    expect(result.short_description).toBe("");
    expect(result.market_segment).toBe("");
    expect(result.brand_identity).toBe("");
    expect(result.target_audience).toBe("");
    expect(result.products_services).toEqual([]);
  });

  it("trims whitespace from string fields", () => {
    const result = normaliseProfile({
      short_description: "   trimmed   ",
      market_segment: "\nhedged\n",
    });
    expect(result.short_description).toBe("trimmed");
    expect(result.market_segment).toBe("hedged");
  });

  it("drops products with empty names", () => {
    const result = normaliseProfile({
      products_services: [
        { name: "", description: "orphan description" },
        { name: "Real Product", description: "legit" },
        { description: "nameless" },
      ],
    });
    expect(result.products_services).toEqual([
      { name: "Real Product", description: "legit" },
    ]);
  });

  it("coerces non-array products_services to empty list", () => {
    const result = normaliseProfile({
      products_services: "not an array",
    });
    expect(result.products_services).toEqual([]);
  });

  it("defensively handles non-object inputs", () => {
    expect(normaliseProfile(null)).toEqual({
      short_description: "",
      market_segment: "",
      brand_identity: "",
      target_audience: "",
      products_services: [],
    });
    expect(normaliseProfile(undefined)).toEqual({
      short_description: "",
      market_segment: "",
      brand_identity: "",
      target_audience: "",
      products_services: [],
    });
    expect(normaliseProfile("a string")).toEqual({
      short_description: "",
      market_segment: "",
      brand_identity: "",
      target_audience: "",
      products_services: [],
    });
  });

  it("drops non-string fields silently", () => {
    const result = normaliseProfile({
      short_description: 123,
      market_segment: { nested: "object" },
      brand_identity: true,
    });
    expect(result.short_description).toBe("");
    expect(result.market_segment).toBe("");
    expect(result.brand_identity).toBe("");
  });
});
