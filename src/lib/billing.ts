import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export type Plan = "trial" | "starter" | "pro" | "advanced";

export function mapPriceToPlan(priceId: string): Plan {
  const mapping: Record<string, Plan> = {
    [process.env.STRIPE_PRICE_STARTER!]: "starter",
    [process.env.STRIPE_PRICE_PRO!]: "pro",
    [process.env.STRIPE_PRICE_ADVANCED!]: "advanced",
  };

  return mapping[priceId] ?? "trial";
}

export function getPriceIdForPlan(plan: Plan): string | null {
  if (plan === "trial") return null;

  const mapping: Record<Plan, string> = {
    starter: process.env.STRIPE_PRICE_STARTER!,
    pro: process.env.STRIPE_PRICE_PRO!,
    advanced: process.env.STRIPE_PRICE_ADVANCED!,
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
  const customer = await stripe.customers.create({
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
