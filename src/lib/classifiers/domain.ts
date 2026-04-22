/**
 * Domain type classifier.
 *
 * Takes a domain (or a sample URL for initial fetch), sends a structured
 * snapshot to Claude Haiku, gets a source_type back. Caches the result
 * in `domain_classifications`. Hits that cache indefinitely — type
 * doesn't change for a domain in any realistic window.
 *
 * The caller is typically the post-run classifier queue, but it's safe
 * to call synchronously from a Server Component too (the cache hit is
 * a single-row lookup).
 */

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPageSnapshot } from "./fetch";
import {
  SOURCE_TYPES,
  canonicaliseDomain,
  type DomainClassification,
  type SourceType,
} from "./types";

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You classify a domain by source type for AI-search visibility analysis.

Return ONLY valid JSON, no markdown fences:
{
  "source_type": "editorial" | "corporate" | "ugc" | "reference" | "your_own" | "social" | "other",
  "confidence": number between 0 and 1,
  "reasoning": string (one short sentence)
}

Type definitions:
  editorial  — publishers: newspapers, magazines, industry blogs with named authors/editorial staff. e.g. irishtimes.com, techcrunch.com, business.ie
  corporate  — company-owned marketing sites (brand properties). e.g. hubspot.com, stripe.com, salesforce.com
  ugc        — user-generated-content platforms where content is crowdsourced. e.g. reddit.com, quora.com, stackoverflow.com
  reference  — reference works / directories / encyclopaedias / databases. e.g. wikipedia.org, crunchbase.com, g2.com (review directory)
  social     — social networks. e.g. linkedin.com, twitter.com, x.com, facebook.com, instagram.com
  your_own   — explicitly never pick this from the page alone; the caller sets this via an override list.
  other      — when you can't confidently classify from the content (pick this over guessing wrong).

Confidence guidance: 0.9+ when the pattern is unmistakable (e.g. wikipedia.org), 0.7–0.85 for clear but generic corporate/editorial sites, 0.6–0.7 if you needed to extrapolate.`;

/**
 * Normalise whatever Claude returned into a valid SourceType.
 */
function coerceSourceType(raw: unknown): SourceType {
  if (typeof raw !== "string") return "other";
  const t = raw.trim().toLowerCase();
  return (SOURCE_TYPES as readonly string[]).includes(t)
    ? (t as SourceType)
    : "other";
}

function coerceConfidence(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export interface ClassifyDomainOpts {
  /** Sample URL to fetch for the classification. Defaults to https://{domain}/. */
  sampleUrl?: string;
  /** Domains on this list are forced to `your_own` regardless of content. */
  yourOwnDomains?: string[];
  /** If true, bypasses the cache and re-classifies. Rarely needed. */
  force?: boolean;
  /** Optional Anthropic API key override. Else falls back to env var. */
  apiKey?: string;
}

/**
 * Look up or compute a classification for a single domain.
 *
 * Returns the cached row on hit. On miss, fetches a snapshot, calls
 * Haiku, writes to the cache, and returns the new row.
 *
 * Manual overrides on the cached row are respected — the classifier
 * never overwrites them.
 */
export async function classifyDomain(
  rawDomain: string,
  opts: ClassifyDomainOpts = {}
): Promise<DomainClassification | null> {
  const domain = canonicaliseDomain(rawDomain);
  if (!domain) return null;

  const admin = createAdminClient();

  // your_own override — short-circuit before any fetch.
  const yourOwn = (opts.yourOwnDomains ?? []).map((d) => canonicaliseDomain(d));
  if (yourOwn.includes(domain)) {
    return upsert(admin, {
      domain,
      source_type: "your_own",
      confidence: 1,
      sample_url: null,
      manual_override: false,
      classifier_model_version: "override:your_own",
    });
  }

  // Cache lookup.
  if (!opts.force) {
    const { data: existing } = await admin
      .from("domain_classifications")
      .select("*")
      .eq("domain", domain)
      .maybeSingle<DomainClassification>();
    if (existing) return existing;
  }

  // Fetch a representative page.
  const sampleUrl = opts.sampleUrl ?? `https://${domain}/`;
  const snapshot = await fetchPageSnapshot(sampleUrl);

  // Call Haiku with whatever snapshot we got (may be null → classifier
  // receives just the domain name and is asked to do its best).
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });

  let sourceType: SourceType = "other";
  let confidence = 0.5;
  try {
    const msg = await client.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 250,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: renderInput(domain, sampleUrl, snapshot),
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
    sourceType = coerceSourceType(parsed.source_type);
    confidence = coerceConfidence(parsed.confidence);
  } catch (err) {
    console.error(`classifyDomain(${domain}) failed:`, err);
    // Persist the failure as "other" so we don't retry immediately.
    // Users can manually override later if the classifier was wrong.
  }

  return upsert(admin, {
    domain,
    source_type: sourceType,
    confidence,
    sample_url: snapshot?.final_url ?? sampleUrl,
    manual_override: false,
    classifier_model_version: CLASSIFIER_MODEL,
  });
}

function renderInput(
  domain: string,
  sampleUrl: string,
  snapshot: import("./fetch").PageSnapshot | null
): string {
  const lines = [
    `Domain: ${domain}`,
    `Sample URL: ${sampleUrl}`,
  ];
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
    lines.push("\n(Site could not be fetched — classify from the domain name alone, and set confidence ≤ 0.5.)");
  }
  return lines.join("\n");
}

async function upsert(
  admin: ReturnType<typeof createAdminClient>,
  row: Omit<DomainClassification, "classified_at">
): Promise<DomainClassification> {
  const nowIso = new Date().toISOString();
  // Don't overwrite rows the user has manually overridden. We check
  // before upserting rather than in the UPSERT itself because
  // Supabase's JS client doesn't support conditional upserts cleanly.
  const { data: existing } = await admin
    .from("domain_classifications")
    .select("manual_override")
    .eq("domain", row.domain)
    .maybeSingle<{ manual_override: boolean }>();
  if (existing?.manual_override) {
    const { data: cached } = await admin
      .from("domain_classifications")
      .select("*")
      .eq("domain", row.domain)
      .maybeSingle<DomainClassification>();
    return cached ?? { ...row, classified_at: nowIso };
  }

  const { data, error } = await admin
    .from("domain_classifications")
    .upsert(
      {
        ...row,
        classified_at: nowIso,
      },
      { onConflict: "domain" }
    )
    .select()
    .single<DomainClassification>();
  if (error || !data) {
    console.error(`classifyDomain upsert failed for ${row.domain}:`, error);
    return { ...row, classified_at: nowIso };
  }
  return data;
}
