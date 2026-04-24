/**
 * GET /api/newsletter/confirm?token=...
 *   Verifies the HMAC token, flips subscribed_at on the matching row,
 *   and redirects to /newsletter/confirm (the public thank-you page).
 *
 * Invalid / expired tokens redirect with ?status=invalid so the page
 * can show a helpful error.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, verifyConfirmToken } from "@/lib/newsletter";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(
      new URL("/newsletter/confirmed?status=invalid", url.origin)
    );
  }

  const verified = verifyConfirmToken(token);
  if (!verified) {
    return NextResponse.redirect(
      new URL("/newsletter/confirmed?status=invalid", url.origin)
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("newsletter_subscribers")
    .update({
      subscribed_at: new Date().toISOString(),
      confirm_token: null,
      unsubscribed_at: null,
    })
    .ilike("email", verified.email)
    .eq("confirm_token", hashToken(token))
    .select("email")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.redirect(
      new URL("/newsletter/confirmed?status=invalid", url.origin)
    );
  }

  return NextResponse.redirect(
    new URL("/newsletter/confirmed?status=ok", url.origin)
  );
}
