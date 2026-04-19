import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Mask a key for display: show first 8 and last 4 chars
function maskKey(key: string | null): string | null {
  if (!key || key.length < 16) return key ? "••••••••" : null;
  return `${key.slice(0, 8)}${"•".repeat(Math.min(key.length - 12, 20))}${key.slice(-4)}`;
}

// GET - return masked keys for display
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: "No organisation found" }, { status: 400 });
  }

  // Only owners and admins can view API keys
  if (!["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organisations")
    .select("plan, anthropic_api_key, openai_api_key, google_api_key, perplexity_api_key")
    .eq("id", profile.org_id)
    .single();

  if (!org) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  return NextResponse.json({
    plan: org.plan,
    keys: {
      anthropic: {
        masked: maskKey(org.anthropic_api_key),
        hasKey: !!org.anthropic_api_key,
      },
      openai: {
        masked: maskKey(org.openai_api_key),
        hasKey: !!org.openai_api_key,
      },
      google: {
        masked: maskKey(org.google_api_key),
        hasKey: !!org.google_api_key,
      },
      perplexity: {
        masked: maskKey(org.perplexity_api_key),
        hasKey: !!org.perplexity_api_key,
      },
    },
  });
}

// PATCH - update one or more API keys
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: "No organisation found" }, { status: 400 });
  }

  if (!["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const allowedFields = [
    "anthropic_api_key",
    "openai_api_key",
    "google_api_key",
    "perplexity_api_key",
  ];

  const updates: Record<string, string | null> = {};
  for (const field of allowedFields) {
    if (field in body) {
      // Allow setting to null (removing a key) or a string value
      const value = body[field];
      if (value === null || value === "") {
        updates[field] = null;
      } else if (typeof value === "string" && value.length > 10) {
        updates[field] = value;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid keys provided" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organisations")
    .update(updates)
    .eq("id", profile.org_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: Object.keys(updates) });
}
