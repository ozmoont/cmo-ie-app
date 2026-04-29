/**
 * scripts/list-admins.ts
 *
 * Print every CMO.ie super-admin from both sources:
 *   • CMO_ADMIN_EMAILS env var (bootstrap allow-list).
 *   • profiles.is_super_admin = TRUE (DB-backed grants from Phase 7).
 *
 * Usage (from repo root):
 *   npx tsx scripts/list-admins.ts
 *
 * Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * CMO_ADMIN_EMAILS. Run after `vercel env pull .env.local` if you
 * want production values locally.
 */

import { createAdminClient } from "@/lib/supabase/admin";

interface ProfileRow {
  id: string;
  full_name: string | null;
  super_admin_granted_at: string | null;
  super_admin_granted_by: string | null;
}

async function main() {
  console.log("CMO.ie super-admins\n");

  // ── Env list ────────────────────────────────────────────────
  const envEmails = (process.env.CMO_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  console.log(`── env (CMO_ADMIN_EMAILS) — ${envEmails.length} ──`);
  if (envEmails.length === 0) {
    console.log("  (none — CMO_ADMIN_EMAILS unset in this shell)");
  } else {
    for (const e of envEmails) console.log(`  ${e}`);
  }

  // ── DB list ─────────────────────────────────────────────────
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("profiles")
    .select(
      "id, full_name, super_admin_granted_at, super_admin_granted_by"
    )
    .eq("is_super_admin", true)
    .returns<ProfileRow[]>();

  console.log(`\n── db (profiles.is_super_admin) ──`);

  if (error) {
    console.log(`  query failed: ${error.message}`);
    console.log(
      `  (most likely cause: migration 026 hasn't been applied yet — run \`npx supabase db push\`)`
    );
    return;
  }

  if (!rows || rows.length === 0) {
    console.log("  (none yet — grant via /admin/admins)");
    return;
  }

  // Resolve emails for the flagged profiles + the granters.
  const { data: usersPage } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const byId = new Map((usersPage?.users ?? []).map((u) => [u.id, u]));

  console.log(`  ${rows.length} entries:`);
  for (const r of rows) {
    const user = byId.get(r.id);
    const granter = r.super_admin_granted_by
      ? byId.get(r.super_admin_granted_by)
      : null;
    const grantedAt = r.super_admin_granted_at
      ? new Date(r.super_admin_granted_at).toISOString().slice(0, 10)
      : "?";
    console.log(
      `  ${user?.email ?? r.id} — granted ${grantedAt}${
        granter?.email ? ` by ${granter.email}` : ""
      }${r.full_name ? ` (${r.full_name})` : ""}`
    );
  }
}

main().catch((err) => {
  console.error("list-admins crashed:", err);
  process.exit(1);
});
