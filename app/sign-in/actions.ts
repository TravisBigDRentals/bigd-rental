"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { error?: string } | null;

export async function customerSignInAction(_prev: Result, formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/book");

  if (!email || !password) return { error: "Email and password are required" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(safeNext(next));
}

export async function customerSignUpAction(_prev: Result, formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/book");

  if (!email || !password) return { error: "Email and password are required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  // If Supabase Auth has email confirmation enabled, signUp returns a user
  // without a session — they need to click a verification link first.
  if (!data.session) {
    return {
      error: "Account created — check your email for a verification link, then sign in.",
    };
  }

  redirect(safeNext(next));
}

export async function customerSignOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

function safeNext(raw: string): string {
  // Only allow relative paths so the redirect can't escape the app.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/book";
  return raw;
}
