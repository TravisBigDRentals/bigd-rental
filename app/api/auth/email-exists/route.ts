import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ exists: false });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ exists: false });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("email_has_account", { check_email: email });
  // Fail open: if the function isn't present yet (migration 0014 not
  // applied) or anything else goes wrong, just say "no account" so the
  // UI silently skips the nudge instead of breaking.
  if (error) return NextResponse.json({ exists: false });
  return NextResponse.json({ exists: !!data });
}
