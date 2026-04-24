/**
 * Pure-logic tests for the Gap Analysis scoring helpers. The full
 * Supabase-backed getDomainGaps / getUrlGaps paths are covered by
 * integration tests elsewhere — this file locks in the arithmetic so
 * UI ordering doesn't silently regress.
 */

import { describe, expect, it } from "vitest";
import { computeGapScore, toStars } from "../queries/gap-analysis";

describe("computeGapScore", () => {
  it("returns 0 when competitor breadth is 0 (no comparison set)", () => {
    expect(
      computeGapScore({
        sourceFrequency: 1,
        competitorBreadth: 0,
        ourPresence: 0,
      })
    ).toBe(0);
  });

  it("returns 0 when our_presence is 1 (we're already there as much as anyone)", () => {
    expect(
      computeGapScore({
        sourceFrequency: 1,
        competitorBreadth: 1,
        ourPresence: 1,
      })
    ).toBe(0);
  });

  it("peaks at 1 when source is universal, all competitors present, we're absent", () => {
    expect(
      computeGapScore({
        sourceFrequency: 1,
        competitorBreadth: 1,
        ourPresence: 0,
      })
    ).toBe(1);
  });

  it("clamps inputs outside [0,1]", () => {
    // 2 sourceFrequency clamped to 1; 2 competitor breadth clamped to 1;
    // -0.5 ourPresence clamped to 0 → score = 1 * 1 * 1 = 1.
    expect(
      computeGapScore({
        sourceFrequency: 2,
        competitorBreadth: 2,
        ourPresence: -0.5,
      })
    ).toBe(1);
  });

  it("is monotonic in our_presence (gap shrinks as we appear more)", () => {
    const base = {
      sourceFrequency: 0.5,
      competitorBreadth: 0.6,
    };
    const low = computeGapScore({ ...base, ourPresence: 0 });
    const mid = computeGapScore({ ...base, ourPresence: 0.4 });
    const high = computeGapScore({ ...base, ourPresence: 0.9 });
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(high);
  });

  it("treats non-finite inputs as 0", () => {
    expect(
      computeGapScore({
        sourceFrequency: Number.NaN,
        competitorBreadth: 0.5,
        ourPresence: 0,
      })
    ).toBe(0);
  });
});

describe("toStars", () => {
  it("returns 3 stars for high opportunity (>= 0.30)", () => {
    expect(toStars(0.3)).toBe(3);
    expect(toStars(0.75)).toBe(3);
    expect(toStars(1)).toBe(3);
  });

  it("returns 2 stars for moderate opportunity (0.10–0.30)", () => {
    expect(toStars(0.1)).toBe(2);
    expect(toStars(0.2)).toBe(2);
    expect(toStars(0.29)).toBe(2);
  });

  it("returns 1 star for any positive score below 0.10", () => {
    expect(toStars(0.01)).toBe(1);
    expect(toStars(0.099)).toBe(1);
  });
});
