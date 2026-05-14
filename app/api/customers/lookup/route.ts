import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const Q = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).max(40).optional(),
}).refine((v) => v.email || v.phone, { message: "email or phone required" });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Q.safeParse({
    email: url.searchParams.get("email") ?? undefined,
    phone: url.searchParams.get("phone") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const { email, phone } = parsed.data;

  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("customers")
    .select(
      "first_name, last_name, email, phone, project_address_line1, project_address_line2, project_city, project_province, project_postal_code",
    )
    .limit(1);
  if (email) query = query.eq("email", email);
  else if (phone) query = query.eq("phone", phone);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ found: false });
  }
  return NextResponse.json({ found: true, customer: data[0] });
}
