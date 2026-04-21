import { describe, expect, it } from "vitest";
import { filterUntrackedBrands } from "../competitor-suggestions";
import type { Competitor } from "../types";

const makeCompetitor = (over: Partial<Competitor>): Competitor => ({
  id: "c1",
  project_id: "p1",
  name: "X",
  display_name: "X",
  tracked_name: "X",
  aliases: [],
  regex_pattern: null,
  color: null,
  domains: [],
  website_url: null,
  created_at: "",
  ...over,
});

describe("filterUntrackedBrands", () => {
  const tracked = { trackedName: "Acme", aliases: ["Acme Legal"] };

  it("strips the project's own brand and aliases", () => {
    const observed = ["Acme", "Acme Legal", "MHC", "Arthur Cox"];
    const result = filterUntrackedBrands(observed, tracked, []);
    expect(result.sort()).toEqual(["Arthur Cox", "MHC"]);
  });

  it("strips existing competitors' tracked/display names and aliases", () => {
    const competitors = [
      makeCompetitor({
        tracked_name: "MHC",
        display_name: "Mason Hayes Curran",
        aliases: ["Mason Hayes & Curran"],
      }),
    ];
    const observed = [
      "Mason Hayes Curran",
      "Mason Hayes & Curran",
      "MHC",
      "Arthur Cox",
    ];
    const result = filterUntrackedBrands(observed, tracked, competitors);
    expect(result).toEqual(["Arthur Cox"]);
  });

  it("is case-insensitive for matching but preserves original casing in output", () => {
    const observed = ["ACME", "mhc", "ARTHUR cox"];
    const competitors = [makeCompetitor({ tracked_name: "MHC", display_name: "MHC" })];
    const result = filterUntrackedBrands(observed, tracked, competitors);
    expect(result).toEqual(["ARTHUR cox"]);
  });

  it("dedupes observations by normalised form", () => {
    const observed = ["Matheson", "matheson", "MATHESON"];
    const result = filterUntrackedBrands(observed, tracked, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Matheson"); // first-seen casing wins
  });

  it("ignores empty / whitespace-only entries", () => {
    const observed = ["", "   ", "Matheson", "\t"];
    const result = filterUntrackedBrands(observed, tracked, []);
    expect(result).toEqual(["Matheson"]);
  });

  it("returns empty when every observed brand is tracked", () => {
    const competitors = [makeCompetitor({ tracked_name: "MHC" })];
    const observed = ["Acme", "MHC", "Acme Legal"];
    const result = filterUntrackedBrands(observed, tracked, competitors);
    expect(result).toEqual([]);
  });

  it("handles no-tracked-brand edge case (empty tracked name)", () => {
    const observed = ["Some Brand"];
    const result = filterUntrackedBrands(
      observed,
      { trackedName: "", aliases: [] },
      []
    );
    expect(result).toEqual(["Some Brand"]);
  });
});
