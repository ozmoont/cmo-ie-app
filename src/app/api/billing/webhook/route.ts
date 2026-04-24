import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, mapPriceToPlan } from "@/lib/billing";

export async function POST(request: Request) {
  const admin = createAdminClient();

  try {
    // Read raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 400 }
      );
    }

    // Handle events
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.org_id;

        if (orgId && session.customer) {
          // Get subscription details
          const subscription = await getStripe().subscriptions.retrieve(
            session.subscription as string
          );

          const priceId = (subscription.items.data[0]?.price.id as string) || "";
          const plan = mapPriceToPlan(priceId);

          // Update org with subscription details
          await admin
            .from("organisations")
            .update({
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: subscription.id,
              plan,
            })
            .eq("id", orgId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = (subscription.items.data[0]?.price.id as string) || "";
        const plan = mapPriceToPlan(priceId);

        // Find org by subscription ID
        const { data: org } = await admin
          .from("organisations")
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (org) {
          await admin
            .from("organisations")
            .update({ plan })
            .eq("id", org.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        // Find org by subscription ID and downgrade to trial
        const { data: org } = await admin
          .from("organisations")
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (org) {
          await admin
            .from("organisations")
            .update({
              plan: "trial",
              stripe_subscription_id: null,
            })
            .eq("id", org.id);
        }
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
