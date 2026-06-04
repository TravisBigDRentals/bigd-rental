"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { error?: string; ok?: string } | null;

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

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
  const passwordConfirm = String(formData.get("password_confirm") ?? "");
  const next = String(formData.get("next") ?? "/book");

  if (!email || !password) return { error: "Email and password are required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (password !== passwordConfirm) return { error: "Passwords don't match — re-enter them in both fields" };

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

export async function requestPasswordResetAction(_prev: Result, formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Email is required" };

  const supabase = await createSupabaseServerClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/sign-in/reset`,
  });
  // Don't disclose whether the email exists — same response either way.
  // Real errors (rate limit, server) still bubble up.
  if (error && !/not.*found|user.*exist/i.test(error.message)) {
    return { error: error.message };
  }
  return { ok: "If that email has an account, a reset link is on the way. Check your inbox." };
}

export async function updatePasswordAction(_prev: Result, formData: FormData): Promise<Result> {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (password !== passwordConfirm) return { error: "Passwords don't match — re-enter them in both fields" };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Reset link expired or invalid. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/account/details");
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
