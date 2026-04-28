/**
 * POST /api/newsletter/subscribe
 *   Body: { email: string, source?: "crawlability" | "onboarding" | "agency" | "manual" }
 *   Inserts / refreshes a newsletter_subscribers row and returns a
 *   confirmation URL the caller (or the eventual email dispatcher)
 *   should send to the user.
 *
 * Idempotent on lower(email). If the row already exists:
 *   - If already subscribed: return subscribed: true.
 *   - Otherwise: mint a fresh confirmation token and return it.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, mintConfirmToken } from "@/lib/newsletter";

const VALID_SOURCES = ["crawlability", "onboarding", "agency", "manual"] as const;

export async function POST(request: Request) {
  try {
    let body: { email?: string; source?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = normaliseEmail(body.email);
    if (!email) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const source =
      body.source && (VALID_SOURCES as readonly string[]).includes(body.source)
        ? (body.source as (typeof VALID_SOURCES)[number])
        : "crawlability";

    const admin = createAdminClient();

    // Check for an existing row.
    const { data: existing } = await admin
      .from("newsletter_subscribers")
      .select("id, subscribed_at, unsubscribed_at")
      .ilike("email", email)
      .maybeSingle<{
        id: string;
        subscribed_at: string | null;
        unsubscribed_at: string | null;
      }>();

    if (existing?.subscribed_at && !existing.unsubscribed_at) {
      return NextResponse.json({
        subscribed: true,
        confirm_url: null,
        message: "You're already subscribed — no further action needed.",
      });
    }

    const token = mintConfirmToken(email);
    const origin = new URL(request.url).origin;
    const confirmUrl = `${origin}/newsletter/confirm?token=${encodeURIComponent(token.plaintext)}`;

    if (existing) {
      // Refresh the token + clear any previous unsubscribed state (user
      // resubscribing). Keep the row's id + created_at.
      const { error } = await admin
        .from("newsletter_subscribers")
        .update({
          confirm_token: hashToken(token.plaintext),
          source,
          unsubscribed_at: null,
        })
        .eq("id", existing.id);
      if (error) {
        console.error("newsletter resubscribe update failed:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
      }
    } else {
      const { error } = await admin.from("newsletter_subscribers").insert({
        email,
        source,
        confirm_token: hashToken(token.plaintext),
      });
      if (error) {
        console.error("newsletter subscribe insert failed:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
      }
    }

    return NextResponse.json({
      subscribed: false,
      confirm_url: confirmUrl,
      message:
        "Check your inbox for a confirmation email. (Dev mode: confirm_url is included in this response.)",
    });
  } catch (err) {
    // Catch-all: most commonly fires when NEWSLETTER_TOKEN_SECRET is
    // missing / too short and mintConfirmToken throws. Without this,
    // Next.js returns a 500 with an HTML body, which the client cannot
    // parse and surfaces as the generic "Something went wrong" message.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("newsletter subscribe handler crashed:", err);
    return NextResponse.json(
      {
        error:
          "We couldn't add you right now — please try again in a moment.",
        // `detail` is safe to surface: it's the Error.message from our
        // own thrown errors (env-var missing, etc.), not a user secret.
        detail: message,
      },
      { status: 500 }
    );
  }
}

function normaliseEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return null;
  return trimmed;
}
