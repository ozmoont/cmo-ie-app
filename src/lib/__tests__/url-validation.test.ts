import { describe, expect, it } from "vitest";
import { validateWebsiteUrl } from "../url-validation";

describe("validateWebsiteUrl — accepted inputs", () => {
  it("accepts bare hostnames and normalises to https://", () => {
    const r = validateWebsiteUrl("acme.ie");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalised).toBe("https://acme.ie");
  });

  it("accepts www-prefixed hostnames", () => {
    const r = validateWebsiteUrl("www.howl.ie");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalised).toBe("https://www.howl.ie");
  });

  it("accepts full https:// URLs with paths", () => {
    const r = validateWebsiteUrl("https://acme.ie/about");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalised).toBe("https://acme.ie/about");
  });

  it("preserves http:// when explicitly provided", () => {
    const r = validateWebsiteUrl("http://acme.ie");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalised).toBe("http://acme.ie");
  });

  it("lowercases the hostname only", () => {
    const r = validateWebsiteUrl("HTTPS://Acme.IE/Path");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalised).toBe("https://acme.ie/Path");
  });

  it("drops trailing slash on bare-hostname URLs", () => {
    const r = validateWebsiteUrl("https://acme.ie/");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalised).toBe("https://acme.ie");
  });

  it("trims whitespace around input", () => {
    const r = validateWebsiteUrl("   acme.ie  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalised).toBe("https://acme.ie");
  });
});

describe("validateWebsiteUrl — the howl.ie comma case (the reason this module exists)", () => {
  it("rejects a comma in the hostname with a specific error", () => {
    const r = validateWebsiteUrl("www,howl.ie");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/comma/i);
      expect(r.error).toMatch(/www,/);
    }
  });

  it("rejects a comma anywhere in the URL", () => {
    expect(validateWebsiteUrl("https://acme,ie").ok).toBe(false);
    expect(validateWebsiteUrl("acme.ie,com").ok).toBe(false);
  });

  it("rejects whitespace in the hostname", () => {
    expect(validateWebsiteUrl("acme .ie").ok).toBe(false);
    expect(validateWebsiteUrl("acme\t.ie").ok).toBe(false);
  });

  it("rejects a semicolon typo", () => {
    expect(validateWebsiteUrl("acme;ie").ok).toBe(false);
  });
});

describe("validateWebsiteUrl — other common typos", () => {
  it("rejects empty input with a helpful message", () => {
    const r = validateWebsiteUrl("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/required/i);
  });

  it("rejects whitespace-only input", () => {
    expect(validateWebsiteUrl("   ").ok).toBe(false);
  });

  it("rejects unknown protocols", () => {
    const r = validateWebsiteUrl("ftp://acme.ie");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ftp/);
  });

  it("rejects hostnames with no TLD", () => {
    const r = validateWebsiteUrl("acme");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/TLD/);
  });

  it("rejects hostnames with leading / trailing / duplicated dots", () => {
    expect(validateWebsiteUrl(".acme.ie").ok).toBe(false);
    expect(validateWebsiteUrl("acme.ie.").ok).toBe(false);
    expect(validateWebsiteUrl("acme..ie").ok).toBe(false);
  });

  it("rejects hostnames with characters that aren't allowed in DNS", () => {
    expect(validateWebsiteUrl("acme!.ie").ok).toBe(false);
    expect(validateWebsiteUrl("acme$.ie").ok).toBe(false);
  });
});
