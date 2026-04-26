import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lazy Stripe client factory. Constructing Stripe at module load
 * throws when STRIPE_SECRET_KEY isn't set — which makes Next.js's
 * build-time page-data collection pass fail on every route that
 * transitively imports this file, even routes that never actually
 * call Stripe.
 *
 * Deferring construction to request time keeps builds green in
 * environments where Stripe isn't configured (internal test deploy,
 * local dev without billing). Call sites that need a real client
 * call getStripe(); routes that only need plan-mapping helpers
 * (mapPriceToPlan / getPriceIdForPlan) don't pay the cost.
 */
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY not configured. Billing routes require Stripe; skip them or add the env var."
      );
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export type Plan = "trial" | "starter" | "pro" | "advanced" | "agency";

// Price IDs live under NEXT_PUBLIC_* so the client-side pricing cards
// (src/components/dashboard/pricing-cards.tsx) can read them directly
// when building the Stripe checkout URL. Price IDs are not secret —
// Stripe exposes them in the checkout redirect anyway — so the public
// prefix is safe and avoids having two env vars per plan.
export function mapPriceToPlan(priceId: string): Plan {
  const mapping: Record<string, Plan> = {
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER!]: "starter",
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO!]: "pro",
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_ADVANCED!]: "advanced",
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_AGENCY!]: "agency",
  };

  return mapping[priceId] ?? "trial";
}

export function getPriceIdForPlan(plan: Plan): string | null {
  if (plan === "trial") return null;

  const mapping: Record<Plan, string> = {
    starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER!,
    pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO!,
    advanced: process.env.NEXT_PUBLIC_STRIPE_PRICE_ADVANCED!,
    agency: process.env.NEXT_PUBLIC_STRIPE_PRICE_AGENCY!,
    trial: "",
  };

  return mapping[plan];
}

export async function getOrCreateStripeCustomer(
  orgId: string,
  orgName: string,
  email: string
): Promise<string> {
  const admin = createAdminClient();

  // Fetch org to check if customer exists
  const { data: org } = await admin
    .from("organisations")
    .select("stripe_customer_id")
    .eq("id", orgId)
    .single();

  if (org?.stripe_customer_id) {
    return org.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await getStripe().customers.create({
    name: orgName,
    email: email,
    metadata: {
      org_id: orgId,
    },
  });

  // Update org with new customer ID
  await admin
    .from("organisations")
    .update({ stripe_customer_id: customer.id })
    .eq("id", orgId);

  return customer.id;
}
