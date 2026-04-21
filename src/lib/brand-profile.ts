/**
 * Brand profile extraction.
 *
 * Fetches a website once at onboarding (or on explicit refresh) and uses
 * Claude to extract a structured brand profile — what the business does,
 * its market segment, identity, audience, and product list. The profile
 * is then stored and reused by every downstream personalisation step
 * (prompt suggestions, competitor detection, action drafting) rather
 * than re-fetching and re-parsing HTML for each call.
 *
 * This is the "Brand Profile" feature called out in
 * docs/peec-ai-competitive-review.md § Brand profile — onboarding.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface BrandProductService {
  name: string;
  description: string;
}

export interface BrandProfile {
  short_description: string;
  market_segment: string;
  brand_identity: string;
  target_audience: string;
  products_services: BrandProductService[];
}

/**
 * Normalise a URL so `new URL()` will parse it. Accepts "acme.ie" as
 * well as full "https://www.acme.ie/about".
 */
function canonicaliseUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * Fetch the site and extract a text-only snapshot suitable for Claude.
 * Deliberately the same strategy as /api/prompts/suggest — small,
 * deterministic, capped at ~3k chars of "what the site says about
 * itself". See that route for the original rationale.
 *
 * Exported separately so tests and other extractors can reuse it.
 */
export async function fetchSiteSnapshot(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<string | null> {
  const { timeoutMs = 5000, maxBytes = 200_000 } = opts;
  let body: string;
  try {
    const res = await fetch(canonicaliseUrl(url), {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CMO.ie-BrandProfileBot/1.0; +https://cmo.ie)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= maxBytes) {
          await reader.cancel();
          break;
        }
      }
    }
    body = new TextDecoder("utf-8", { fatal: false }).decode(
      Buffer.concat(chunks.map((c) => Buffer.from(c)))
    );
  } catch {
    return null;
  }

  const pick = (re: RegExp) => body.match(re)?.[1]?.trim() ?? "";
  const title = pick(/<title[^>]*>([^<]{1,300})<\/title>/i);
  const metaDesc = pick(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})["']/i
  );
  const ogDesc = pick(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})["']/i
  );
  const ogSite = pick(
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{1,200})["']/i
  );
  const h1 = pick(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i).replace(/<[^>]+>/g, " ");

  let bodySample = "";
  const bodyMatch = body.match(/<body[\s\S]*?<\/body>/i);
  if (bodyMatch) {
    bodySample = bodyMatch[0]
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);
  }

  const parts = [
    title && `Title: ${title}`,
    ogSite && `Site name: ${ogSite}`,
    metaDesc && `Meta description: ${metaDesc}`,
    ogDesc && ogDesc !== metaDesc && `OG description: ${ogDesc}`,
    h1 && `H1: ${h1}`,
    bodySample && `Body excerpt: ${bodySample}`,
  ].filter(Boolean);

  if (parts.length === 0) return null;
  return parts.join("\n").slice(0, 3000);
}

const EXTRACTION_SYSTEM = `You are an analyst that reads a brief website snapshot and returns a structured brand profile. The profile is used to tailor AI-visibility tracking for this brand.

Return ONLY valid JSON in this shape (no markdown fences, no preamble):
{
  "short_description": string,         // 1-2 plain sentences, max ~280 chars
  "market_segment": string,            // Industry / sub-segment, e.g. "Irish employment law for SMEs"
  "brand_identity": string,            // Positioning: premium / challenger / enterprise / etc.
  "target_audience": string,           // Who the brand sells to
  "products_services": [               // 1-6 entries, most prominent first
    { "name": string, "description": string }
  ]
}

Rules:
- Be specific and industry-aware. "a legal firm" is too generic; "a Dublin-based employment-law firm for SMEs" is right.
- If a field is genuinely uncertain, emit a shorter, hedged value rather than inventing detail.
- products_services: only include real offerings you can justify from the snapshot. Empty array if nothing is clear.
- Favour the brand's own language where possible — their framing, not SEO boilerplate.`;

/**
 * Build a BrandProfile from a fetched site snapshot using Claude.
 * Returns null when the site can't be fetched or the model output is
 * unparseable — callers should render an editable "empty" form in that
 * case so the user can fill the profile manually.
 */
export async function extractBrandProfile(
  brandName: string,
  websiteUrl: string | null,
  opts: { apiKey?: string } = {}
): Promise<BrandProfile | null> {
  const snapshot = websiteUrl ? await fetchSiteSnapshot(websiteUrl) : null;

  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: EXTRACTION_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `Brand: ${brandName}`,
            websiteUrl ? `Website: ${websiteUrl}` : null,
            snapshot
              ? `\nWebsite snapshot:\n${snapshot}`
              : `\n(Website snapshot unavailable — infer from the brand name alone and keep values hedged.)`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    const text =
      msg.content.find((b) => b.type === "text")?.type === "text"
        ? (
            msg.content.find((b) => b.type === "text") as {
              type: "text";
              text: string;
            }
          ).text
        : "";

    const cleaned = text
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    return normaliseProfile(parsed);
  } catch (err) {
    console.error("extractBrandProfile failed:", err);
    return null;
  }
}

/**
 * Coerce whatever Claude returned into a well-typed BrandProfile.
 * Falls back to empty strings / empty array on missing fields so the
 * caller can always render the editable form.
 *
 * Exported for tests; callers should use extractBrandProfile.
 */
export function normaliseProfile(raw: unknown): BrandProfile {
  const safe = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const products = Array.isArray(obj.products_services)
    ? (obj.products_services as unknown[])
        .map((p) => {
          if (!p || typeof p !== "object") return null;
          const rec = p as Record<string, unknown>;
          const name = safe(rec.name);
          const description = safe(rec.description);
          return name ? { name, description } : null;
        })
        .filter((p): p is BrandProductService => p !== null)
    : [];
  return {
    short_description: safe(obj.short_description),
    market_segment: safe(obj.market_segment),
    brand_identity: safe(obj.brand_identity),
    target_audience: safe(obj.target_audience),
    products_services: products,
  };
}
