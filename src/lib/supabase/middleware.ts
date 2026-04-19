import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Safety check - if env vars are missing, let requests through
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    console.warn("Supabase env vars not set - middleware passing through");
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refresh the auth token
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    // API routes are never redirected by middleware
    if (pathname.startsWith("/api/")) {
      return supabaseResponse;
    }

    // Root path (landing page) is always accessible
    if (pathname === "/") {
      return supabaseResponse;
    }

    // Public paths: login, signup, auth callback
    const publicPaths = ["/login", "/signup", "/auth/callback"];
    const isPublicPath = publicPaths.some((path) => pathname === path);

    // Protected paths that require authentication
    const protectedPaths = ["/dashboard", "/projects", "/settings", "/onboarding"];
    const isProtectedPath = protectedPaths.some((path) =>
      pathname === path || pathname.startsWith(path + "/")
    );

    // Redirect unauthenticated users away from protected paths
    if (!user && isProtectedPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Redirect authenticated users away from auth pages to dashboard
    if (user && isPublicPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (error) {
    console.error("Middleware error:", error);
    // On error, let the request through rather than blocking
    return NextResponse.next({ request });
  }
}
