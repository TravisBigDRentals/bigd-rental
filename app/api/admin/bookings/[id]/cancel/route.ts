import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { refundSquarePaymentFull } from "@/lib/square/refund";
import { sendBookingCanceledEmail } from "@/lib/email/booking-canceled";

export const runtime = "nodejs";

function parseAdminEmails(): Set<string> {
  const raw = process.env.BIGDS_ADMIN_EMAIL ?? "";
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

type BookingRow = {
  id: string;
  status: string;
  total_cents: number;
  payment_intent_id: string | null;
  start_date: string;
  end_date: string;
  customer: { first_name: string; email: string } | { first_name: string; email: string }[] | null;
  equipment: { name: string } | { name: string }[] | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Admin gate — /admin/* middleware doesn't cover /api/admin/*.
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  const adminEmails = parseAdminEmails();
  if (!user?.email || !adminEmails.has(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: { reason?: unknown; issue_refund?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  // Default to issuing a refund whenever there's a payment_intent_id —
  // admin opts out via { issue_refund: false } if they want to handle
  // the refund out-of-band (dispute, damaged-on-return, etc.).
  const issueRefund = body.issue_refund !== false;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id, status, total_cents, payment_intent_id, start_date, end_date,
      customer:customer_id ( first_name, email ),
      equipment:equipment_id ( name )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Booking not found" }, { status: 404 });
  }
  const booking = data as unknown as BookingRow;
  if (booking.status === "canceled") {
    return NextResponse.json({ error: "Booking is already canceled" }, { status: 400 });
  }

  // Step 1: Square refund (only when there's a captured payment AND
  // admin didn't opt out). We do this BEFORE flipping status — if the
  // refund fails we leave the booking alone so the admin can retry
  // without the row being half-canceled.
  let refundId: string | null = null;
  let refundAmountCents: number | null = null;
  if (issueRefund && booking.payment_intent_id) {
    const result = await refundSquarePaymentFull({
      paymentId: booking.payment_intent_id,
      amountCents: booking.total_cents,
      bookingId: booking.id,
      reason: reason || "Booking canceled by Big D's Rental Co.",
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: `Refund failed: ${result.error}. Booking not canceled — try again or cancel without refund.` },
        { status: 502 },
      );
    }
    refundId = result.refundId;
    refundAmountCents = result.amountCents;
  }

  // Step 2: flip status + stamp metadata. Single UPDATE so it's atomic.
  // The double-booking trigger naturally frees the dates once status =
  // 'canceled' (it excludes canceled rows from the conflict check).
  const { error: updErr } = await supabase
    .from("bookings")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      canceled_reason: reason || null,
      refund_id: refundId,
      refund_amount_cents: refundAmountCents,
    })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: `Refund issued but DB update failed: ${updErr.message}` }, { status: 500 });
  }

  // Step 3: notify the customer. Failure is non-fatal for the cancel
  // itself — admin can re-send if needed.
  const customer = unwrap(booking.customer);
  const equipment = unwrap(booking.equipment);
  if (customer?.email) {
    await sendBookingCanceledEmail({
      bookingId: booking.id,
      customer,
      equipment,
      startDate: booking.start_date,
      endDate: booking.end_date,
      refundAmountCents,
      reason: reason || null,
    });
  }

  return NextResponse.json({
    ok: true,
    refund_id: refundId,
    refund_amount_cents: refundAmountCents,
  });
}
