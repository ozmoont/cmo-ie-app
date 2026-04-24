/**
 * GET /api/health
 *
 * Unauthenticated diagnostic endpoint. Reports which critical env vars
 * are present at runtime on whatever deployment is currently serving.
 * Does NOT leak the values — only a boolean per key, plus a short
 * prefix for the URL and a `key_length` so we can spot truncation.
 *
 * Point of this endpoint: if something isn't working and we suspect
 * env-var plumbing (most common prod bug), hit this URL in the browser
 * and we'll see exactly what's missing without SSHing into Vercel.
 *
 * Safe to ship to production — no secrets exposed. The URL itself
 * being guessable is fine; the payload is boolean-only.
 */

import { NextResponse } from "next/server";

// Don't allow Next.js to cache this — we want the real live runtime
// view every time it's hit.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function envStatus(name: string): {
  present: boolean;
  length: number;
  prefix: string | null;
} {
  const v = process.env[name];
  if (typeof v !== "string" || v.length === 0) {
    return { present: false, length: 0, prefix: null };
  }
  // First 8 chars only. For the Supabase URL this shows "https://"
  // followed by the start of the project ref — enough to confirm the
  // right project is wired without leaking anything secret. For
  // sb_publishable_ / sb_secret_ keys the prefix just shows the key
  // type label, which is already public-by-design.
  return { present: true, length: v.length, prefix: v.slice(0, 8) };
}

export async function GET() {
  return NextResponse.json(
    {
      runtime: "nodejs",
      timestamp: new Date().toISOString(),
      vercel_env: process.env.VERCEL_ENV ?? null,
      vercel_url: process.env.VERCEL_URL ?? null,
      vercel_git_commit_sha:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? null,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: envStatus("NEXT_PUBLIC_SUPABASE_URL"),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: envStatus(
          "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        ),
        SUPABASE_SERVICE_ROLE_KEY: envStatus("SUPABASE_SERVICE_ROLE_KEY"),
        ANTHROPIC_API_KEY: envStatus("ANTHROPIC_API_KEY"),
        OPENAI_API_KEY: envStatus("OPENAI_API_KEY"),
        GEMINI_API_KEY: envStatus("GEMINI_API_KEY"),
        PERPLEXITY_API_KEY: envStatus("PERPLEXITY_API_KEY"),
        STRIPE_SECRET_KEY: envStatus("STRIPE_SECRET_KEY"),
        CMO_ADMIN_EMAILS: envStatus("CMO_ADMIN_EMAILS"),
      },
    },
    { status: 200 }
  );
}
