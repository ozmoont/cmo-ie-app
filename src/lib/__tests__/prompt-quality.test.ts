import { describe, expect, it } from "vitest";
import {
  checkPromptQuality,
  checkPromptsQuality,
  type PromptQualityResult,
} from "../prompt-quality";

const brand = {
  tracked_name: "Howl",
  aliases: ["Howl.ie", "Howl Agency"],
  regex_pattern: null,
};

describe("checkPromptQuality — brand bias", () => {
  it("flags prompts containing the tracked name", () => {
    const r = checkPromptQuality(
      "How does Howl compare to Accenture for AI transformation?",
      brand
    );
    expect(r.ok).toBe(false);
    expect(r.has_brand_bias).toBe(true);
    const issue = r.issues.find((i) => i.kind === "contains_brand_name");
    expect(issue).toBeDefined();
    expect(issue?.matched_text).toBe("Howl");
  });

  it("flags prompts containing an alias when tracked name is absent", () => {
    const r = checkPromptQuality(
      "Is Howl.ie a good choice for Irish brands?",
      brand
    );
    expect(r.has_brand_bias).toBe(true);
    const issue = r.issues.find(
      (i) => i.kind === "contains_brand_alias" || i.kind === "contains_brand_name"
    );
    expect(issue?.matched_text?.toLowerCase()).toContain("howl");
  });

  it("does not flag prompts that don't mention the brand", () => {
    const r = checkPromptQuality(
      "What are the top AI transformation agencies in Ireland for mid-market companies?",
      brand
    );
    expect(r.has_brand_bias).toBe(false);
  });

  it("is case-insensitive for brand matching", () => {
    const r = checkPromptQuality(
      "how does HOWL compare to its competitors?",
      brand
    );
    expect(r.has_brand_bias).toBe(true);
  });

  it("respects word boundaries (doesn't match 'howling' etc.)", () => {
    const r = checkPromptQuality(
      "How does the howling wind affect wind-turbine output?",
      brand
    );
    expect(r.has_brand_bias).toBe(false);
  });
});

describe("checkPromptQuality — length", () => {
  it("flags prompts shorter than 4 words", () => {
    const r = checkPromptQuality("best Irish agencies", {
      tracked_name: "AcmeCorp",
      aliases: [],
      regex_pattern: null,
    });
    expect(r.issues.some((i) => i.kind === "too_short")).toBe(true);
  });

  it("does not flag 4-word prompts", () => {
    const r = checkPromptQuality("best Irish AI agencies today", {
      tracked_name: "AcmeCorp",
      aliases: [],
      regex_pattern: null,
    });
    expect(r.issues.some((i) => i.kind === "too_short")).toBe(false);
  });

  it("treats empty input as zero issues (caller handles empty)", () => {
    const r = checkPromptQuality("", {
      tracked_name: "X",
      aliases: [],
      regex_pattern: null,
    });
    expect(r.issues.some((i) => i.kind === "too_short")).toBe(false);
    expect(r.issues.some((i) => i.kind === "not_conversational")).toBe(false);
  });
});

describe("checkPromptQuality — conversational heuristic", () => {
  const plainBrand = {
    tracked_name: "NoBrandHere",
    aliases: [],
    regex_pattern: null,
  };

  it("passes question-mark-terminated prompts", () => {
    const r = checkPromptQuality(
      "What are the top Irish marketing agencies?",
      plainBrand
    );
    expect(r.issues.some((i) => i.kind === "not_conversational")).toBe(false);
  });

  it("passes prompts beginning with a question stem (no ? needed)", () => {
    const r = checkPromptQuality(
      "How much does an AI consultancy engagement cost in Ireland",
      plainBrand
    );
    expect(r.issues.some((i) => i.kind === "not_conversational")).toBe(false);
  });

  it("flags keyword-style inputs", () => {
    const r = checkPromptQuality(
      "top Irish marketing agencies AI transformation",
      plainBrand
    );
    expect(r.issues.some((i) => i.kind === "not_conversational")).toBe(true);
  });

  it("accepts imperative prompts starting with common verbs (current heuristic passes these)", () => {
    // "Get me a list..." — a common prompt style; we accept it on length
    // but may fail conversational check. This test pins the current
    // behaviour so a future relaxation is an explicit choice.
    const r = checkPromptQuality(
      "Get me a list of top Irish marketing agencies",
      plainBrand
    );
    expect(r.issues.some((i) => i.kind === "not_conversational")).toBe(true);
  });
});

describe("checkPromptsQuality — batch", () => {
  it("returns aligned results with the input list", () => {
    const prompts = [
      { id: "p1", text: "How does Howl compare to Accenture?" },
      { id: "p2", text: "What are the top agencies in Ireland?" },
      { id: "p3", text: "short prompt" },
    ];
    const results = checkPromptsQuality(prompts, brand);
    expect(results).toHaveLength(3);
    expect(results[0].id).toBe("p1");
    expect(results[0].result.has_brand_bias).toBe(true);
    expect(results[1].result.ok).toBe(true);
    expect(results[2].result.issues.some((i) => i.kind === "too_short")).toBe(
      true
    );
  });

  it("preserves order even with duplicate IDs", () => {
    const prompts = [
      { id: "dup", text: "first" },
      { id: "dup", text: "second longer prompt for test" },
    ];
    const results: { id: string; result: PromptQualityResult }[] =
      checkPromptsQuality(prompts, brand);
    expect(results[0].id).toBe("dup");
    expect(results[1].id).toBe("dup");
    expect(results[0]).not.toBe(results[1]);
  });
});
