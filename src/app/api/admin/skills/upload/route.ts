/**
 * POST /api/admin/skills/upload
 *
 * Multipart upload for a Claude Skill `.zip`. Parses the archive,
 * extracts SKILL.md + optional plugin.json + reference docs, then
 * either:
 *   - creates a fresh `skills` row + first `skill_versions` row, OR
 *   - if the slug already exists, appends a new skill_versions row
 *     and bumps `skills.current_version_id` to it.
 *
 * Either way, returns the resulting skill + version row.
 *
 * Auth: requireAdmin (CMO_ADMIN_EMAILS env allow-list).
 *
 * Form fields:
 *   - file:        Blob — required, the .zip
 *   - changelog:   string — optional, free-form note explaining
 *                  what's new in this version
 *   - price_cents: integer — optional, public price for this skill in
 *                  EUR cents (e.g. 4900 for €49). Only takes effect
 *                  the first time a skill row is created.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSkillZip, LoaderError } from "@/lib/skills/loader";

// Larger body cap than the default for ZIP uploads. Next.js's default
// is 1 MB on the new App Router; we set per-route to 6 MB so a 5 MB
// skill ZIP plus form overhead fits comfortably.
export const config = {
  api: { bodyParser: { sizeLimit: "6mb" } },
};
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // FormData parsing. Next.js exposes the multipart parser on the
  // standard Request. The file field comes back as a Blob; we
  // .arrayBuffer() it to get a Buffer for jszip.
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    return NextResponse.json(
      {
        error: `Couldn't read form data: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing 'file' field — upload the skill .zip" },
      { status: 400 }
    );
  }

  const changelog =
    typeof form.get("changelog") === "string"
      ? (form.get("changelog") as string).trim()
      : null;

  const priceRaw = form.get("price_cents");
  let priceCents: number | null = null;
  if (typeof priceRaw === "string" && priceRaw.trim() !== "") {
    const n = Number(priceRaw);
    if (!Number.isInteger(n) || n < 0 || n > 100_000_00) {
      return NextResponse.json(
        { error: "price_cents must be an integer between 0 and 10,000,000" },
        { status: 400 }
      );
    }
    priceCents = n;
  }

  // Parse the ZIP.
  let parsed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = await parseSkillZip(buffer);
  } catch (err) {
    if (err instanceof LoaderError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: `Skill parse failed: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 500 }
    );
  }

  // Lookup or create the skill row by slug.
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("skills")
    .select("id, slug, name, status, current_version_id, price_eur_cents")
    .eq("slug", parsed.suggested_slug)
    .maybeSingle<{
      id: string;
      slug: string;
      name: string;
      status: string;
      current_version_id: string | null;
      price_eur_cents: number | null;
    }>();

  let skillId: string;
  let nextVersionNumber: number;

  if (existing) {
    skillId = existing.id;
    // Find the highest version_number so we can increment.
    const { data: maxRow } = await admin
      .from("skill_versions")
      .select("version_number")
      .eq("skill_id", skillId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle<{ version_number: number }>();
    nextVersionNumber = (maxRow?.version_number ?? 0) + 1;
  } else {
    // First upload — create the skill row. Status defaults to 'draft'
    // so it doesn't accidentally go live with no review. Admin
    // promotes to 'active' from the admin UI.
    const { data: created, error: createErr } = await admin
      .from("skills")
      .insert({
        slug: parsed.suggested_slug,
        name: parsed.suggested_name,
        description:
          (parsed.plugin_metadata?.description as string | undefined) ?? null,
        price_eur_cents: priceCents,
        status: "draft",
      })
      .select("id")
      .single<{ id: string }>();
    if (createErr || !created) {
      return NextResponse.json(
        {
          error: `Failed to create skill row: ${createErr?.message ?? "unknown"}`,
        },
        { status: 500 }
      );
    }
    skillId = created.id;
    nextVersionNumber = 1;
  }

  // Insert the new version.
  const { data: version, error: versionErr } = await admin
    .from("skill_versions")
    .insert({
      skill_id: skillId,
      version_number: nextVersionNumber,
      skill_md: parsed.skill_md,
      plugin_metadata: parsed.plugin_metadata,
      reference_files: parsed.reference_files,
      changelog,
      created_by: auth.user.id,
      source: "upload",
    })
    .select()
    .single<{
      id: string;
      version_number: number;
      created_at: string;
    }>();
  if (versionErr || !version) {
    return NextResponse.json(
      {
        error: `Failed to insert skill version: ${versionErr?.message ?? "unknown"}`,
      },
      { status: 500 }
    );
  }

  // Point the skill at this new version. Existing in-flight audits
  // already grabbed the previous version_id; new audits will use this.
  await admin
    .from("skills")
    .update({
      current_version_id: version.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", skillId);

  return NextResponse.json({
    ok: true,
    skill: {
      id: skillId,
      slug: parsed.suggested_slug,
      name: parsed.suggested_name,
      version_number: version.version_number,
      version_id: version.id,
    },
    extracted: {
      skill_md_chars: parsed.skill_md.length,
      reference_file_count: Object.keys(parsed.reference_files).length,
      reference_file_names: Object.keys(parsed.reference_files),
      source_version: parsed.source_version,
    },
  });
}
