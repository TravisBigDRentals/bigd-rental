import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getSquareClient, squareLocationId } from "@/lib/square/server";
import { sendBookingConfirmationEmailIfReady } from "@/lib/email/booking-confirmation";
import { findBlockingBookings } from "@/lib/bookings/availability";

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
      equipment_id, extra_equipment_id, start_date, end_date,
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

  // Pre-flight availability — block the charge if another customer
  // already paid (or is still inside their 15-min hold) for the same
  // dates while this booking sat in pending_payment. The DB trigger is
  // the final defense, but checking here means we never pull money for
  // a slot we can't actually deliver.
  try {
    const blockers = await findBlockingBookings({
      equipmentId: booking.equipment_id,
      startDate: booking.start_date,
      endDate: booking.end_date,
      excludeBookingId: booking_id,
    });
    if (booking.extra_equipment_id) {
      const extraBlockers = await findBlockingBookings({
        equipmentId: booking.extra_equipment_id,
        startDate: booking.start_date,
        endDate: booking.end_date,
        excludeBookingId: booking_id,
      });
      blockers.push(...extraBlockers);
    }
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error: "Those dates were just booked by someone else — please go back and pick new dates.",
          code: "DATES_UNAVAILABLE",
        },
        { status: 409 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Availability check failed";
    return NextResponse.json({ error: msg }, { status: 500 });
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

  // Embedded flow — the signed PDF has already been captured (Step 4
  // gates progression to Step 5 on the BoldSign webhook landing). So
  // by the time we reach this point post-charge, both legs of the
  // gate are satisfied and the confirmation email will fire.
  try {
    const emailRes = await sendBookingConfirmationEmailIfReady(booking_id);
    if (emailRes.sent) console.log(`[email] payment-success: sent ${emailRes.messageId}`);
    else console.log(`[email] payment-success: ${emailRes.reason}`);
  } catch (e) {
    console.error("[email] payment-success threw:", e);
  }

  return NextResponse.json({ booking_id, payment_id: paymentId, status: "booked" });
}
