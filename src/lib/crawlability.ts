/**
 * Crawlability — parse a site's robots.txt against a curated list of
 * AI crawler user-agents and return a per-bot allowed/disallowed
 * verdict.
 *
 * Pure function: takes the robots.txt text + bot directory, returns a
 * report. Network fetching lives in the API route so this file stays
 * testable in isolation.
 *
 * Algorithm:
 *   1. Split robots.txt into UA-scoped blocks. A block starts with one
 *      or more `User-agent:` lines and contains Disallow/Allow/Sitemap.
 *   2. For each bot in the directory, pick the most specific matching
 *      block (exact name > wildcard `*`). Bots with no matching block
 *      inherit the `*` defaults; if there's no wildcard either, they
 *      are fully allowed.
 *   3. Compute status:
 *        "allowed"    — no Disallow rules (or only Disallow: with empty path)
 *        "blocked"    — Disallow: / (root)
 *        "partial"    — any other Disallow pattern
 *        "unlisted"   — bot isn't named AND no wildcard present
 *
 * We intentionally don't implement full Google-spec path matching
 * (Allow-over-Disallow precedence, wildcards) because the v1 use case
 * is marketing-facing summary: "is GPTBot allowed on your site?". For
 * customers who need byte-exact compliance we'll punt to a deeper
 * tool in Phase 5.
 */

export type BotStatus = "allowed" | "blocked" | "partial" | "unlisted";

export interface BotReport {
  bot: string;
  label: string;
  vendor: string;
  status: BotStatus;
  reason: string;
  matched_user_agent: string | null;
  disallow_paths: string[];
  allow_paths: string[];
}

export interface CrawlabilityReport {
  robots_txt_url: string;
  fetched: boolean;
  /** Number of bot-specific user-agent blocks (not counting `*`). */
  bot_specific_blocks: number;
  /** True when robots.txt includes at least one Sitemap: line. */
  sitemap_declared: boolean;
  bots: BotReport[];
  /** Summary counts for the headline panel. */
  summary: {
    allowed: number;
    partial: number;
    blocked: number;
    unlisted: number;
  };
}

// ── Curated AI bot directory ──────────────────────────────────────
// Vendor-grouped list of user-agents that matter in April 2026. UAs
// are lowercased at parse time; label is the human-readable name shown
// on the results page. `vendor` clusters bots in the UI.

interface BotEntry {
  ua: string; // Expected `User-agent:` value (lower-case).
  label: string;
  vendor: string;
}

export const AI_BOT_DIRECTORY: readonly BotEntry[] = [
  // OpenAI
  { ua: "gptbot", label: "GPTBot", vendor: "OpenAI" },
  { ua: "chatgpt-user", label: "ChatGPT-User", vendor: "OpenAI" },
  { ua: "oai-searchbot", label: "OAI-SearchBot", vendor: "OpenAI" },
  // Anthropic
  { ua: "claudebot", label: "ClaudeBot", vendor: "Anthropic" },
  { ua: "anthropic-ai", label: "anthropic-ai", vendor: "Anthropic" },
  { ua: "claude-web", label: "Claude-Web", vendor: "Anthropic" },
  { ua: "claude-user", label: "Claude-User", vendor: "Anthropic" },
  { ua: "claude-searchbot", label: "Claude-SearchBot", vendor: "Anthropic" },
  // Google
  { ua: "google-extended", label: "Google-Extended", vendor: "Google" },
  { ua: "googleother", label: "GoogleOther", vendor: "Google" },
  { ua: "googlebot", label: "Googlebot", vendor: "Google" },
  // Perplexity
  { ua: "perplexitybot", label: "PerplexityBot", vendor: "Perplexity" },
  { ua: "perplexity-user", label: "Perplexity-User", vendor: "Perplexity" },
  // Meta
  { ua: "facebookbot", label: "FacebookBot", vendor: "Meta" },
  { ua: "meta-externalagent", label: "Meta-ExternalAgent", vendor: "Meta" },
  { ua: "meta-externalfetcher", label: "meta-externalfetcher", vendor: "Meta" },
  // Apple
  { ua: "applebot", label: "Applebot", vendor: "Apple" },
  { ua: "applebot-extended", label: "Applebot-Extended", vendor: "Apple" },
  // Microsoft
  { ua: "bingbot", label: "Bingbot", vendor: "Microsoft" },
  { ua: "msnbot", label: "MSNBot", vendor: "Microsoft" },
  // xAI
  { ua: "xai-bot", label: "xAI-Bot", vendor: "xAI" },
  { ua: "grok", label: "Grok", vendor: "xAI" },
  // Other notable AI crawlers
  { ua: "amazonbot", label: "Amazonbot", vendor: "Amazon" },
  { ua: "bytespider", label: "Bytespider", vendor: "ByteDance" },
  { ua: "ccbot", label: "CCBot", vendor: "Common Crawl" },
  { ua: "cohere-ai", label: "cohere-ai", vendor: "Cohere" },
  { ua: "mistralai-user", label: "MistralAI-User", vendor: "Mistral" },
  { ua: "youbot", label: "YouBot", vendor: "You.com" },
  { ua: "omgilibot", label: "Omgilibot", vendor: "Webz.io" },
  { ua: "imagesiftbot", label: "ImagesiftBot", vendor: "ImageSift" },
  { ua: "duckassistbot", label: "DuckAssistBot", vendor: "DuckDuckGo" },
  { ua: "diffbot", label: "Diffbot", vendor: "Diffbot" },
];

// ── Parser ────────────────────────────────────────────────────────

interface ParsedBlock {
  user_agents: string[]; // lower-cased, no whitespace
  disallow: string[];
  allow: string[];
}

/** Parse robots.txt into per-UA-block objects. */
export function parseRobotsTxt(robots: string): {
  blocks: ParsedBlock[];
  sitemap_declared: boolean;
} {
  const lines = robots
    .split(/\r?\n/)
    .map((l) => stripComment(l).trim())
    .filter(Boolean);

  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock | null = null;
  let sitemapDeclared = false;
  let sawRuleInCurrent = false;

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "sitemap") {
      sitemapDeclared = true;
      continue;
    }

    if (key === "user-agent") {
      const ua = value.toLowerCase();
      // A new UA after at least one rule starts a new block. Two UAs
      // back-to-back before any rule share the same rule-set
      // (standard robots.txt grouping behaviour).
      if (!current || sawRuleInCurrent) {
        current = { user_agents: [ua], disallow: [], allow: [] };
        blocks.push(current);
        sawRuleInCurrent = false;
      } else {
        current.user_agents.push(ua);
      }
      continue;
    }

    if (key === "disallow" || key === "allow") {
      if (!current) continue;
      sawRuleInCurrent = true;
      // robots.txt convention: `Disallow:` (empty value) = allow all.
      if (value === "") continue;
      if (key === "disallow") current.disallow.push(value);
      else current.allow.push(value);
    }
    // Other directives (Crawl-delay, Host, etc) ignored for now.
  }

  return { blocks, sitemap_declared: sitemapDeclared };
}

function stripComment(line: string): string {
  const hash = line.indexOf("#");
  return hash === -1 ? line : line.slice(0, hash);
}

// ── Scoring ───────────────────────────────────────────────────────

/**
 * Run the curated bot directory against a parsed robots.txt and
 * produce a per-bot CrawlabilityReport. Exported for tests.
 */
export function scoreBots(
  robotsUrl: string,
  parsed: ReturnType<typeof parseRobotsTxt>,
  directory: readonly BotEntry[] = AI_BOT_DIRECTORY
): CrawlabilityReport {
  const bots: BotReport[] = [];
  const wildcardBlock = parsed.blocks.find((b) =>
    b.user_agents.includes("*")
  );

  for (const entry of directory) {
    const specific = parsed.blocks.find((b) =>
      b.user_agents.includes(entry.ua)
    );
    const source = specific ?? wildcardBlock ?? null;
    const matchedUa = specific
      ? entry.ua
      : wildcardBlock
        ? "*"
        : null;

    const disallow = source?.disallow ?? [];
    const allow = source?.allow ?? [];

    let status: BotStatus;
    let reason: string;
    if (!source) {
      status = "unlisted";
      reason = "No matching User-agent block. Default: crawlable.";
    } else if (disallow.includes("/")) {
      status = "blocked";
      reason = `${matchedUa === "*" ? "Wildcard" : `Named ${entry.label}`} rule sets Disallow: /`;
    } else if (disallow.length === 0) {
      status = "allowed";
      reason = matchedUa === "*"
        ? "Matched via * wildcard with no Disallow rules."
        : `${entry.label} is explicitly allowed (no Disallow rules).`;
    } else {
      status = "partial";
      reason = `${disallow.length} Disallow path${disallow.length === 1 ? "" : "s"} (${disallow.slice(0, 2).join(", ")}${disallow.length > 2 ? "…" : ""}).`;
    }

    bots.push({
      bot: entry.ua,
      label: entry.label,
      vendor: entry.vendor,
      status,
      reason,
      matched_user_agent: matchedUa,
      disallow_paths: disallow,
      allow_paths: allow,
    });
  }

  const summary = {
    allowed: bots.filter((b) => b.status === "allowed").length,
    partial: bots.filter((b) => b.status === "partial").length,
    blocked: bots.filter((b) => b.status === "blocked").length,
    unlisted: bots.filter((b) => b.status === "unlisted").length,
  };

  return {
    robots_txt_url: robotsUrl,
    fetched: true,
    bot_specific_blocks: parsed.blocks.filter(
      (b) => !b.user_agents.includes("*")
    ).length,
    sitemap_declared: parsed.sitemap_declared,
    bots,
    summary,
  };
}

/**
 * High-level convenience: given the raw robots.txt body and the URL
 * it was fetched from, return the full report.
 */
export function buildCrawlabilityReport(
  robotsUrl: string,
  robotsTxt: string
): CrawlabilityReport {
  const parsed = parseRobotsTxt(robotsTxt);
  return scoreBots(robotsUrl, parsed);
}

/**
 * Produce a report for the "we couldn't fetch robots.txt" case. We
 * report it as an all-unlisted default (the web default is crawlable
 * when there's no robots.txt), but the caller flips `fetched: false`
 * so the UI can show a warning banner.
 */
export function buildUnreachableReport(
  robotsUrl: string
): CrawlabilityReport {
  return {
    robots_txt_url: robotsUrl,
    fetched: false,
    bot_specific_blocks: 0,
    sitemap_declared: false,
    bots: AI_BOT_DIRECTORY.map((entry) => ({
      bot: entry.ua,
      label: entry.label,
      vendor: entry.vendor,
      status: "allowed" as BotStatus,
      reason: "No robots.txt found. Default: crawlable.",
      matched_user_agent: null,
      disallow_paths: [],
      allow_paths: [],
    })),
    summary: {
      allowed: AI_BOT_DIRECTORY.length,
      partial: 0,
      blocked: 0,
      unlisted: 0,
    },
  };
}

/** Canonicalise user input to `https://host/robots.txt`. */
export function toRobotsUrl(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    );
  } catch {
    return null;
  }
  return `${u.protocol}//${u.host}/robots.txt`;
}
