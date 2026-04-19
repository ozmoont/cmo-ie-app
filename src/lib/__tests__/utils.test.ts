import { describe, expect, it } from "vitest";
import { cn } from "../utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false && "b", null, undefined, "c")).toBe("a c");
  });

  it("lets later tailwind classes override earlier ones", () => {
    // twMerge resolves conflicts — the last px-* wins.
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});
