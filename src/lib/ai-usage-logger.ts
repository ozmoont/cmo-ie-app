// ── AI usage logger ──
// Fire-and-forget writer for the ai_usage_events table. The hot path
// (run engine, action plan, brief generator, etc.) calls `logAiUsage`
// after each adapter call. We do NOT await the insert — if the DB is
// slow or momentarily down, the user's request is unaffected.
//
// A missed log is worse than a stale one but still acceptable: the
// dashboard is an ops view, not an invoice. We'd rather drop a row
// under load than hang a 30s run for 500ms of insert latency.

import { createAdminClient } from "@/lib/supabase/admin";
import { computeCost, type Provider } from "@/lib/ai-pricing";

export type UsageFeature =
  | "run_check"
  | "sentiment"
  | "action_plan"
  | "brief"
  | "brand_extract"
  | "prompt_suggest"
  | "classifier"
  | "playbook"
  | "other";

export interface LogAiUsageInput {
  provider: Provider;
  model: string;
  feature: UsageFeature;

  input_tokens?: number;
  output_tokens?: number;
  web_search_calls?: number;

  /** Attribution. All optional — we log unattributed calls too. */
  org_id?: string | null;
  project_id?: string | null;
  user_id?: string | null;

  /** True if billed to customer's own key (BYOK). Default false. */
  byok?: boolean;

  duration_ms?: number;
  success?: boolean;
  error_code?: string | null;

  /**
   * Override auto-computed cost. Rarely needed — mostly a test hook,
   * or for providers with flat per-request pricing that we don't yet
   * model in PRICING.
   */
  cost_usd_override?: number;
}

/**
 * Write one usage event. Non-blocking; errors are swallowed and
 * written to console.warn so a flaky DB doesn't cascade into user
 * errors. Returns immediately.
 */
export function logAiUsage(input: LogAiUsageInput): void {
  const {
    provider,
    model,
    feature,
    input_tokens = 0,
    output_tokens = 0,
    web_search_calls,
    org_id = null,
    project_id = null,
    user_id = null,
    byok = false,
    duration_ms,
    success = true,
    error_code,
    cost_usd_override,
  } = input;

  const cost_usd =
    typeof cost_usd_override === "number"
      ? cost_usd_override
      : computeCost({
          provider,
          model,
          input_tokens,
          output_tokens,
          web_search_calls,
        });

  // Fire-and-forget insert. We intentionally don't return the Promise
  // so callers can't accidentally `await` it and slow the hot path.
  void (async () => {
    try {
      const admin = createAdminClient();
      await admin.from("ai_usage_events").insert({
        org_id,
        project_id,
        user_id,
        provider,
        model,
        feature,
        input_tokens,
        output_tokens,
        cost_usd,
        byok,
        duration_ms: duration_ms ?? null,
        success,
        error_code: error_code ?? null,
      });
    } catch (err) {
      // Fail quiet — do NOT throw. An ops-log outage must not take
      // down the run engine.
      console.warn("[ai-usage-logger] insert failed:", err);
    }
  })();
}
