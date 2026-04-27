/**
 * Eligibility logic for in-account SEO audits.
 *
 * Two questions this module answers:
 *   1. How many free audits has this org used this calendar month?
 *   2. Given the plan + that usage, what should the UI show — a
 *      free "Run audit" button, or a paid "Buy audit (€49)" button?
 *
 * The eligibility decision lives here (not inline in the page or
 * route) so the rules apply consistently in three places that need
 * the same answer:
 *   - The /projects/[id]/seo-audit page banner
 *   - The POST /api/projects/[id]/seo-audits route (rejects if no
 *     quota AND no payment intent)
 *   - The /api/billing/webhook handler when allocating a paid audit
 *
 * Quota window is calendar month UTC (matches runsPerMonth + brief
 * credits semantics elsewhere).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "@/lib/types";
import type { Organisation } from "@/lib/types";

export interface EligibilityResult {
  /** How many included audits the plan grants per month. */
  monthly_allowance: number;
  /** Audits the org has consumed FROM THE FREE QUOTA this month. */
  used_this_month: number;
  /** Free audits remaining in the current calendar month. */
  remaining: number;
  /** Whether the user can run an audit for free right now. */
  can_run_free: boolean;
  /** Whether they need to pay €49 (e.g. quota exhausted, or no quota). */
  must_pay: boolean;
  /**
   * Plain-English explanation of the state. Used directly in the
   * eligibility banner on the in-account tab. Avoid string-wrangling
   * in the UI by returning the copy here.
   */
  explanation: string;
}

/**
 * Compute eligibility for the org+plan, including how many free
 * audits remain this calendar month.
 */
export async function getSeoAuditEligibility(
  admin: SupabaseClient,
  org: { id: string; plan: Organisation["plan"] }
): Promise<EligibilityResult> {
  const limits = PLAN_LIMITS[org.plan];
  const monthly_allowance = limits.seoAuditsIncluded;

  // Count completed audits in the current calendar month that came
  // from the free pool. We count source='account_included' only —
  // paid audits don't deplete the free quota.
  const monthStart = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      1
    )
  ).toISOString();

  const { count } = await admin
    .from("seo_audits")
    .select("*", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("source", "account_included")
    .gte("created_at", monthStart)
    // Only completed audits count against quota — failed runs don't
    // burn the user's allowance. Matches runsPerMonth semantics where
    // we only count successful runs.
    .eq("status", "complete");

  const used = count ?? 0;
  const remaining = Math.max(0, monthly_allowance - used);
  const can_run_free = remaining > 0;
  const must_pay = !can_run_free;

  let explanation: string;
  if (monthly_allowance === 0) {
    explanation = `Your ${org.plan} plan doesn't include free SEO audits. Each audit is €49.`;
  } else if (can_run_free) {
    explanation = `Your ${org.plan} plan includes ${monthly_allowance} SEO audit${monthly_allowance === 1 ? "" : "s"} per month. ${remaining} remaining this month.`;
  } else {
    explanation = `You've used your ${monthly_allowance} included audit${monthly_allowance === 1 ? "" : "s"} for this month. Additional audits are €49 each. Quota resets on the 1st.`;
  }

  return {
    monthly_allowance,
    used_this_month: used,
    remaining,
    can_run_free,
    must_pay,
    explanation,
  };
}
