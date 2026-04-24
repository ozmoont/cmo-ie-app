// ── CMO.ie super-admin auth ──
// Simple env-allow-list based check. Used to gate /admin page + the
// /api/admin/ops/* endpoints.
//
// Why env-list not DB flag:
//   - Zero-migration, zero-UI to grant access. Change Vercel env var,
//     redeploy, done.
//   - Admin set changes ~once a quarter. DB flag + admin UI is
//     overkill at this stage.
//   - Moves cleanly to a DB flag later (add `is_super_admin` to
//     `profiles`, swap the check here, keep the call sites).

import { createClient } from "@/lib/supabase/server";
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
 * Pure predicate — exported for tests.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmailSet().has(email.toLowerCase());
}

/**
 * Does the (already-authenticated) user have super-admin privileges?
 */
export function isAdminUser(user: User | null | undefined): boolean {
  return isAdminEmail(user?.email);
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
  if (!isAdminUser(user))
    return { ok: false, status: 403, error: "Admin only" };
  return { ok: true, user };
}
