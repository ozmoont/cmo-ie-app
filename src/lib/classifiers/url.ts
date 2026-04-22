/**
 * URL page-type classifier.
 *
 * Takes a specific URL, fetches a snapshot, asks Haiku which of the
 * page-type buckets it falls into (article / listicle / how-to etc.).
 * Persists the answer + extracted title in `url_classifications`.
 *
 * Runs lazily from the post-run classifier queue. Results are cached
 * by URL indefinitely — if a publisher drastically changes a page,
 * the user can manually override.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPageSnapshot } from "./fetch";
import {
  PAGE_TYPES,
  type PageType,
  type UrlClassification,
} from "./types";

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You classify a single web page by its content type for AI-search visibility analysis.

Return ONLY valid JSON, no markdown fences:
{
  "page_type": "article" | "listicle" | "how_to" | "comparison" | "review" | "product_page" | "landing" | "directory" | "forum_thread" | "faq" | "other",
  "confidence": number between 0 and 1
}

Type definitions:
  article        — a discursive piece of content / news story / opinion / feature. Usually single topic, narrative.
  listicle       — ordered or unordered list of things. "10 best X", "Top X in Y".
  how_to         — step-by-step instructional content. "How to do X", "A guide to Y".
  comparison     — side-by-side of two or more options. "X vs Y", "X compared to Y".
  review         — focused evaluation of a single product/service/brand with a verdict.
  product_page   — a company's page selling a specific product or service.
  landing        — marketing-oriented page designed for conversions (homepage, campaign page).
  directory      — structured listing of multiple entities (a register, member list, category page).
  forum_thread   — user-generated Q&A or discussion (Reddit, Quora, StackOverflow, etc.).
  faq            — a FAQ page with discrete question/answer pairs.
  other          — none of the above is clearly right.

Bias toward concrete types; only use "other" if you genuinely can't tell.`;

function coercePageType(raw: unknown): PageType {
  if (typeof raw !== "string") return "other";
  const t = raw.trim().toLowerCase();
  return (PAGE_TYPES as readonly string[]).includes(t)
    ? (t as PageType)
    : "other";
}

function coerceConfidence(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export interface ClassifyUrlOpts {
  force?: boolean;
  apiKey?: string;
}

/**
 * Look up or compute a page-type classification for a single URL.
 */
export async function classifyUrl(
  url: string,
  opts: ClassifyUrlOpts = {}
): Promise<UrlClassification | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const admin = createAdminClient();

  if (!opts.force) {
    const { data: existing } = await admin
      .from("url_classifications")
      .select("*")
      .eq("url", trimmed)
      .maybeSingle<UrlClassification>();
    if (existing) return existing;
  }

  const snapshot = await fetchPageSnapshot(trimmed);

  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });

  let pageType: PageType = "other";
  let confidence = 0.5;
  try {
    const msg = await client.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: renderInput(trimmed, snapshot),
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
    pageType = coercePageType(parsed.page_type);
    confidence = coerceConfidence(parsed.confidence);
  } catch (err) {
    console.error(`classifyUrl(${trimmed}) failed:`, err);
  }

  return upsert(admin, {
    url: trimmed,
    page_type: pageType,
    confidence,
    page_title: snapshot?.title ?? null,
    manual_override: false,
    classifier_model_version: CLASSIFIER_MODEL,
  });
}

function renderInput(
  url: string,
  snapshot: import("./fetch").PageSnapshot | null
): string {
  const lines = [`URL: ${url}`];
  if (snapshot) {
    if (snapshot.title) lines.push(`\nTitle: ${snapshot.title}`);
    if (snapshot.og_type) lines.push(`og:type: ${snapshot.og_type}`);
    if (snapshot.meta_description)
      lines.push(`Meta description: ${snapshot.meta_description}`);
    if (snapshot.og_description && snapshot.og_description !== snapshot.meta_description)
      lines.push(`OG description: ${snapshot.og_description}`);
    if (snapshot.headings.length)
      lines.push(`Headings: ${snapshot.headings.slice(0, 6).join(" | ")}`);
    if (snapshot.body_excerpt)
      lines.push(`Body excerpt: ${snapshot.body_excerpt}`);
  } else {
    lines.push("\n(URL could not be fetched — classify from the URL path alone, and set confidence ≤ 0.5.)");
  }
  return lines.join("\n");
}

async function upsert(
  admin: ReturnType<typeof createAdminClient>,
  row: Omit<UrlClassification, "classified_at">
): Promise<UrlClassification> {
  const nowIso = new Date().toISOString();
  const { data: existing } = await admin
    .from("url_classifications")
    .select("manual_override")
    .eq("url", row.url)
    .maybeSingle<{ manual_override: boolean }>();
  if (existing?.manual_override) {
    const { data: cached } = await admin
      .from("url_classifications")
      .select("*")
      .eq("url", row.url)
      .maybeSingle<UrlClassification>();
    return cached ?? { ...row, classified_at: nowIso };
  }

  const { data, error } = await admin
    .from("url_classifications")
    .upsert(
      {
        ...row,
        classified_at: nowIso,
      },
      { onConflict: "url" }
    )
    .select()
    .single<UrlClassification>();
  if (error || !data) {
    console.error(`classifyUrl upsert failed for ${row.url}:`, error);
    return { ...row, classified_at: nowIso };
  }
  return data;
}
