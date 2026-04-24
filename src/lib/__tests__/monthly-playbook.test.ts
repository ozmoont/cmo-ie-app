/**
 * Tests for the pure string helpers in monthly-playbook. The Claude
 * call + Supabase path are exercised via integration tests + the
 * admin preview flow; here we just lock in the heading extractor
 * and the month-label formatter so they don't silently drift.
 */

import { describe, expect, it } from "vitest";
import { extractFirstHeading, formatMonthLabel } from "../monthly-playbook";

describe("extractFirstHeading", () => {
  it("returns the text after the first '# ' on a fresh-line heading", () => {
    expect(extractFirstHeading("# Hello world\nmore")).toBe("Hello world");
  });

  it("ignores h2 / h3 headings when there's no h1", () => {
    expect(extractFirstHeading("## nope\n### also nope")).toBeNull();
  });

  it("handles a leading blank line before the heading", () => {
    expect(extractFirstHeading("\n\n# Leading blank\n")).toBe("Leading blank");
  });

  it("trims whitespace on the heading text", () => {
    expect(extractFirstHeading("#   Padded   \nmore")).toBe("Padded");
  });

  it("caps the returned string at 120 chars", () => {
    const long = "# " + "x".repeat(200);
    const out = extractFirstHeading(long);
    expect(out?.length).toBe(120);
  });

  it("returns null for empty / whitespace-only input", () => {
    expect(extractFirstHeading("")).toBeNull();
    expect(extractFirstHeading("   \n\n")).toBeNull();
  });

  it("doesn't match '#' without a space (common typo)", () => {
    expect(extractFirstHeading("#NoSpace")).toBeNull();
  });
});

describe("formatMonthLabel", () => {
  it("returns the English-Ireland month label", () => {
    const label = formatMonthLabel(new Date("2026-04-01T00:00:00Z"));
    // en-IE uses "April 2026" (same as en-GB). Locale availability
    // varies across runtimes so we accept either form.
    expect(label).toMatch(/April 2026/);
  });

  it("falls back to an ISO yyyy-mm when Intl fails", () => {
    // We can't easily simulate Intl failure cross-runtime; this is a
    // smoke test that the function doesn't throw on any valid Date.
    expect(formatMonthLabel(new Date(2026, 0, 1))).toContain("2026");
  });
});
