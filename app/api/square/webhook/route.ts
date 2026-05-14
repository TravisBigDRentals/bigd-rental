import { NextResponse } from "next/server";
import { WebhooksHelper } from "square";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Square webhook receiver. Authoritative for async events (refunds, disputes,
// payment status changes that happen after our sync charge response).
//
// Idempotency: each event has a UUID `event_id`; for now we just rely on the
// fact that DB writes are no-ops when the row is already in the right state.

export async function POST(req: Request) {
  const signatureHeader = req.headers.get("x-square-hmacsha256-signature");
  const rawBody = await req.text();

  if (!signatureHeader) {
    return NextResponse.json({ error: "Missing signature header" }, { status: 401 });
  }

  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!signatureKey) {
    console.error("SQUARE_WEBHOOK_SIGNATURE_KEY not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "";
  const notificationUrl = `${proto}://${host}/api/square/webhook`;

  const valid = await WebhooksHelper.verifySignature({
    requestBody: rawBody,
    signatureHeader,
    signatureKey,
    notificationUrl,
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { object?: { payment?: { id?: string; status?: string; reference_id?: string } } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.type === "payment.updated") {
    const payment = event.data?.object?.payment;
    const bookingId = payment?.reference_id;
    if (payment?.id && bookingId && payment.status === "COMPLETED") {
      const supabase = createSupabaseServiceClient();
      // Idempotent — only transitions pending_payment → booked
      await supabase
        .from("bookings")
        .update({
          payment_intent_id: payment.id,
          paid_at: new Date().toISOString(),
          status: "booked",
        })
        .eq("id", bookingId)
        .eq("status", "pending_payment");
    }
  }

  return NextResponse.json({ received: true });
}
