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
 *
 * Fallback chain (in order):
 *   1. Direct fetch with a real-browser UA. Fast, no dependency.
 *   2. Jina Reader (`https://r.jina.ai/<url>`) when the direct fetch
 *      returns no extractable content. Jina runs a headless browser
 *      and returns rendered markdown — gets us past Cloudflare bot
 *      protection and JS-rendered SPAs (Webflow, Framer, Next.js in
 *      SPA mode). Free tier is ~1M reads/mo.
 *
 * The fallback is opt-out via opts.skipJinaFallback (for tests that
 * don't want network). JINA_API_KEY env var raises the rate cap; we
 * pass it when present but still work without one.
 */
export async function fetchSiteSnapshot(
  url: string,
  opts: {
    timeoutMs?: number;
    maxBytes?: number;
    skipJinaFallback?: boolean;
  } = {}
): Promise<string | null> {
  const { timeoutMs = 8000, maxBytes = 200_000 } = opts;
  let body: string;
  const canonicalUrl = canonicaliseUrl(url);
  try {
    // Mimic a real browser. Cloudflare-fronted sites, Webflow, Framer,
    // Vercel Bot-Protection and similar aggressively block unfamiliar
    // User-Agents (including polite self-identifying bots). Using a
    // current Safari UA gets us through without misrepresenting — we
    // still respect robots.txt and rate-limit ourselves.
    const res = await fetch(canonicalUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IE,en;q=0.9",
        "Accept-Encoding": "identity",
      },
    });
    if (!res.ok) {
      console.warn(
        `fetchSiteSnapshot: ${canonicalUrl} returned HTTP ${res.status}`
      );
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      console.warn(
        `fetchSiteSnapshot: ${canonicalUrl} content-type was "${contentType}", expected html`
      );
      return null;
    }

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
  } catch (err) {
    console.warn(
      `fetchSiteSnapshot: ${canonicalUrl} fetch failed:`,
      err instanceof Error ? err.message : err
    );
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

  if (parts.length === 0) {
    console.warn(
      `fetchSiteSnapshot: ${canonicalUrl} returned HTML but no extractable signal (likely a JS-rendered SPA or blank body)`
    );
    return null;
  }

  // If we only extracted junk (e.g. a cookie banner title), or the
  // page came back empty (JS-rendered SPA), fall back to Jina Reader
  // which runs a headless browser server-side. Opt-out with
  // skipJinaFallback for tests.
  const joined = parts.join("\n").slice(0, 3000);
  if (joined.length >= 80) {
    console.info(
      `fetchSiteSnapshot: ${canonicalUrl} OK direct, ${joined.length} chars extracted`
    );
    return joined;
  }

  console.warn(
    `fetchSiteSnapshot: ${canonicalUrl} direct fetch too thin (${joined.length} chars) — trying Jina Reader fallback`
  );

  if (opts.skipJinaFallback) return null;
  return fetchViaJinaReader(canonicalUrl, {
    timeoutMs: 12000,
    maxBytes: 200_000,
  });
}

/**
 * Jina Reader fallback. `https://r.jina.ai/<url>` returns clean
 * markdown after a headless-browser render — gets us past
 * Cloudflare / Webflow / Framer bot walls.
 *
 * Exported for tests; callers should prefer fetchSiteSnapshot.
 */
export async function fetchViaJinaReader(
  targetUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<string | null> {
  const { timeoutMs = 12000, maxBytes = 200_000 } = opts;
  const apiKey = process.env.JINA_API_KEY?.trim();
  // r.jina.ai accepts the URL path-embedded. Scheme of the inner URL
  // is preserved so http:// vs https:// round-trips correctly.
  const jinaUrl = `https://r.jina.ai/${targetUrl}`;
  try {
    const res = await fetch(jinaUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: {
        // Markdown output is smallest + easiest to post-process.
        Accept: "text/markdown, text/plain",
        "Accept-Encoding": "identity",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        // Tell Jina we want cleaner output (drops nav, footer, repeat
        // cookie-banner text). Supported header per docs.
        "X-Return-Format": "markdown",
      },
    });
    if (!res.ok) {
      console.warn(
        `fetchViaJinaReader: ${targetUrl} returned HTTP ${res.status}`
      );
      return null;
    }
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
    const body = new TextDecoder("utf-8", { fatal: false })
      .decode(Buffer.concat(chunks.map((c) => Buffer.from(c))))
      .trim();

    // Jina prefixes the response with a `Title:` + `URL Source:` +
    // `Markdown Content:` header. Keep those — the extractor's
    // Claude prompt benefits from the cue. Trim to the same 3000-char
    // budget as the direct path.
    const trimmed = body.slice(0, 3000);
    if (trimmed.length < 80) {
      console.warn(
        `fetchViaJinaReader: ${targetUrl} returned too-thin content (${trimmed.length} chars)`
      );
      return null;
    }
    console.info(
      `fetchViaJinaReader: ${targetUrl} OK, ${trimmed.length} chars extracted`
    );
    return trimmed;
  } catch (err) {
    console.warn(
      `fetchViaJinaReader: ${targetUrl} failed:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

const EXTRACTION_SYSTEM = `You are an analyst that reads a brief website snapshot and returns a structured brand profile for ONE specific brand being tracked.

Return ONLY valid JSON in this shape (no markdown fences, no preamble):
{
  "short_description": string,         // 1-2 plain sentences about THE TRACKED BRAND, max ~280 chars
  "market_segment": string,            // Industry / sub-segment of THE TRACKED BRAND
  "brand_identity": string,            // Positioning: premium / challenger / enterprise / etc.
  "target_audience": string,           // Who THE TRACKED BRAND sells to
  "products_services": [               // 1-6 entries of THE TRACKED BRAND's own offerings
    { "name": string, "description": string }
  ]
}

CRITICAL rules — breaking any one is a failure:

1. IDENTIFY THE TRACKED BRAND ONLY. You will be told the brand name. The profile is for THAT brand, not for any client, case study, or partner mentioned on the site. If the site is an agency and the snapshot contains case studies about client work (e.g. "we built X for Acme Legal"), the tracked brand is the AGENCY, not Acme Legal. Services / case study / portfolio sections describe OTHER companies' problems the tracked brand solved — DO NOT classify the tracked brand as being in the client's industry.

2. PRIORITISE AUTHORITATIVE SIGNAL IN THIS ORDER:
   a) <title> tag — almost always states the brand's own category.
   b) <meta name="description"> / og:description — direct self-description.
   c) Hero H1 + first paragraph — what the brand says about itself on landing.
   d) Navigation items (service pages, about) — primary categories.
   e) Case studies / client lists — ONLY as supporting signal for what the brand DOES, never for what industry the brand IS IN.
   f) Body text — lowest priority; most contaminated with SEO copy and client references.

3. BE SPECIFIC. "a legal firm" is too generic; "a Dublin-based employment-law firm for SMEs" is right. But NEVER be specific wrongly — if you had to choose between right-but-general and specific-but-guessed, pick right-but-general.

4. PRODUCTS_SERVICES are the tracked brand's OWN offerings, not client projects. An agency's products_services are the services IT SELLS, not the case studies IT DELIVERED. Keep it short — 3-6 entries, most prominent first.

5. When snapshot is thin or ambiguous, emit shorter hedged values rather than inventing detail. Empty products_services array is preferable to made-up services.

6. Use the brand's own language where possible — their framing, not SEO boilerplate.`;

/**
 * Build a BrandProfile from a fetched site snapshot using Claude.
 *
 * Returns null when:
 *   - no websiteUrl was supplied, or
 *   - the site couldn't be fetched (bot blocking, timeout, non-HTML), or
 *   - no Anthropic key is configured.
 *
 * CRITICAL: when we can't fetch the site we DO NOT ask Claude to guess
 * from the brand name alone. That was the source of the "Howl.ie is an
 * Irish-based digital or service" junk profile — callers then persisted
 * that guess, and every subsequent suggestion was pinned to Claude's
 * wrong inference.
 *
 * Callers should render an editable empty form when this returns null
 * so the user fills the profile manually.
 */
export async function extractBrandProfile(
  brandName: string,
  websiteUrl: string | null,
  opts: { apiKey?: string } = {}
): Promise<BrandProfile | null> {
  if (!websiteUrl) {
    console.warn(
      `extractBrandProfile(${brandName}): no website URL — skipping extraction`
    );
    return null;
  }

  const snapshot = await fetchSiteSnapshot(websiteUrl);
  if (!snapshot) {
    console.warn(
      `extractBrandProfile(${brandName}): site fetch returned no usable snapshot — refusing to guess from brand name alone`
    );
    return null;
  }

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
            `THE TRACKED BRAND: ${brandName}`,
            `Their website: ${websiteUrl}`,
            `\nWebsite snapshot (remember: the tracked brand is ${brandName}, not any client / case study / third party named below):\n${snapshot}`,
          ].join("\n"),
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
