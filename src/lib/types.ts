// ── CMO.ie Database Types ──
// Derived from the Supabase schema. These are the source of truth.

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  plan: "trial" | "starter" | "pro" | "advanced" | "agency";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  brief_credits_used: number;
  brief_credits_reset_at: string | null;
  /** Monthly brief-credit pool for agency-tier orgs. Zero on every other plan. */
  agency_credit_pool: number;
  created_at: string;
}

/**
 * Per-project cap within an agency-tier org's credit pool.
 * Present only for projects with an explicit cap; missing row = uncapped.
 * See migration 017.
 */
export interface ProjectCreditAllocation {
  project_id: string;
  monthly_cap: number | null;
  monthly_cap_used: number;
  updated_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  full_name: string | null;
  role: "owner" | "admin" | "member";
  created_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  website_url: string | null;
  brand_name: string;
  country_codes: string[];
  models: AIModel[];
  is_pitch: boolean;
  // ── Brand matching (migration 006) ──
  /** Human-readable brand label shown in dashboards. Does not drive matching. */
  brand_display_name: string;
  /** Canonical matching token for the tracked brand. Shortest unique form. */
  brand_tracked_name: string;
  /** Alternative spellings / abbreviations that count as mentions of the brand. */
  brand_aliases: string[];
  /** Optional case-sensitive regex override for complex matching. */
  brand_regex_pattern: string | null;
  /** Domains owned by the tracked brand; classifies sources as "you" in analytics. */
  brand_domains: string[];
  // ── Brand profile (migration 009) — nullable until extraction runs ──
  profile_short_description: string | null;
  profile_market_segment: string | null;
  profile_brand_identity: string | null;
  profile_target_audience: string | null;
  /** JSONB column shaped as `BrandProductService[]` — see lib/brand-profile.ts. */
  profile_products_services: { name: string; description: string }[];
  profile_updated_at: string | null;
  created_at: string;
}

export interface Competitor {
  id: string;
  project_id: string;
  /** Legacy single-name field. Kept populated as a copy of tracked_name for back-compat with older UIs; new code should prefer display_name / tracked_name. */
  name: string;
  website_url: string | null;
  // ── Brand matching (migration 006) ──
  display_name: string;
  tracked_name: string;
  aliases: string[];
  regex_pattern: string | null;
  color: string | null;
  domains: string[];
  created_at: string;
}

/**
 * One brand appearance in a chat response. Populated by the run engine
 * for every brand named, not just tracked competitors — the complete
 * list is needed for accurate position ranking (Peec convention).
 */
export interface ResultBrandMention {
  id: string;
  result_id: string;
  /** Display name of the brand as shown in the UI. */
  brand_name: string;
  /** Set when the mention matched a tracked competitor. */
  competitor_id: string | null;
  /** True when this mention is the project's own tracked brand. */
  is_tracked_brand: boolean;
  /** 1-indexed order the brand appeared in the response. */
  position: number;
  sentiment: Sentiment | null;
  created_at: string;
}

export interface Prompt {
  id: string;
  project_id: string;
  text: string;
  category: PromptCategory;
  /** Legacy boolean, kept for back-compat. New code should use `status`. */
  is_active: boolean;
  /** Current state — drives whether the prompt runs daily. See migration 007. */
  status: PromptStatus;
  /** ISO-3166 alpha-2. The prompt's target market for geo-aware queries. */
  country_code: string;
  /** Optional folder-style grouping. One topic per prompt. NULL = "No Topic". */
  topic_id: string | null;
  created_at: string;
}

export type PromptStatus = "active" | "inactive" | "deleted";

/**
 * Folder-style prompt grouping. One topic per prompt. Drives sidebar
 * hierarchy, prompt suggestions, and topic-level aggregated metrics.
 */
export interface Topic {
  id: string;
  project_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

/**
 * Free-form labels applied to prompts. Many tags per prompt; AND/OR
 * filtering on the dashboard.
 */
export interface Tag {
  id: string;
  project_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

/** Many-to-many join between prompts and tags. */
export interface PromptTag {
  prompt_id: string;
  tag_id: string;
  created_at: string;
}

export interface DailyRun {
  id: string;
  project_id: string;
  run_date: string;
  status: "pending" | "running" | "complete" | "failed";
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Result {
  id: string;
  run_id: string;
  prompt_id: string;
  model: AIModel;
  /** Concrete model identifier from the provider (e.g. gpt-4.1-2025-04-14). */
  model_version: string | null;
  brand_mentioned: boolean;
  mention_position: number | null;
  sentiment: Sentiment | null;
  response_snippet: string | null;
  created_at: string;
}

export interface Citation {
  id: string;
  result_id: string;
  url: string;
  domain: string;
  is_brand_domain: boolean;
  is_competitor_domain: boolean;
  /**
   * True if the model explicitly cited this URL inline in the response body.
   * False if the URL was in the model's sources/sidebar but not referenced
   * inline — still an opportunity, but a different one.
   */
  was_cited_inline: boolean;
  position: number | null;
  created_at: string;
}

// ── Enums ──

export type AIModel =
  | "chatgpt"
  | "perplexity"
  | "google_aio"
  | "gemini"
  | "claude"
  | "copilot"
  | "grok";

export type PromptCategory = "awareness" | "consideration" | "decision";

export type Sentiment = "positive" | "neutral" | "negative";

// ── Plan Limits ──

export const PLAN_LIMITS: Record<
  Organisation["plan"],
  {
    projects: number;
    prompts: number;
    competitors: number;
    models: number;
    totalChecks: number; // max prompt×model checks per month (Infinity = unlimited)
    actionTier: "gaps" | "strategy" | "full";
    briefCredits: number;
    blurResults: boolean; // if true, show 1 result clear + blur the rest
  }
> = {
  trial: {
    projects: 1,
    prompts: 1,
    competitors: 3,
    models: 3,
    totalChecks: 10,
    actionTier: "gaps",
    briefCredits: 0,
    blurResults: true,
  },
  starter: {
    projects: 1,
    prompts: 25,
    competitors: 5,
    models: 3,
    totalChecks: Infinity,
    actionTier: "gaps",
    briefCredits: 5,
    blurResults: false,
  },
  pro: {
    projects: 3,
    prompts: 50,
    competitors: 10,
    models: 5,
    totalChecks: Infinity,
    actionTier: "strategy",
    briefCredits: 20,
    blurResults: false,
  },
  advanced: {
    projects: Infinity,
    prompts: Infinity,
    competitors: Infinity,
    models: 5,
    totalChecks: Infinity,
    actionTier: "full",
    briefCredits: Infinity,
    blurResults: false,
  },
  // Agency tier: unlimited projects / prompts / competitors. The
  // briefCredits limit here is the DEFAULT shown when `agency_credit_pool`
  // is unset; in practice callers should read `agency_credit_pool`
  // from the org row (see lib/queries.getOrgBriefCredits).
  agency: {
    projects: Infinity,
    prompts: Infinity,
    competitors: Infinity,
    models: 5,
    totalChecks: Infinity,
    actionTier: "full",
    briefCredits: 100,
    blurResults: false,
  },
};

// ── Display Helpers ──

export const MODEL_LABELS: Record<AIModel, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  google_aio: "Google AI Overviews",
  gemini: "Gemini",
  claude: "Claude",
  copilot: "Microsoft Copilot",
  grok: "Grok",
};

export const CATEGORY_LABELS: Record<PromptCategory, string> = {
  awareness: "Awareness",
  consideration: "Consideration",
  decision: "Decision",
};

export const AVAILABLE_COUNTRIES = [
  { code: "IE", name: "Ireland" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "EU", name: "Europe (General)" },
] as const;

export const AVAILABLE_MODELS: { value: AIModel; label: string }[] = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "perplexity", label: "Perplexity" },
  { value: "google_aio", label: "Google AI Overviews" },
  { value: "gemini", label: "Gemini" },
  { value: "claude", label: "Claude" },
  { value: "copilot", label: "Microsoft Copilot" },
  { value: "grok", label: "Grok" },
];

// ── Draft Generation ──

export type DraftOutputType = "blog_post" | "faq_page" | "schema_markup";

// ── Action Plans (migration 012) ────────────────────────────────────

export type ActionPlanTier = "gaps" | "strategy" | "full";
export type ActionStepStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "dismissed";
export type ActionEffort = "low" | "medium" | "high";
export type ActionImpact = "low" | "medium" | "high";
export type ActionCategory = "content" | "technical" | "outreach" | "brand";

export type ActionPlanStatus = "generating" | "complete" | "failed";

export interface ActionPlan {
  id: string;
  project_id: string;
  created_at: string;
  created_by: string | null;
  tier: ActionPlanTier;
  model_version: string | null;
  superseded_at: string | null;
  // Migration 013: surfaces in-progress state so navigation away
  // doesn't look like a failure.
  status: ActionPlanStatus;
  status_message: string | null;
  started_at: string | null;
}

export interface ActionItem {
  id: string;
  plan_id: string;
  prompt_id: string | null;
  prompt_text: string | null;
  root_cause: string | null;
  competitor_advantage: string | null;
  opportunity_type: string | null;
  position: number;
  created_at: string;
}

export interface ActionStep {
  id: string;
  item_id: string;
  title: string;
  description: string | null;
  effort: ActionEffort;
  impact: ActionImpact;
  category: ActionCategory;
  status: ActionStepStatus;
  user_notes: string | null;
  completed_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

/** Shape returned by GET /api/projects/[id]/actions — nested for UI convenience. */
export interface ActionPlanWithItems extends ActionPlan {
  items: (ActionItem & { steps: ActionStep[] })[];
}

export interface PolishRequest {
  id: string;
  project_id: string;
  org_id: string;
  brief_text: string;
  draft_text: string | null;
  action_title: string;
  contact_email: string;
  notes: string;
  status: "pending" | "in_progress" | "complete";
  /** Gap context captured when the user clicked "Act on this". Migration 015. */
  source_gap: SourceGap | null;
  created_at: string;
}

/**
 * Gap context persisted with a polish_request and passed through the
 * brief/draft pipeline so generators can tailor output per source type
 * (editorial pitch vs. Reddit reply vs. directory submission).
 *
 * Additive shape — fields may be absent on older rows. Only `scope`,
 * `domain`, and `captured_at` are guaranteed.
 */
export interface SourceGap {
  scope: "domain" | "url";
  domain: string;
  url?: string;
  source_type?:
    | "editorial"
    | "corporate"
    | "ugc"
    | "reference"
    | "your_own"
    | "social"
    | "other"
    | null;
  page_type?:
    | "article"
    | "listicle"
    | "how_to"
    | "comparison"
    | "review"
    | "product_page"
    | "landing"
    | "directory"
    | "forum_thread"
    | "faq"
    | "other"
    | null;
  competitors?: string[];
  gap_score?: number;
  captured_at: string;
}

export const DRAFT_OUTPUT_LABELS: Record<DraftOutputType, string> = {
  blog_post: "Blog Post",
  faq_page: "FAQ Page",
  schema_markup: "Schema Markup",
};
