// ── CMO.ie super-admin auth ──
//
// Two layers, checked in order:
//
//   1. Env allow-list (CMO_ADMIN_EMAILS).
//      Bootstrap path. Lets the seed admin always log in even if the
//      DB has no profile row for them, or if the profiles table is
//      down. Never removed via the UI — it's the unkillable last
//      resort.
//
//   2. profiles.is_super_admin = TRUE.
//      DB-backed grant. Migrated in 026. Granted + revoked by an
//      existing admin via /admin/admins. Survives across deploys
//      without an env change.
//
// Why both:
//   - Env-only worked for one admin but doesn't scale to a 3-5
//     person team that wants to manage access without redeploys.
//   - DB-only would be hostile when the profiles table is empty or
//     when bootstrapping a fresh environment — nobody could log in.
//   - With both: env covers the seed/bootstrap case, DB covers
//     ongoing operations.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

/**
 * Parse CMO_ADMIN_EMAILS once per request. Trim + lowercase to avoid
 * surprises from copy-paste whitespace or case differences.
 */
function adminEmailSet(): Set<string> {
  const raw = process.env.CMO_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Pure predicate — exported for tests + the login redirect.
 *
 * Synchronous because login redirect runs before we have a DB
 * connection in scope. The login redirect is a hint, not a
 * permission gate — if it sends someone to /admin who isn't allowed,
 * the page itself will redirect them out.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmailSet().has(email.toLowerCase());
}

/**
 * Check whether the (already-authenticated) user has super-admin
 * privileges. Async because it may need to consult the profiles
 * table when the env list doesn't cover them.
 *
 * Order:
 *   1. Env list (cheap, no DB call).
 *   2. profiles.is_super_admin via service-role client.
 */
export async function isAdminUser(
  user: User | null | undefined
): Promise<boolean> {
  if (!user) return false;

  // Bootstrap path — env wins. Trim + lowercase already handled.
  if (isAdminEmail(user.email)) return true;

  // DB path — service-role client so we can read across orgs without
  // RLS getting in the way.
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle<{ is_super_admin: boolean }>();
    return Boolean(data?.is_super_admin);
  } catch (err) {
    // Conservative fallback — if the DB read fails, deny. Env-list
    // admins still get through above.
    console.warn("[admin-auth] profiles.is_super_admin lookup failed:", err);
    return false;
  }
}

/**
 * Convenience: fetch the current Supabase session + verify admin.
 * Returns `{ ok: true, user }` on success, or `{ ok: false, status }`
 * with a pre-baked HTTP status (`401` unauthed, `403` non-admin) so
 * API routes can return a consistent shape.
 */
export async function requireAdmin():
  Promise<
    | { ok: true; user: User }
    | { ok: false; status: 401 | 403; error: string }
  > {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  if (!(await isAdminUser(user)))
    return { ok: false, status: 403, error: "Admin only" };
  return { ok: true, user };
}
