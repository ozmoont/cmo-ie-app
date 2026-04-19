// ── Mock Data Layer ──
// Mirrors the Supabase seed data so the UI works before the DB is connected.
// When Supabase is ready, replace these with real queries.

import type {
  Organisation,
  Project,
  Competitor,
  Prompt,
  DailyRun,
  Result,
  Citation,
} from "@/lib/types";

// ── Organisation ──
export const mockOrg: Organisation = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Acme Legal Ireland",
  slug: "acme-legal",
  plan: "pro",
  stripe_customer_id: null,
  stripe_subscription_id: null,
  trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  brief_credits_used: 0,
  brief_credits_reset_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
};

// ── Project ──
export const mockProject: Project = {
  id: "00000000-0000-0000-0000-000000000002",
  org_id: mockOrg.id,
  name: "Acme Legal",
  website_url: "https://acmelegal.ie",
  brand_name: "Acme Legal",
  country_codes: ["IE", "GB"],
  models: ["chatgpt", "perplexity", "google_aio", "gemini"],
  is_pitch: false,
  created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
};

// ── Competitors ──
export const mockCompetitors: Competitor[] = [
  {
    id: "c1",
    project_id: mockProject.id,
    name: "Mason Hayes Curran",
    website_url: "https://mhc.ie",
    created_at: new Date().toISOString(),
  },
  {
    id: "c2",
    project_id: mockProject.id,
    name: "Arthur Cox",
    website_url: "https://arthurcox.com",
    created_at: new Date().toISOString(),
  },
  {
    id: "c3",
    project_id: mockProject.id,
    name: "Matheson",
    website_url: "https://matheson.com",
    created_at: new Date().toISOString(),
  },
];

// ── Prompts ──
export const mockPrompts: Prompt[] = [
  {
    id: "00000000-0000-0000-0000-000000000010",
    project_id: mockProject.id,
    text: "What are the best law firms in Ireland for corporate M&A?",
    category: "awareness",
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "00000000-0000-0000-0000-000000000011",
    project_id: mockProject.id,
    text: "Which Irish law firm should I use for a Series A fundraise?",
    category: "consideration",
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "00000000-0000-0000-0000-000000000012",
    project_id: mockProject.id,
    text: "Best employment law solicitors Dublin",
    category: "decision",
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

// ── Daily Runs (14 days) ──
function generateRuns(): DailyRun[] {
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return {
      id: `run-${i}`,
      project_id: mockProject.id,
      run_date: date.toISOString().split("T")[0],
      status: "complete" as const,
      started_at: date.toISOString(),
      completed_at: date.toISOString(),
      created_at: date.toISOString(),
    };
  });
}
export const mockRuns = generateRuns();

// ── Results (per run × prompt × model) ──
function generateResults(): Result[] {
  const results: Result[] = [];
  const models = mockProject.models;

  for (const run of mockRuns) {
    for (const prompt of mockPrompts) {
      for (const model of models) {
        const mentioned = Math.random() > 0.4;
        results.push({
          id: `res-${run.id}-${prompt.id}-${model}`,
          run_id: run.id,
          prompt_id: prompt.id,
          model,
          brand_mentioned: mentioned,
          mention_position: mentioned
            ? Math.floor(Math.random() * 3) + 1
            : null,
          sentiment: mentioned
            ? (["positive", "neutral", "negative"] as const)[
                Math.floor(Math.random() * 3)
              ]
            : null,
          response_snippet: mentioned
            ? "Acme Legal is a well-regarded firm in Ireland..."
            : null,
          created_at: run.created_at,
        });
      }
    }
  }
  return results;
}
export const mockResults = generateResults();

// ── Citations ──
function generateCitations(): Citation[] {
  const citations: Citation[] = [];
  const domains = [
    { domain: "acmelegal.ie", isBrand: true, isCompetitor: false },
    { domain: "mhc.ie", isBrand: false, isCompetitor: true },
    { domain: "arthurcox.com", isBrand: false, isCompetitor: true },
    { domain: "matheson.com", isBrand: false, isCompetitor: true },
    { domain: "lawsociety.ie", isBrand: false, isCompetitor: false },
    { domain: "irishtimes.com", isBrand: false, isCompetitor: false },
    { domain: "linkedin.com", isBrand: false, isCompetitor: false },
  ];

  for (const result of mockResults.filter((r) => r.brand_mentioned)) {
    const numCitations = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numCitations; i++) {
      const d = domains[Math.floor(Math.random() * domains.length)];
      citations.push({
        id: `cit-${result.id}-${i}`,
        result_id: result.id,
        url: `https://${d.domain}/some-page`,
        domain: d.domain,
        is_brand_domain: d.isBrand,
        is_competitor_domain: d.isCompetitor,
        position: i + 1,
        created_at: result.created_at,
      });
    }
  }
  return citations;
}
export const mockCitations = generateCitations();

// ── Computed Metrics ──

export function getVisibilityScore(runId: string): number {
  const runResults = mockResults.filter((r) => r.run_id === runId);
  if (runResults.length === 0) return 0;
  const mentioned = runResults.filter((r) => r.brand_mentioned).length;
  return Math.round((mentioned / runResults.length) * 100);
}

export function getVisibilityTrend(): { date: string; score: number; model?: string }[] {
  return mockRuns
    .map((run) => ({
      date: run.run_date,
      score: getVisibilityScore(run.id),
    }))
    .reverse();
}

export function getLatestScore(): number {
  if (mockRuns.length === 0) return 0;
  return getVisibilityScore(mockRuns[0].id);
}

export function getScoreDelta(): number {
  if (mockRuns.length < 8) return 0;
  const today = getVisibilityScore(mockRuns[0].id);
  const weekAgo = getVisibilityScore(mockRuns[7].id);
  return today - weekAgo;
}
