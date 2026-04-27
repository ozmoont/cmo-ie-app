import { describe, it, expect, vi } from "vitest";
import { getSeoAuditEligibility } from "../eligibility";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal mock builder. All we exercise is the count() result, so we
 * stub the chain to return whatever `usedThisMonth` we want.
 */
function mockAdmin(usedThisMonth: number): SupabaseClient {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    then: undefined,
    // Final await on the builder yields { count, error: null }.
    // We resolve via the builder being a thenable.
  };
  // Make the builder thenable so `await admin.from(...).select(...).eq(...)`
  // resolves to the count payload.
  (builder as { then?: unknown }).then = (
    onFulfilled: (v: { count: number; error: null }) => unknown
  ) => onFulfilled({ count: usedThisMonth, error: null });
  const admin = {
    from: vi.fn(() => builder),
  };
  return admin as unknown as SupabaseClient;
}

describe("getSeoAuditEligibility", () => {
  it("trial: 0 allowance, must_pay=true, no audits to count", async () => {
    const admin = mockAdmin(0);
    const result = await getSeoAuditEligibility(admin, {
      id: "org-1",
      plan: "trial",
    });
    expect(result.monthly_allowance).toBe(0);
    expect(result.used_this_month).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.can_run_free).toBe(false);
    expect(result.must_pay).toBe(true);
    expect(result.explanation).toMatch(/doesn't include free SEO audits/);
    expect(result.explanation).toMatch(/€49/);
  });

  it("starter: same — 0 allowance, must pay", async () => {
    const admin = mockAdmin(0);
    const result = await getSeoAuditEligibility(admin, {
      id: "org-1",
      plan: "starter",
    });
    expect(result.must_pay).toBe(true);
    expect(result.monthly_allowance).toBe(0);
  });

  it("pro: 1 free, 0 used → can run free", async () => {
    const admin = mockAdmin(0);
    const result = await getSeoAuditEligibility(admin, {
      id: "org-1",
      plan: "pro",
    });
    expect(result.monthly_allowance).toBe(1);
    expect(result.remaining).toBe(1);
    expect(result.can_run_free).toBe(true);
    expect(result.explanation).toMatch(/1 SEO audit/);
    expect(result.explanation).toMatch(/1 remaining/);
  });

  it("pro: 1 free, 1 used → must pay (quota exhausted)", async () => {
    const admin = mockAdmin(1);
    const result = await getSeoAuditEligibility(admin, {
      id: "org-1",
      plan: "pro",
    });
    expect(result.used_this_month).toBe(1);
    expect(result.remaining).toBe(0);
    expect(result.can_run_free).toBe(false);
    expect(result.must_pay).toBe(true);
    expect(result.explanation).toMatch(/used your 1 included audit/);
    expect(result.explanation).toMatch(/€49/);
  });

  it("advanced: 3 free, 2 used → 1 remaining, can still run free", async () => {
    const admin = mockAdmin(2);
    const result = await getSeoAuditEligibility(admin, {
      id: "org-1",
      plan: "advanced",
    });
    expect(result.monthly_allowance).toBe(3);
    expect(result.used_this_month).toBe(2);
    expect(result.remaining).toBe(1);
    expect(result.can_run_free).toBe(true);
    expect(result.explanation).toMatch(/1 remaining/);
  });

  it("advanced: 3 free, 5 used (data anomaly) → remaining clamped to 0", async () => {
    // Should never happen via the route (we enforce the check before
    // inserting), but defensive code shouldn't go negative if it does.
    const admin = mockAdmin(5);
    const result = await getSeoAuditEligibility(admin, {
      id: "org-1",
      plan: "advanced",
    });
    expect(result.remaining).toBe(0);
    expect(result.must_pay).toBe(true);
  });

  it("agency: 1 per-project allowance applied at org level", async () => {
    // The constant in PLAN_LIMITS is 1 per the comment; we just check
    // it's set and the maths matches. Per-client multiplication is
    // computed elsewhere when integrating with active client count.
    const admin = mockAdmin(0);
    const result = await getSeoAuditEligibility(admin, {
      id: "org-1",
      plan: "agency",
    });
    expect(result.monthly_allowance).toBe(1);
  });
});
