/**
 * Next.js 16 proxy (formerly middleware).
 *
 * The "middleware" file convention was renamed to "proxy" in Next 16
 * — same behaviour, new name + new export. Renamed from
 * src/middleware.ts on the Phase 6 sweep so dev no longer logs the
 * "middleware file convention is deprecated" warning on every restart.
 *
 * Behaviour: refresh the Supabase session cookie on every matched
 * request so server components see an authenticated user without an
 * extra round-trip. The matcher excludes _next internals and static
 * assets — those don't need auth and the cookie work would burn cycles.
 */

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
