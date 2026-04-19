import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyDelta,
  relativeTime,
  summariseScore,
  summarisePosition,
  summariseSentiment,
} from "../format";

describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Never scanned' for null/undefined", () => {
    expect(relativeTime(null)).toBe("Never scanned");
    expect(relativeTime(undefined)).toBe("Never scanned");
  });

  it("returns 'Just now' for < 1 minute", () => {
    expect(relativeTime("2026-04-19T11:59:30Z")).toBe("Just now");
  });

  it("returns minutes for < 1 hour", () => {
    expect(relativeTime("2026-04-19T11:45:00Z")).toBe("15m ago");
  });

  it("returns hours for < 1 day", () => {
    expect(relativeTime("2026-04-19T09:00:00Z")).toBe("3h ago");
  });

  it("returns days for < 1 week", () => {
    expect(relativeTime("2026-04-17T12:00:00Z")).toBe("2d ago");
  });

  it("returns weeks for >= 1 week", () => {
    expect(relativeTime("2026-04-05T12:00:00Z")).toBe("2w ago");
  });
});

describe("classifyDelta", () => {
  it("marks a -5%+ delta as declining", () => {
    const state = classifyDelta(-7);
    expect(state.kind).toBe("declining");
    if (state.kind === "declining") {
      expect(state.label).toBe("Down 7%");
      expect(state.href("abc")).toBe("/projects/abc/actions");
    }
  });

  it("marks a +5%+ delta as growing", () => {
    const state = classifyDelta(8);
    expect(state.kind).toBe("growing");
    if (state.kind === "growing") {
      expect(state.label).toBe("Up 8%");
    }
  });

  it("treats near-zero deltas as steady (noise band)", () => {
    expect(classifyDelta(0).kind).toBe("steady");
    expect(classifyDelta(4).kind).toBe("steady");
    expect(classifyDelta(-4).kind).toBe("steady");
  });
});

describe("summariseScore", () => {
  it("labels 60+ as Strong", () => {
    expect(summariseScore(75, "Acme").label).toBe("Strong");
  });

  it("labels 30-59 as Moderate", () => {
    expect(summariseScore(45, "Acme").label).toBe("Moderate");
  });

  it("labels 1-29 as Low", () => {
    expect(summariseScore(10, "Acme").label).toBe("Low");
  });

  it("labels 0 as Not visible", () => {
    expect(summariseScore(0, "Acme").label).toBe("Not visible");
  });

  it("includes brand name in body copy", () => {
    expect(summariseScore(50, "Howl").body).toContain("Howl");
  });
});

describe("summarisePosition", () => {
  it("handles no data", () => {
    expect(summarisePosition("-", "Acme").label).toBe("No data yet");
  });

  it("labels <= 2 as Top of the list", () => {
    expect(summarisePosition("1.6", "Acme").label).toBe("Top of the list");
  });

  it("labels 2-4 as Mid-pack", () => {
    expect(summarisePosition("3.2", "Acme").label).toBe("Mid-pack");
  });

  it("labels > 4 as Buried", () => {
    expect(summarisePosition("5.8", "Acme").label).toBe("Buried");
  });
});

describe("summariseSentiment", () => {
  it("handles no mentions", () => {
    expect(summariseSentiment(null, 0, "Acme").label).toBe("No mentions yet");
    expect(summariseSentiment(50, 0, "Acme").label).toBe("No mentions yet");
  });

  it("labels 60+ as Positive", () => {
    expect(summariseSentiment(70, 10, "Acme").label).toBe("Positive");
  });

  it("labels 40-59 as Mixed", () => {
    expect(summariseSentiment(50, 10, "Acme").label).toBe("Mixed");
  });

  it("labels <40 as Needs attention", () => {
    expect(summariseSentiment(20, 10, "Acme").label).toBe("Needs attention");
  });
});
