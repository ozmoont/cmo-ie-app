"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // 1. Sign up the user
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

  // 2. Use admin client (service_role) to bypass RLS for org + profile creation.
  // This is the chicken-and-egg: RLS requires a profile to exist, but we need
  // an org before we can create a profile.
  const admin = createAdminClient();

  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const { data: org, error: orgError } = await admin
    .from("organisations")
    .insert({
      name: companyName,
      slug,
      plan: "trial",
    })
    .select()
    .single();

  if (orgError) {
    console.error("Org creation error:", orgError);
    redirect(
      `/signup?error=${encodeURIComponent("Account created but organisation setup failed. Please try again.")}`
    );
  }

  // 3. Create the profile linking user to org
  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    org_id: org.id,
    full_name: fullName,
    role: "owner",
  });

  if (profileError) {
    console.error("Profile creation error:", profileError);
  }

  // 4. Auto-confirm email in dev (Supabase requires email confirmation by default)
  await admin.auth.admin.updateUserById(authData.user.id, {
    email_confirm: true,
  });

  redirect("/onboarding");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
