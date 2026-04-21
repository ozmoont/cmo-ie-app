import { describe, expect, it } from "vitest";
import {
  computeShareOfVoice,
  summariseShareOfVoice,
} from "../format";

describe("computeShareOfVoice", () => {
  it("returns 0 when there are no mentions", () => {
    expect(computeShareOfVoice(0, 0)).toBe(0);
  });

  it("returns 0 when tracked mentions are 0 but total > 0", () => {
    expect(computeShareOfVoice(0, 10)).toBe(0);
  });

  it("returns 100 when all mentions are our brand", () => {
    expect(computeShareOfVoice(10, 10)).toBe(100);
  });

  it("rounds to nearest integer", () => {
    // 4/16 = 0.25 → 25%
    expect(computeShareOfVoice(4, 16)).toBe(25);
    // 1/3 = 0.333... → 33%
    expect(computeShareOfVoice(1, 3)).toBe(33);
    // 2/3 = 0.666... → 67%
    expect(computeShareOfVoice(2, 3)).toBe(67);
  });

  it("matches the Peec docs example (4 of 16 = 25%)", () => {
    // docs.peec.ai: "If your brand is mentioned 4 times in 10 chats and
    // your competitor is mentioned 12 times, your share of voice is 25%
    // (4 / (4 + 12) × 100)."
    expect(computeShareOfVoice(4, 4 + 12)).toBe(25);
  });

  it("handles negative or zero totals defensively", () => {
    expect(computeShareOfVoice(5, -1)).toBe(0);
    expect(computeShareOfVoice(5, 0)).toBe(0);
  });
});

describe("summariseShareOfVoice", () => {
  it("returns 'No data yet' when there are zero mentions", () => {
    const s = summariseShareOfVoice(0, 0, "Acme");
    expect(s.label).toBe("No data yet");
    expect(s.score).toBe(0);
    expect(s.body).toContain("Acme");
  });

  it("labels ≥ 40% as Dominant", () => {
    expect(summariseShareOfVoice(50, 100, "Acme").label).toBe("Dominant");
    expect(summariseShareOfVoice(40, 100, "Acme").label).toBe("Dominant");
  });

  it("labels 20–40% as Competitive", () => {
    expect(summariseShareOfVoice(30, 100, "Acme").label).toBe("Competitive");
    expect(summariseShareOfVoice(20, 100, "Acme").label).toBe("Competitive");
  });

  it("labels < 20% as Trailing", () => {
    expect(summariseShareOfVoice(10, 100, "Acme").label).toBe("Trailing");
    expect(summariseShareOfVoice(1, 100, "Acme").label).toBe("Trailing");
  });

  it("includes the brand name in every non-trivial body", () => {
    expect(summariseShareOfVoice(50, 100, "Howl").body).toContain("Howl");
    expect(summariseShareOfVoice(30, 100, "Howl").body).toContain("Howl");
  });

  it("surfaces the computed score alongside the label", () => {
    const s = summariseShareOfVoice(4, 16, "Acme");
    expect(s.score).toBe(25);
    expect(s.label).toBe("Competitive");
  });
});
