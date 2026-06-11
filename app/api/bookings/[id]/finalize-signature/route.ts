import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const PathSchema = z.object({ id: z.string().uuid() });

// Embedded signing flow: the BoldSign webhook is the source of truth
// for "signed". When the renter finishes signing in the iframe, the
// signed-callback page postMessages the parent — but the webhook may
// land a beat later. This route is the bridge: we check our DB for the
// signed PDF that the webhook persists, and only flip the booking from
// pending_signature → pending_payment once we see it.
//
// Polled with retries from StepSign so the typical race (callback wins,
// webhook hasn't fired yet) resolves cleanly within ~1–2 seconds.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = PathSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  const { id } = parsed.data;

  const supabase = createSupabaseServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, status, signed_agreement_pdf_url")
    .eq("id", id)
    .single();
  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status === "pending_payment" || booking.status === "booked") {
    return NextResponse.json({ ok: true });
  }

  if (!booking.signed_agreement_pdf_url) {
    return NextResponse.json(
      { error: "Signature not yet confirmed — webhook hasn't landed" },
      { status: 409 },
    );
  }

  const { error: updErr } = await supabase
    .from("bookings")
    .update({ status: "pending_payment" })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
