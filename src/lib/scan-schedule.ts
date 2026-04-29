/**
 * Pure helpers for the "when's my next scan?" UX.
 *
 * Each plan has a runsPerMonth allowance. We translate that into an
 * average cadence (days between runs) and project the next ETA from
 * the most recent completed run. UI renders the ETA as a relative
 * time ("in 6 days") + an absolute date for clarity.
 *
 * Pure module — no DB, no fetch. Caller passes in plan + last-run
 * timestamp; it returns a Date or null.
 *
 * Source-of-truth plan caps: lib/types.ts → PLAN_LIMITS.
 */

import { PLAN_LIMITS } from "@/lib/types";
import type { Organisation } from "@/lib/types";

export interface NextScanInfo {
  /** ISO date the next scan is expected, or null if it can't be inferred. */
  next_scan_at: string | null;
  /** "in 6 days", "later today", "now" — relative to NOW. */
  relative: string | null;
  /** Days between consecutive scans on this plan. Useful for the UI. */
  cadence_days: number | null;
  /** Plain-English description of the cadence ("daily", "weekly"). */
  cadence_label: string;
  /**
   * TRUE when the plan's allowance is unlimited (Advanced + Agency)
   * and the next scan is implicitly tomorrow / on demand.
   */
  unlimited: boolean;
}

/**
 * Days-of-month average. Calendar-month-agnostic since some months
 * have 30, some 31; the user-facing "in N days" just needs a
 * believable midpoint.
 */
const DAYS_PER_MONTH = 30;

/**
 * Project the next scan ETA for a project, given the org's plan and
 * the most recently-started run on the project.
 *
 * Rules:
 *   - Unlimited plans (Advanced, Agency, Pro at 30/mo): cadence is
 *     daily. ETA = lastRun + 1 day, capped at "tomorrow morning".
 *   - Bounded plans (Trial 2/mo, Starter 4/mo): cadence is
 *     30 / runsPerMonth days. ETA = lastRun + cadence.
 *   - No prior run yet: ETA = NOW (the user can trigger a fresh run
 *     manually; we don't show an ETA in the past).
 */
export function computeNextScanEta(input: {
  plan: Organisation["plan"];
  lastRunStartedAt: string | null;
  now?: Date;
}): NextScanInfo {
  const limits = PLAN_LIMITS[input.plan];
  const runsPerMonth = limits.runsPerMonth;
  const now = input.now ?? new Date();

  if (runsPerMonth === Infinity) {
    // Unlimited plans run daily. If the most recent run was today,
    // next is tomorrow; if there's no prior run, next is "now".
    if (!input.lastRunStartedAt) {
      return {
        next_scan_at: now.toISOString(),
        relative: "available now",
        cadence_days: 1,
        cadence_label: "daily",
        unlimited: true,
      };
    }
    const last = new Date(input.lastRunStartedAt);
    const next = new Date(last.getTime() + 24 * 60 * 60 * 1000);
    return {
      next_scan_at: next.toISOString(),
      relative: relative(now, next),
      cadence_days: 1,
      cadence_label: "daily",
      unlimited: true,
    };
  }

  if (runsPerMonth >= 30) {
    // Daily-ish but capped — Pro at 30 lands here in practice.
    if (!input.lastRunStartedAt) {
      return {
        next_scan_at: now.toISOString(),
        relative: "available now",
        cadence_days: 1,
        cadence_label: "daily",
        unlimited: false,
      };
    }
    const last = new Date(input.lastRunStartedAt);
    const next = new Date(last.getTime() + 24 * 60 * 60 * 1000);
    return {
      next_scan_at: next.toISOString(),
      relative: relative(now, next),
      cadence_days: 1,
      cadence_label: "daily",
      unlimited: false,
    };
  }

  // Bounded plans: spread the budget across the calendar month.
  const cadenceDays = Math.max(
    1,
    Math.round(DAYS_PER_MONTH / Math.max(1, runsPerMonth))
  );
  const cadenceLabel = labelForCadence(cadenceDays);

  if (!input.lastRunStartedAt) {
    return {
      next_scan_at: now.toISOString(),
      relative: "available now",
      cadence_days: cadenceDays,
      cadence_label: cadenceLabel,
      unlimited: false,
    };
  }
  const last = new Date(input.lastRunStartedAt);
  const next = new Date(last.getTime() + cadenceDays * 24 * 60 * 60 * 1000);

  return {
    next_scan_at: next.toISOString(),
    relative: relative(now, next),
    cadence_days: cadenceDays,
    cadence_label: cadenceLabel,
    unlimited: false,
  };
}

function labelForCadence(days: number): string {
  if (days <= 1) return "daily";
  if (days <= 3) return "every few days";
  if (days <= 8) return "weekly";
  if (days <= 16) return "fortnightly";
  return "monthly";
}

function relative(now: Date, target: Date): string {
  const diffMs = target.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < -1440) {
    // Overdue by more than a day — likely a paused project. The UI
    // should treat this as "run available now" rather than negative.
    return "available now";
  }
  if (diffMin < 60) {
    if (diffMin <= 1) return "available now";
    return `in ${diffMin}m`;
  }
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `in ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "tomorrow";
  return `in ${diffDays} days`;
}
