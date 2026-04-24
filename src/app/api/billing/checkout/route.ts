import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomer, getStripe } from "@/lib/billing";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's profile and org
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, full_name")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json(
      { error: "No organisation found" },
      { status: 400 }
    );
  }

  // Get org details
  const { data: org } = await supabase
    .from("organisations")
    .select("id, name")
    .eq("id", profile.org_id)
    .single();

  if (!org) {
    return NextResponse.json(
      { error: "Organisation not found" },
      { status: 400 }
    );
  }

  // Parse request body
  const { priceId } = await request.json();

  if (!priceId) {
    return NextResponse.json(
      { error: "Missing priceId" },
      { status: 400 }
    );
  }

  try {
    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(
      org.id,
      org.name,
      user.email!
    );

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
      metadata: {
        org_id: org.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
