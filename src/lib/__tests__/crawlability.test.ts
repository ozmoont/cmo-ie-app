/**
 * Tests for the robots.txt parser + AI-bot scorer.
 *
 * Covers the real-world robots.txt patterns we've seen:
 *   - Explicit named-bot blocks (Disallow: / for GPTBot)
 *   - Wildcard-only rules
 *   - Multiple UAs sharing a block
 *   - Empty / missing robots.txt behaviour
 *   - Comments, blank lines, CRLF line endings
 *   - Allow + Disallow in the same block (partial status)
 *   - Sitemap detection
 *
 * Everything is pure input-output — no network, no Supabase.
 */

import { describe, expect, it } from "vitest";
import {
  AI_BOT_DIRECTORY,
  buildCrawlabilityReport,
  buildUnreachableReport,
  parseRobotsTxt,
  scoreBots,
  toRobotsUrl,
} from "../crawlability";

describe("parseRobotsTxt", () => {
  it("parses a simple block with wildcard + one disallow", () => {
    const { blocks, sitemap_declared } = parseRobotsTxt(
      `User-agent: *\nDisallow: /private`
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].user_agents).toEqual(["*"]);
    expect(blocks[0].disallow).toEqual(["/private"]);
    expect(sitemap_declared).toBe(false);
  });

  it("groups multiple UAs that share the same ruleset", () => {
    const { blocks } = parseRobotsTxt(
      `User-agent: GPTBot\nUser-agent: ChatGPT-User\nDisallow: /`
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].user_agents).toEqual(["gptbot", "chatgpt-user"]);
    expect(blocks[0].disallow).toEqual(["/"]);
  });

  it("splits into a new block when a UA appears after Disallow", () => {
    const { blocks } = parseRobotsTxt(
      `User-agent: *\nDisallow: /admin\nUser-agent: GPTBot\nDisallow: /`
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].user_agents).toEqual(["*"]);
    expect(blocks[1].user_agents).toEqual(["gptbot"]);
  });

  it("treats `Disallow:` with empty value as allow-everything", () => {
    const { blocks } = parseRobotsTxt(
      `User-agent: GPTBot\nDisallow:`
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].disallow).toEqual([]);
  });

  it("strips comments and blank lines", () => {
    const { blocks } = parseRobotsTxt(
      `# comment\n\nUser-agent: *\nDisallow: /x # inline\n`
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].disallow).toEqual(["/x"]);
  });

  it("handles CRLF line endings", () => {
    const { blocks } = parseRobotsTxt(
      `User-agent: *\r\nDisallow: /r\r\n`
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].disallow).toEqual(["/r"]);
  });

  it("detects Sitemap: declarations", () => {
    const { sitemap_declared } = parseRobotsTxt(
      `Sitemap: https://example.ie/sitemap.xml\nUser-agent: *\nDisallow:`
    );
    expect(sitemap_declared).toBe(true);
  });

  it("is case-insensitive for directive names", () => {
    const { blocks } = parseRobotsTxt(
      `USER-AGENT: *\nDISALLOW: /x`
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].user_agents).toEqual(["*"]);
    expect(blocks[0].disallow).toEqual(["/x"]);
  });

  it("captures Allow rules separately", () => {
    const { blocks } = parseRobotsTxt(
      `User-agent: *\nDisallow: /blog/draft\nAllow: /blog/public`
    );
    expect(blocks[0].disallow).toEqual(["/blog/draft"]);
    expect(blocks[0].allow).toEqual(["/blog/public"]);
  });
});

describe("scoreBots", () => {
  it("named-bot Disallow: / → blocked", () => {
    const parsed = parseRobotsTxt(
      `User-agent: GPTBot\nDisallow: /`
    );
    const report = scoreBots("https://example.ie/robots.txt", parsed);
    const gpt = report.bots.find((b) => b.bot === "gptbot")!;
    expect(gpt.status).toBe("blocked");
    expect(gpt.matched_user_agent).toBe("gptbot");
  });

  it("wildcard Disallow: / with no named bot block → everyone blocked", () => {
    const parsed = parseRobotsTxt(
      `User-agent: *\nDisallow: /`
    );
    const report = scoreBots("https://example.ie/robots.txt", parsed);
    for (const bot of report.bots) {
      expect(bot.status).toBe("blocked");
      expect(bot.matched_user_agent).toBe("*");
    }
  });

  it("wildcard + named override — named beats wildcard", () => {
    const parsed = parseRobotsTxt(
      `User-agent: *\nDisallow: /\nUser-agent: GPTBot\nDisallow:`
    );
    const report = scoreBots("https://example.ie/robots.txt", parsed);
    const gpt = report.bots.find((b) => b.bot === "gptbot")!;
    const claude = report.bots.find((b) => b.bot === "claudebot")!;
    expect(gpt.status).toBe("allowed");
    expect(gpt.matched_user_agent).toBe("gptbot");
    expect(claude.status).toBe("blocked");
    expect(claude.matched_user_agent).toBe("*");
  });

  it("unlisted bot with no wildcard → unlisted (default: crawlable)", () => {
    const parsed = parseRobotsTxt(
      `User-agent: Googlebot\nDisallow: /x`
    );
    const report = scoreBots("https://example.ie/robots.txt", parsed);
    const gpt = report.bots.find((b) => b.bot === "gptbot")!;
    expect(gpt.status).toBe("unlisted");
    expect(gpt.matched_user_agent).toBeNull();
  });

  it("Disallow with specific paths → partial", () => {
    const parsed = parseRobotsTxt(
      `User-agent: GPTBot\nDisallow: /admin\nDisallow: /drafts`
    );
    const report = scoreBots("https://example.ie/robots.txt", parsed);
    const gpt = report.bots.find((b) => b.bot === "gptbot")!;
    expect(gpt.status).toBe("partial");
    expect(gpt.disallow_paths).toEqual(["/admin", "/drafts"]);
  });

  it("summary counts reflect per-bot statuses", () => {
    const parsed = parseRobotsTxt(
      `User-agent: GPTBot\nDisallow: /\nUser-agent: *\nDisallow:`
    );
    const report = scoreBots("https://example.ie/robots.txt", parsed);
    expect(report.summary.blocked).toBe(1);
    expect(report.summary.allowed).toBe(AI_BOT_DIRECTORY.length - 1);
  });
});

describe("buildCrawlabilityReport", () => {
  it("returns fetched: true and a bots array with one row per directory entry", () => {
    const report = buildCrawlabilityReport(
      "https://example.ie/robots.txt",
      `User-agent: *\nDisallow:`
    );
    expect(report.fetched).toBe(true);
    expect(report.bots).toHaveLength(AI_BOT_DIRECTORY.length);
  });
});

describe("buildUnreachableReport", () => {
  it("returns fetched: false and marks every bot as allowed (web default)", () => {
    const report = buildUnreachableReport("https://example.ie/robots.txt");
    expect(report.fetched).toBe(false);
    expect(report.summary.allowed).toBe(AI_BOT_DIRECTORY.length);
    for (const bot of report.bots) {
      expect(bot.status).toBe("allowed");
      expect(bot.matched_user_agent).toBeNull();
    }
  });
});

describe("toRobotsUrl", () => {
  it("accepts bare hostnames", () => {
    expect(toRobotsUrl("example.ie")).toBe("https://example.ie/robots.txt");
  });

  it("accepts full URLs and drops the path", () => {
    expect(toRobotsUrl("https://example.ie/some/path")).toBe(
      "https://example.ie/robots.txt"
    );
  });

  it("preserves http:// when supplied", () => {
    expect(toRobotsUrl("http://example.ie")).toBe(
      "http://example.ie/robots.txt"
    );
  });

  it("returns null for empty input", () => {
    expect(toRobotsUrl("")).toBeNull();
    expect(toRobotsUrl("   ")).toBeNull();
  });

  it("returns null for clearly malformed URLs", () => {
    expect(toRobotsUrl("not a url ::::")).toBeNull();
  });
});
