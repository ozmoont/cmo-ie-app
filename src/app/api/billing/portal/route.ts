import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
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
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json(
      { error: "No organisation found" },
      { status: 400 }
    );
  }

  // Get org's Stripe customer ID
  const { data: org } = await supabase
    .from("organisations")
    .select("stripe_customer_id")
    .eq("id", profile.org_id)
    .single();

  if (!org?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer found" },
      { status: 400 }
    );
  }

  try {
    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Portal error:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
