"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function login(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | never> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!email || !password) {
    return { error: "Invalid email or password." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic message — prevents user enumeration
    return { error: "Invalid email or password." };
  }

  redirect("/roster");
}

export async function signup(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | never> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const confirm = (formData.get("confirm") as string | null) ?? "";

  // Email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  // Password strength: at least 8 chars, contains a letter and a digit, max 72 (bcrypt limit)
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,72}$/.test(password)) {
    return {
      error:
        "Password must be 8–72 characters and include at least one letter and one number.",
    };
  }

  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/roster");
}

export async function logout(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
