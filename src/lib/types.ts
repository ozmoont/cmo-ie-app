// ── CMO.ie Database Types ──
// Derived from the Supabase schema. These are the source of truth.

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  plan: "trial" | "starter" | "pro" | "advanced";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  brief_credits_used: number;
  brief_credits_reset_at: string | null;
  created_at: string;
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
  created_at: string;
}

export interface Competitor {
  id: string;
  project_id: string;
  name: string;
  website_url: string | null;
  created_at: string;
}

export interface Prompt {
  id: string;
  project_id: string;
  text: string;
  category: PromptCategory;
  is_active: boolean;
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
  | "claude";

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
};

// ── Display Helpers ──

export const MODEL_LABELS: Record<AIModel, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  google_aio: "Google AI Overviews",
  gemini: "Gemini",
  claude: "Claude",
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
];

// ── Draft Generation ──

export type DraftOutputType = "blog_post" | "faq_page" | "schema_markup";

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
  created_at: string;
}

export const DRAFT_OUTPUT_LABELS: Record<DraftOutputType, string> = {
  blog_post: "Blog Post",
  faq_page: "FAQ Page",
  schema_markup: "Schema Markup",
};
