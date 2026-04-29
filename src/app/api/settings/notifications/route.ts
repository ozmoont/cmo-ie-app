/**
 * POST /api/settings/notifications
 *
 * Update the current user's notification preferences. v1 only has
 * notify_on_scan; future fields land here too (weekly_digest, etc.)
 * as additional optional booleans on the same body.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RequestBody {
  notify_on_scan?: boolean;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.notify_on_scan === "boolean") {
    updates.notify_on_scan = body.notify_on_scan;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update — provide at least one preference." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", user.id);
  if (error) {
    return NextResponse.json(
      { error: `Update failed: ${error.message}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
