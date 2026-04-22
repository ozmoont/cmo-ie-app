/**
 * Shared HTML-snapshot helper for the classifiers.
 *
 * Extracts just enough of a page for Claude to reason about type —
 * title, meta descriptions, h1-h3, a short body excerpt — without
 * downloading the full document. Mirrors the brand-profile extractor
 * but tuned for classification: faster, stricter byte cap, returns
 * structured fields instead of a single concatenated string.
 */

export interface PageSnapshot {
  title: string;
  meta_description: string;
  og_description: string;
  og_type: string;
  headings: string[];
  body_excerpt: string;
  final_url: string;
}

function canonicaliseUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * Fetch a page and extract a compact structured snapshot for the
 * classifier. Returns null on any failure — callers should fall back
 * to a low-confidence "other" classification rather than retrying.
 */
export async function fetchPageSnapshot(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<PageSnapshot | null> {
  const { timeoutMs = 4000, maxBytes = 120_000 } = opts;
  let body: string;
  let finalUrl: string;

  try {
    const res = await fetch(canonicaliseUrl(url), {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CMO.ie-SourceClassifier/1.0; +https://cmo.ie)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    finalUrl = res.url;

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
  const meta_description = pick(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})["']/i
  );
  const og_description = pick(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})["']/i
  );
  const og_type = pick(
    /<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']{1,80})["']/i
  );

  // Pull up to the first 6 headings — strong signal for classification
  // (listicles often start with "10 best…", how-tos with "How to…",
  // articles with a discursive headline, forum threads with a question).
  const headings: string[] = [];
  const headingRe = /<h[1-3][^>]*>([\s\S]{1,200}?)<\/h[1-3]>/gi;
  let m: RegExpExecArray | null;
  while (headings.length < 6 && (m = headingRe.exec(body)) !== null) {
    const clean = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (clean) headings.push(clean);
  }

  // Short body excerpt — just enough context for classification, not a
  // full content dump.
  let body_excerpt = "";
  const bodyMatch = body.match(/<body[\s\S]*?<\/body>/i);
  if (bodyMatch) {
    body_excerpt = bodyMatch[0]
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
      .slice(0, 800);
  }

  return {
    title,
    meta_description,
    og_description,
    og_type,
    headings,
    body_excerpt,
    final_url: finalUrl,
  };
}
