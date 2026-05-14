import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getSquareClient, squareLocationId } from "@/lib/square/server";
import { sendBookingConfirmationEmail } from "@/lib/email/booking-confirmation";

export const runtime = "nodejs";

const ChargeInput = z.object({
  booking_id: z.string().uuid(),
  source_id: z.string().min(1),
});

type CustomerEmail = { email: string } | null;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ChargeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const { booking_id, source_id } = parsed.data;

  const supabase = createSupabaseServiceClient();
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select(`
      id, total_cents, status, payment_intent_id,
      customer:customer_id ( email )
    `)
    .eq("id", booking_id)
    .single();
  if (bErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.status === "booked") {
    return NextResponse.json({ booking_id, payment_id: booking.payment_intent_id, status: "booked" });
  }
  if (booking.status !== "pending_payment") {
    return NextResponse.json(
      { error: `Cannot charge a booking in status '${booking.status}'` },
      { status: 409 },
    );
  }

  const customerEmail = (booking.customer as unknown as CustomerEmail)?.email;
  const square = getSquareClient();
  let paymentId: string;

  try {
    const res = await square.payments.create({
      sourceId: source_id,
      idempotencyKey: booking_id,
      amountMoney: { amount: BigInt(booking.total_cents), currency: "CAD" },
      locationId: squareLocationId(),
      referenceId: booking_id,
      buyerEmailAddress: customerEmail,
      note: `Big D's Rental — booking ${booking_id}`,
    });

    const payment = res.payment;
    if (!payment || payment.status !== "COMPLETED") {
      return NextResponse.json(
        { error: `Payment not completed (status: ${payment?.status ?? "unknown"})` },
        { status: 402 },
      );
    }
    paymentId = payment.id!;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from("bookings")
    .update({
      payment_intent_id: paymentId,
      paid_at: new Date().toISOString(),
      status: "booked",
    })
    .eq("id", booking_id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Send confirmation email (don't block on failure)
  sendBookingConfirmationEmail({ bookingId: booking_id }).catch((e) =>
    console.error("Confirmation email failed:", e),
  );

  return NextResponse.json({ booking_id, payment_id: paymentId, status: "booked" });
}
