import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function parseAdminEmails(): Set<string> {
  const raw = process.env.BIGDS_ADMIN_EMAIL ?? "";
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

const PathSchema = z.object({ id: z.string().uuid() });

// Used by the admin "Mark delivered" / "Mark returned" panels. Sets the
// timestamp and the photo-path array atomically. Passing `timestamp: null`
// clears the stage (undoes the marker). The client always sends the
// FULL photo_paths array (adds + removes are computed client-side from
// the original list).
const BodySchema = z.object({
  stage: z.enum(["delivered", "returned"]),
  timestamp: z.string().datetime().nullable(),
  photo_paths: z.array(z.string()).default([]),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  const adminEmails = parseAdminEmails();
  if (!user?.email || !adminEmails.has(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsedPath = PathSchema.safeParse(await params);
  if (!parsedPath.success) return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  const { id } = parsedPath.data;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const { stage, timestamp, photo_paths } = parsed.data;

  const timestampCol = stage === "delivered" ? "delivered_at" : "returned_at";
  const photosCol = stage === "delivered" ? "delivery_photo_urls" : "return_photo_urls";

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("bookings")
    .update({
      [timestampCol]: timestamp,
      [photosCol]: photo_paths,
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
