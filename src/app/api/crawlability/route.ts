/**
 * POST /api/crawlability
 *   Body: { url: string, email?: string }
 *   Returns the CrawlabilityReport and records the check for
 *   rate-limiting / analytics.
 *
 * GET /api/crawlability — intentionally unused; returns 405 to avoid
 * accidental URL-parameter leaks via logs / referrers.
 *
 * Rate limiting: best-effort per-IP, 10 checks / 10 minutes. Uses the
 * same in-memory bucket approach as api-auth (swap to Redis when we
 * go multi-region). Unauthenticated callers only.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildCrawlabilityReport,
  buildUnreachableReport,
  toRobotsUrl,
} from "@/lib/crawlability";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 10;
const bucket = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string): { ok: boolean; retry_after_s?: number } {
  const now = Date.now();
  const entry = bucket.get(ip);
  if (!entry || entry.resetAt < now) {
    bucket.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (entry.count < RATE_LIMIT) {
    entry.count += 1;
    return { ok: true };
  }
  return { ok: false, retry_after_s: Math.ceil((entry.resetAt - now) / 1000) };
}

function ipFromRequest(request: Request): string {
  // Vercel / Cloudflare / nginx usually set one of these. We don't
  // need perfect IP attribution — this is purely for rate limiting.
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request) {
  const ip = ipFromRequest(request);
  const rate = checkIpRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: `Rate limit: ${RATE_LIMIT} checks per 10 minutes. Retry in ${rate.retry_after_s}s.`,
      },
      { status: 429, headers: { "retry-after": String(rate.retry_after_s ?? 60) } }
    );
  }

  let body: { url?: string; email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const robotsUrl = toRobotsUrl(body.url ?? "");
  if (!robotsUrl) {
    return NextResponse.json(
      { error: "Please enter a valid URL or hostname." },
      { status: 400 }
    );
  }
  const domain = new URL(robotsUrl).host.replace(/^www\./, "");

  // Fetch with a browser-looking UA (robots.txt fetches that identify
  // as bots are sometimes blocked by the same Cloudflare rules we're
  // testing against). 6s timeout — robots.txt is always small.
  let report: ReturnType<typeof buildCrawlabilityReport>;
  try {
    const res = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CMO.ie-crawlability-checker; +https://cmo.ie/crawlability)",
        Accept: "text/plain, */*;q=0.8",
      },
    });
    if (!res.ok) {
      report = buildUnreachableReport(robotsUrl);
    } else {
      const text = await res.text();
      // A robots.txt that returns HTML (common when a site serves a
      // 404 page instead of 404-ing) should be treated as "no robots".
      if (/<html/i.test(text.slice(0, 500))) {
        report = buildUnreachableReport(robotsUrl);
      } else {
        report = buildCrawlabilityReport(robotsUrl, text);
      }
    }
  } catch (err) {
    console.warn(`crawlability fetch failed for ${robotsUrl}:`, err);
    report = buildUnreachableReport(robotsUrl);
  }

  // Persist the check (fire-and-forget — don't block the response).
  const admin = createAdminClient();
  void admin.from("crawlability_checks").insert({
    url: body.url,
    domain,
    email: normaliseEmail(body.email),
    ip_address: ip === "unknown" ? null : ip,
    results: report,
  });

  return NextResponse.json({ report });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

function normaliseEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}
