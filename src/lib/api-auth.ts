/**
 * API-key authentication for the public REST API and MCP server.
 *
 * Flow:
 *   1. Extract `Authorization: Bearer <token>` from the request.
 *   2. Parse the prefix (first 8 chars of plaintext) and look up the row.
 *   3. Constant-time compare the full SHA-256 hash of the plaintext to
 *      `api_keys.token_hash`.
 *   4. Check `revoked_at IS NULL`.
 *   5. Check the requested scope is in `api_keys.scopes`.
 *   6. Tick the in-memory rate-limit counter and reject with 429 if over.
 *   7. Increment `last_used_at` (fire-and-forget).
 *   8. Return the resolved org_id + the api_key row.
 *
 * All lookups use the service-role client — the request hasn't
 * authenticated anything yet, so we can't use the user-authed Supabase
 * client. The token itself is the credential.
 *
 * Notes:
 *   - Token shape: `cmo_<32 hex chars>`. Prefix is the first 8 chars
 *     including the `cmo_` so the O(1) lookup key is intuitive. We
 *     generate tokens via `mintApiKey` below.
 *   - SHA-256 is plenty. We're not defending against offline brute force
 *     on a single hash — an attacker with the hash has already owned our
 *     DB and is at that point browsing `projects` directly.
 *   - Rate limit is in-memory per-process. A horizontally scaled deploy
 *     should swap this for Redis; single-node Vercel/Fly works for
 *     Phase 3. Keeps code trivially testable.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Scope catalogue ────────────────────────────────────────────────
// Keep in sync with docs/api and lib/api/catalogue.ts. Adding a new
// scope requires a codebase-wide grep to confirm no v1 route lacks a
// scope check — we refuse to serve routes with no scope.

export const API_SCOPES = [
  "visibility.read",
  "sources.read",
  "gaps.read",
  "prompts.read",
  "chats.read",
  "competitors.read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export interface ResolvedApiKey {
  id: string;
  org_id: string;
  name: string;
  scopes: ApiScope[];
}

// ── Rate limit ─────────────────────────────────────────────────────
// 60 requests / 60 seconds, keyed on api_key id. Single-process state
// — acceptable for the phase-3 single-node deploy. Swap in Redis when
// we go multi-region.

const WINDOW_MS = 60_000;
const WINDOW_LIMIT = 60;
const bucket = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(keyId: string): {
  ok: boolean;
  retry_after_s?: number;
} {
  const now = Date.now();
  const entry = bucket.get(keyId);
  if (!entry || entry.resetAt < now) {
    bucket.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (entry.count < WINDOW_LIMIT) {
    entry.count += 1;
    return { ok: true };
  }
  return { ok: false, retry_after_s: Math.ceil((entry.resetAt - now) / 1000) };
}

// Exposed for tests; not part of the public API surface.
export function _resetRateLimitForTests(): void {
  bucket.clear();
}

// ── Token minting ──────────────────────────────────────────────────

export interface MintedApiKey {
  plaintext: string;
  prefix: string;
  hash: string;
}

/**
 * Generate a fresh token. Plaintext is returned to the caller once; the
 * caller is responsible for storing the (prefix, hash) pair and showing
 * the plaintext to the user exactly once.
 */
export function mintApiKey(): MintedApiKey {
  const rand = randomBytes(24).toString("hex"); // 48 hex chars
  const plaintext = `cmo_${rand}`;
  const prefix = plaintext.slice(0, 8); // "cmo_XXXX"
  const hash = hashToken(plaintext);
  return { plaintext, prefix, hash };
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

// ── Authenticator ──────────────────────────────────────────────────

export interface AuthFailure {
  ok: false;
  response: NextResponse;
}
export interface AuthSuccess {
  ok: true;
  apiKey: ResolvedApiKey;
}
export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Authenticate an incoming request. Returns either a populated api_key
 * row (caller can proceed) or a pre-built error NextResponse (caller
 * should `return` it straight through).
 *
 * Usage:
 *   const auth = await requireApiKey(request, "visibility.read");
 *   if (!auth.ok) return auth.response;
 *   const { org_id } = auth.apiKey;
 */
export async function requireApiKey(
  request: Request,
  requiredScope: ApiScope
): Promise<AuthResult> {
  const header = request.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return fail(401, "missing_bearer_token", "Authorization header required");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token.startsWith("cmo_") || token.length < 16) {
    return fail(401, "malformed_token", "Token format invalid");
  }

  const prefix = token.slice(0, 8);
  const hash = hashToken(token);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id, org_id, name, scopes, token_hash, revoked_at")
    .eq("token_prefix", prefix)
    .is("revoked_at", null)
    .maybeSingle<{
      id: string;
      org_id: string;
      name: string;
      scopes: string[];
      token_hash: string;
      revoked_at: string | null;
    }>();

  if (error) {
    console.error("api-auth lookup failed:", error);
    return fail(500, "auth_internal", "Authentication lookup failed");
  }
  if (!data) {
    return fail(401, "unknown_token", "Token not recognised");
  }

  if (!constantTimeEqual(hash, data.token_hash)) {
    return fail(401, "unknown_token", "Token not recognised");
  }

  const scopes = (data.scopes as ApiScope[]) ?? [];
  if (!scopes.includes(requiredScope)) {
    return fail(403, "insufficient_scope", `Token missing scope: ${requiredScope}`);
  }

  const rate = checkRateLimit(data.id);
  if (!rate.ok) {
    return fail(
      429,
      "rate_limited",
      `Rate limit exceeded (${WINDOW_LIMIT}/min). Retry in ${rate.retry_after_s}s`,
      { "retry-after": String(rate.retry_after_s ?? 60) }
    );
  }

  // Fire-and-forget last_used_at bump — we don't want auth to wait on
  // a write round-trip. If it fails we just lose a timestamp update.
  void admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    ok: true,
    apiKey: {
      id: data.id,
      org_id: data.org_id,
      name: data.name,
      scopes,
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function fail(
  status: number,
  code: string,
  message: string,
  extraHeaders?: Record<string, string>
): AuthFailure {
  const res = NextResponse.json(
    { error: { code, message } },
    { status }
  );
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.headers.set(k, v);
    }
  }
  return { ok: false, response: res };
}

function constantTimeEqual(a: string, b: string): boolean {
  // Both must be the same length for timingSafeEqual; if they aren't,
  // we can short-circuit — but we still do a dummy compare to keep the
  // timing equivalent across this code path. Overkill for our threat
  // model but cheap.
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) {
    // Dummy compare against a same-length buffer.
    const pad = Buffer.alloc(ab.length || bb.length || 32);
    try {
      timingSafeEqual(pad, pad);
    } catch {
      // no-op
    }
    return false;
  }
  return timingSafeEqual(ab, bb);
}
