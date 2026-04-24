import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAdminEmail, isAdminUser } from "@/lib/admin-auth";

describe("isAdminEmail", () => {
  const ORIGINAL = process.env.CMO_ADMIN_EMAILS;
  beforeEach(() => {
    process.env.CMO_ADMIN_EMAILS = "odhran@howl.ie, Jon@Howl.IE , ";
  });
  afterEach(() => {
    process.env.CMO_ADMIN_EMAILS = ORIGINAL;
  });

  it("returns true for an exact-match email", () => {
    expect(isAdminEmail("odhran@howl.ie")).toBe(true);
  });

  it("is case-insensitive — our users mistype casing constantly", () => {
    expect(isAdminEmail("ODHRAN@howl.ie")).toBe(true);
    expect(isAdminEmail("jon@howl.ie")).toBe(true);
  });

  it("rejects unknown emails", () => {
    expect(isAdminEmail("random@example.com")).toBe(false);
  });

  it("rejects null / empty / whitespace-only inputs", () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail("  ")).toBe(false);
  });

  it("tolerates whitespace and empty entries in the env var", () => {
    // " Jon@Howl.IE " + trailing empty should not crash.
    expect(isAdminEmail("jon@howl.ie")).toBe(true);
  });

  it("returns false when CMO_ADMIN_EMAILS is unset", () => {
    process.env.CMO_ADMIN_EMAILS = "";
    expect(isAdminEmail("odhran@howl.ie")).toBe(false);
  });
});

describe("isAdminUser", () => {
  const ORIGINAL = process.env.CMO_ADMIN_EMAILS;
  beforeEach(() => {
    process.env.CMO_ADMIN_EMAILS = "odhran@howl.ie";
  });
  afterEach(() => {
    process.env.CMO_ADMIN_EMAILS = ORIGINAL;
  });

  it("returns true for a user whose email is listed", () => {
    const user = { email: "odhran@howl.ie" } as never;
    expect(isAdminUser(user)).toBe(true);
  });
  it("returns false for an unlisted user", () => {
    const user = { email: "nope@example.com" } as never;
    expect(isAdminUser(user)).toBe(false);
  });
  it("returns false for null / missing email", () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
    expect(isAdminUser({ email: null } as never)).toBe(false);
  });
});
