/**
 * Shared classifier types — source_type / page_type enums and the
 * wire shape for the two classifiers. Kept separate from each
 * classifier so consumers (queue, queries, UI) import a stable set
 * of types regardless of which classifier is doing the work.
 *
 * The enum values match the CHECK constraints in migration 010 —
 * changing one requires a schema migration.
 */

export const SOURCE_TYPES = [
  "editorial",
  "corporate",
  "ugc",
  "reference",
  "your_own",
  "social",
  "other",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const PAGE_TYPES = [
  "article",
  "listicle",
  "how_to",
  "comparison",
  "review",
  "product_page",
  "landing",
  "directory",
  "forum_thread",
  "faq",
  "other",
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

export interface DomainClassification {
  domain: string;
  source_type: SourceType;
  confidence: number;
  sample_url?: string | null;
  manual_override: boolean;
  classifier_model_version?: string | null;
  classified_at: string;
}

export interface UrlClassification {
  url: string;
  page_type: PageType;
  confidence: number;
  page_title?: string | null;
  manual_override: boolean;
  classifier_model_version?: string | null;
  classified_at: string;
}

/**
 * Human-readable labels for UI rendering. Centralising these here means
 * a label-copy change never requires touching multiple components.
 */
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  editorial: "Editorial",
  corporate: "Corporate",
  ugc: "User-generated",
  reference: "Reference",
  your_own: "Your own",
  social: "Social",
  other: "Unclassified",
};

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  article: "Article",
  listicle: "Listicle",
  how_to: "How-to",
  comparison: "Comparison",
  review: "Review",
  product_page: "Product page",
  landing: "Landing page",
  directory: "Directory",
  forum_thread: "Forum thread",
  faq: "FAQ",
  other: "Other",
};

/**
 * Short optimisation-playbook text per source_type. Used by Gap
 * Analysis and Actions v2 to tell the user what to actually do about
 * a gap. Kept concise; the Actions pipeline layers longer copy on top.
 */
export const SOURCE_TYPE_PLAYBOOK: Record<SourceType, string> = {
  editorial:
    "Reach the editor or reporter. Digital PR, op-ed pitching, or contributed expert commentary.",
  corporate:
    "Explore a partnership, directory listing, or a case study with this company.",
  ugc: "Engage authentically in the community. Answer questions, share experience, build reputation.",
  reference:
    "Update the entry with accurate information. Submit yourself to the directory if eligible.",
  your_own:
    "Your own property — audit the page for structured data, AI readability, and keyword targeting.",
  social:
    "Show up in the conversation. Consistent posting, reshares, comments on peer accounts.",
  other:
    "Review this source manually — the classifier wasn't confident. Set a type to unlock the right playbook.",
};

/**
 * Canonicalise a hostname the same way every classifier + query does.
 * Lowercase, no scheme, no `www.`, no trailing slash or path.
 */
export function canonicaliseDomain(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const withoutScheme = trimmed.replace(/^https?:\/\//i, "");
  const hostOnly = withoutScheme.split("/")[0] ?? "";
  return hostOnly.replace(/^www\./i, "").toLowerCase();
}
