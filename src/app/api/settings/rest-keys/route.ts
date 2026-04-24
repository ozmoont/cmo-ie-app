/**
 * GET/POST /api/settings/rest-keys — in-app management of the public
 * REST API / MCP keys (migration 016). This is distinct from the
 * BYOK /api/settings/api-keys route, which manages customer-provided
 * model API keys.
 *
 * Flow:
 *   GET                — list the org's REST keys (no hashes, no plaintext).
 *   POST { name, scopes[] }
 *                      — mint a new key. Plaintext returned ONCE.
 *
 * Both paths use the user-authed Supabase client. Role gating: owner
 * or admin only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { API_SCOPES, mintApiKey, type ApiScope } from "@/lib/api-auth";

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
    .maybeSingle<{ org_id: string; role: string }>();
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No organisation" }, { status: 400 });
  }
  if (!["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select(
      "id, name, token_prefix, scopes, last_used_at, revoked_at, created_at"
    )
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("list rest keys failed:", error);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  return NextResponse.json({ keys: data ?? [] });
}

export async function POST(request: Request) {
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
    .maybeSingle<{ org_id: string; role: string }>();
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No organisation" }, { status: 400 });
  }
  if (!["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: { name?: string; scopes?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "`name` is required" },
      { status: 400 }
    );
  }

  const requested = Array.isArray(body.scopes) ? body.scopes : [];
  const valid: ApiScope[] = [];
  for (const s of requested) {
    if ((API_SCOPES as readonly string[]).includes(s)) {
      valid.push(s as ApiScope);
    } else {
      return NextResponse.json(
        { error: `Unknown scope: ${s}` },
        { status: 400 }
      );
    }
  }
  if (valid.length === 0) {
    return NextResponse.json(
      { error: "At least one scope is required" },
      { status: 400 }
    );
  }

  const token = mintApiKey();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .insert({
      org_id: profile.org_id,
      name,
      token_hash: token.hash,
      token_prefix: token.prefix,
      scopes: valid,
      created_by: user.id,
    })
    .select("id, name, token_prefix, scopes, created_at")
    .single();
  if (error) {
    console.error("create rest key failed:", error);
    return NextResponse.json(
      { error: "Failed to create key" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    key: data,
    plaintext: token.plaintext,
  });
}
