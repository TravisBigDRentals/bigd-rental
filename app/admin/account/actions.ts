"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { error?: string; success?: true } | null;

export async function changePasswordAction(
  _prev: Result,
  formData: FormData,
): Promise<Result> {
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Passwords don't match" };
  }

  // The middleware already gates /admin/* behind an authenticated admin
  // session, so getUser() should always return a user here. If a malicious
  // user somehow bypassed the gate, updateUser still fails without a
  // valid session.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };

  return { success: true };
}
