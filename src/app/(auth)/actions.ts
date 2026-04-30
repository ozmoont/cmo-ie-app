"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin-auth";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // CMO.ie super-admins (email in CMO_ADMIN_EMAILS) land on /admin
  // instead of the customer dashboard. They can still navigate to
  // /dashboard manually if they want to use the product as a customer
  // (eating dogfood); this just changes the default landing.
  if (isAdminEmail(email)) {
    redirect("/admin");
  }

  // Check if user has any projects
  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .limit(1);

  if (!projects || projects.length === 0) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const companyName = formData.get("companyName") as string;

  // 1. Sign up the user in auth.users.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        company_name: companyName,
      },
    },
  });

  if (authError) {
    redirect(`/signup?error=${encodeURIComponent(authError.message)}`);
  }

  if (!authData.user) {
    redirect(
      `/signup?error=${encodeURIComponent("Signup failed. Please try again.")}`
    );
  }

  // 2. Use admin client (service_role) to bypass RLS for org + profile
  // creation. Chicken-and-egg: RLS requires a profile to exist, but we
  // need an org before we can create a profile — so we write both via
  // service role and let the normal RLS apply on subsequent reads.
  const admin = createAdminClient();
  const userId = authData.user.id;

  // Slug collision guard. `organisations.slug` is unique, so two
  // signups with the same company name (e.g. both "Howl") would blow
  // up the second one. Append a short fragment of the user_id so each
  // signup is deterministic *and* unique — the user never sees the slug.
  const baseSlug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const slug = baseSlug
    ? `${baseSlug}-${userId.slice(0, 8)}`
    : `org-${userId.slice(0, 8)}`;

  const { data: org, error: orgError } = await admin
    .from("organisations")
    .insert({
      name: companyName,
      slug,
      plan: "trial",
    })
    .select()
    .single();

  if (orgError || !org) {
    console.error("Org creation error:", orgError);
    // Roll the auth user back so the customer isn't stranded — they
    // can safely try signup again with the same email. Service role
    // lets us do this; we tolerate failure here because the alternative
    // (leaving a stranded auth row) is worse.
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch (deleteErr) {
      console.error("Stranded auth cleanup failed:", deleteErr);
    }
    redirect(
      `/signup?error=${encodeURIComponent(
        `Account setup failed: ${orgError?.message ?? "unknown error"}. Try signing up again.`
      )}`
    );
  }

  // 3. Create the profile linking user to org.
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    org_id: org.id,
    full_name: fullName,
    role: "owner",
  });

  if (profileError) {
    // Fail loud — a stranded auth.users row with no profile puts the
    // user in an unrecoverable "No organisation found" loop on every
    // subsequent request. Roll back auth + org so they can retry.
    console.error("Profile creation error:", profileError);
    try {
      await admin.from("organisations").delete().eq("id", org.id);
      await admin.auth.admin.deleteUser(userId);
    } catch (cleanupErr) {
      console.error("Post-profile cleanup failed:", cleanupErr);
    }
    redirect(
      `/signup?error=${encodeURIComponent(
        `Profile setup failed: ${profileError.message}. Try again.`
      )}`
    );
  }

  // 4. Auto-confirm email (dev-mode convenience; flip off when SMTP is
  // wired and we want a real confirmation flow).
  await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });

  redirect("/onboarding");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Request a password-reset email.
 *
 * Supabase emails the user a magic link of the form
 *   https://{site}/auth/callback?code=...&next=/reset-password
 * Our existing /auth/callback route exchanges the code for a session
 * and redirects to /reset-password where the user picks a new
 * password.
 *
 * We always redirect back to /forgot-password?status=sent regardless
 * of whether the email exists in our DB — exposing "no such user"
 * leaks account-enumeration; the user can't tell whether the email
 * was real, only that they should check their inbox.
 */
export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const email = (formData.get("email") as string)?.trim();
  if (!email || !email.includes("@")) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "Please enter a valid email address."
      )}`
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://www.cmo.ie";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error) {
    // Log but don't surface to user — see docstring on enumeration.
    console.error("resetPasswordForEmail error:", error);
  }
  redirect("/forgot-password?status=sent");
}

/**
 * Update the signed-in user's password to a new value. Called from
 * /reset-password after the recovery link has been exchanged for a
 * session. If no session is present, sends them back to /login.
 */
export async function setNewPassword(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?error=session_expired");
  }

  const password = (formData.get("password") as string) ?? "";
  if (password.length < 8) {
    redirect(
      `/reset-password?error=${encodeURIComponent(
        "Password must be at least 8 characters."
      )}`
    );
  }
  const confirm = (formData.get("confirm") as string) ?? "";
  if (password !== confirm) {
    redirect(
      `/reset-password?error=${encodeURIComponent("Passwords don't match.")}`
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/dashboard?password_reset=ok");
}
