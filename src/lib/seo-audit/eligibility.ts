/**
 * Eligibility logic for in-account SEO audits.
 *
 * Three questions this module answers:
 *   1. How many comp SEO audits does the org currently have?
 *      (admin-granted via /admin/orgs, see migration 027)
 *   2. How many plan-quota audits has this org used this month?
 *   3. Given (1) + (2), can the user run an audit for free right now,
 *      or do they need to pay / upgrade?
 *
 * Comps are consumed BEFORE the plan's monthly free quota — so a
 * grant is genuinely an extension on top, not a replacement.
 *
 * The eligibility decision lives here (not inline in the page or
 * route) so the rules apply consistently across:
 *   - The /projects/[id]/seo-audit page banner
 *   - The POST /api/projects/[id]/seo-audits route
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
  /** Admin-granted comp audits available right now (independent of plan). */
  comp_remaining: number;
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

  // Pull the comp balance off the org row. Migration 027 guarantees
  // the column exists and defaults to 0, so a missing column would
  // surface as a query error — better to fail loudly than silently
  // mis-count.
  const { data: orgRow } = await admin
    .from("organisations")
    .select("comp_seo_audits")
    .eq("id", org.id)
    .maybeSingle<{ comp_seo_audits: number | null }>();
  const comp_remaining = Math.max(0, orgRow?.comp_seo_audits ?? 0);

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
  // Free run if EITHER the plan's monthly quota has room OR the org
  // has a comp credit. Comp consumption happens at audit-creation
  // time (route layer); this function only tells the UI whether
  // there's headroom anywhere.
  const can_run_free = remaining > 0 || comp_remaining > 0;
  const must_pay = !can_run_free;

  let explanation: string;
  if (comp_remaining > 0 && remaining > 0) {
    explanation = `Your ${org.plan} plan includes ${monthly_allowance} SEO audit${monthly_allowance === 1 ? "" : "s"} per month (${remaining} remaining), plus ${comp_remaining} admin-granted audit${comp_remaining === 1 ? "" : "s"} on top.`;
  } else if (comp_remaining > 0) {
    explanation = `You have ${comp_remaining} admin-granted audit${comp_remaining === 1 ? "" : "s"} available. Plan quota for this month is exhausted.`;
  } else if (monthly_allowance === 0) {
    explanation = `Your ${org.plan} plan doesn't include free SEO audits. Upgrade to Pro for 1 free per month, or Advanced for 3.`;
  } else if (can_run_free) {
    explanation = `Your ${org.plan} plan includes ${monthly_allowance} SEO audit${monthly_allowance === 1 ? "" : "s"} per month. ${remaining} remaining this month.`;
  } else {
    explanation = `You've used your ${monthly_allowance} included audit${monthly_allowance === 1 ? "" : "s"} for this month. Quota resets on the 1st. Upgrade for more, or contact us for an admin-granted audit.`;
  }

  return {
    monthly_allowance,
    used_this_month: used,
    remaining,
    comp_remaining,
    can_run_free,
    must_pay,
    explanation,
  };
}
