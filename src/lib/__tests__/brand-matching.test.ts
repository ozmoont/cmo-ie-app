import { describe, expect, it } from "vitest";
import {
  firstMatchIndex,
  matchBrands,
  findTrackedBrandMatch,
  type MatchableBrand,
} from "../brand-matching";

const makeBrand = (over: Partial<MatchableBrand> = {}): MatchableBrand => ({
  id: "b1",
  display_name: "North Design",
  tracked_name: "North Design",
  aliases: [],
  ...over,
});

describe("firstMatchIndex", () => {
  it("matches a simple brand name case-insensitively with word boundaries", () => {
    const b = makeBrand();
    expect(firstMatchIndex(b, "North Design leads the field.").index).toBe(0);
    // "north design" starts at column 18 of "Top firms include north design today."
    expect(firstMatchIndex(b, "Top firms include north design today.").index).toBe(18);
    expect(firstMatchIndex(b, "Nothing mentions the brand.").index).toBe(-1);
  });

  it("refuses substring matches (pineapple should not match Apple)", () => {
    const b = makeBrand({
      display_name: "Apple",
      tracked_name: "Apple",
    });
    expect(firstMatchIndex(b, "I love pineapple season.").index).toBe(-1);
    expect(firstMatchIndex(b, "Apple released a new product.").index).toBe(0);
  });

  it("finds the earliest match across tracked_name and aliases", () => {
    const b = makeBrand({
      tracked_name: "HubSpot",
      aliases: ["HubSpot Inc.", "HubSpot, Inc."],
    });
    // Alias appears before tracked_name in the text.
    const text = "HubSpot, Inc. was mentioned first, then HubSpot again.";
    const m = firstMatchIndex(b, text);
    expect(m.index).toBe(0);
    expect(m.matched).toBe("HubSpot, Inc.");
  });

  it("honours an explicit regex pattern over name matching", () => {
    const b = makeBrand({
      display_name: "Apple",
      tracked_name: "Apple",
      // Only capitalised "Apple" matches, avoiding dictionary collisions.
      regex_pattern: "\\bApple\\b",
    });
    expect(firstMatchIndex(b, "apple and oranges").index).toBe(-1);
    expect(firstMatchIndex(b, "I bought an Apple device.").index).toBe(12);
  });

  it("falls back to name matching when regex is malformed", () => {
    const b = makeBrand({
      regex_pattern: "(unterminated",
    });
    // The broken regex is skipped; name matching still works.
    expect(firstMatchIndex(b, "North Design delivers.").index).toBe(0);
  });

  it("returns -1 when the brand has only empty candidates and no regex", () => {
    const b = makeBrand({ tracked_name: "", aliases: ["", " "] });
    expect(firstMatchIndex(b, "Any text here").index).toBe(-1);
  });
});

describe("matchBrands", () => {
  it("orders matches by first-mention position", () => {
    const brands: MatchableBrand[] = [
      makeBrand({
        id: "b1",
        display_name: "North Design",
        tracked_name: "North Design",
        is_tracked_brand: true,
      }),
      makeBrand({
        id: "b2",
        display_name: "Kingston Lafferty",
        tracked_name: "Kingston Lafferty",
      }),
      makeBrand({
        id: "b3",
        display_name: "Douglas & Jones",
        tracked_name: "Douglas & Jones",
      }),
    ];

    const text =
      "Kingston Lafferty and North Design are the top choices. Douglas & Jones also gets recommended.";
    const matches = matchBrands(brands, text);

    expect(matches.map((m) => m.brand.tracked_name)).toEqual([
      "Kingston Lafferty",
      "North Design",
      "Douglas & Jones",
    ]);
    expect(matches.map((m) => m.position)).toEqual([1, 2, 3]);
  });

  it("omits brands that aren't mentioned", () => {
    const brands: MatchableBrand[] = [
      makeBrand({ id: "b1", tracked_name: "North Design" }),
      makeBrand({ id: "b2", tracked_name: "Missing Brand" }),
    ];
    const matches = matchBrands(brands, "North Design wins again.");
    expect(matches).toHaveLength(1);
    expect(matches[0].brand.id).toBe("b1");
  });

  it("counts aliases toward ordering", () => {
    const brands: MatchableBrand[] = [
      makeBrand({
        id: "tracked",
        tracked_name: "HubSpot",
        aliases: ["HubSpot Inc."],
        is_tracked_brand: true,
      }),
      makeBrand({
        id: "comp",
        tracked_name: "Salesforce",
      }),
    ];
    // Alias appears before Salesforce.
    const text = "HubSpot Inc. is the leader, followed by Salesforce.";
    const matches = matchBrands(brands, text);
    expect(matches[0].brand.id).toBe("tracked");
    expect(matches[1].brand.id).toBe("comp");
  });
});

describe("findTrackedBrandMatch", () => {
  it("returns the tracked brand's match when present", () => {
    const matches = matchBrands(
      [
        makeBrand({ id: "competitor", tracked_name: "Other" }),
        makeBrand({
          id: "tracked",
          tracked_name: "Us",
          is_tracked_brand: true,
        }),
      ],
      "Other came first, then Us."
    );
    const tracked = findTrackedBrandMatch(matches);
    expect(tracked?.brand.id).toBe("tracked");
    expect(tracked?.position).toBe(2);
  });

  it("returns null when the tracked brand wasn't mentioned", () => {
    const matches = matchBrands(
      [
        makeBrand({ id: "competitor", tracked_name: "Other" }),
        makeBrand({
          id: "tracked",
          tracked_name: "Us",
          is_tracked_brand: true,
        }),
      ],
      "Only Other is mentioned here."
    );
    expect(findTrackedBrandMatch(matches)).toBeNull();
  });
});
