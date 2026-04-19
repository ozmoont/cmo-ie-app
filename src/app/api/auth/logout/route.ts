import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Redirect to login page
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"), {
    status: 302,
  });
}
