import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const PathSchema = z.object({ id: z.string().uuid() });

// In the "sign-after-payment" mode we're shipping with for now, this
// route just advances the booking from pending_signature →
// pending_payment so /api/payments/charge will accept it. The actual
// BoldSign agreement is sent to the customer via email after their
// card is charged (see lib/boldsign/send-by-email.ts and the post-
// charge hook in /api/payments/charge). When we move back to the
// embedded signing flow this route will re-add the BoldSign status
// check.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = PathSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  const { id } = parsed.data;

  const supabase = createSupabaseServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", id)
    .single();
  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status === "pending_signature") {
    const { error: updErr } = await supabase
      .from("bookings")
      .update({ status: "pending_payment" })
      .eq("id", id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
