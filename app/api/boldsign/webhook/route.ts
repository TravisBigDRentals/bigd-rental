import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { documentApi, extractBoldSignError } from "@/lib/boldsign/client";
import { sendBookingConfirmationEmailIfReady } from "@/lib/email/booking-confirmation";

export const runtime = "nodejs";

// BoldSign sends a JSON payload — the exact field path for the event
// name and document id has varied across releases. We handle both
// shapes we've seen (`event.eventType` + `data.documentId` and the
// flatter `eventType` + `documentId`). On a `Completed` event we
// download the signed PDF, store it in Supabase Storage, and trigger
// the customer + admin confirmation emails idempotently.

const COMPLETION_EVENTS = new Set([
  "Completed",
  "DocumentCompleted",
  "completed",
  "document.completed",
]);

const SIGNED_BUCKET = "signed-agreements";

type ExtractedEvent = { eventType: string; documentId: string | null };

function extractEvent(payload: unknown): ExtractedEvent {
  if (!payload || typeof payload !== "object") return { eventType: "", documentId: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as any;
  const eventType: string = p?.event?.eventType ?? p?.eventType ?? p?.event ?? p?.type ?? "";
  const documentId: string | null =
    p?.data?.documentId ?? p?.documentId ?? p?.document?.documentId ?? null;
  return { eventType: String(eventType), documentId };
}

async function handleCompleted(documentId: string): Promise<{ ok: true; sent: boolean } | { ok: false; error: string }> {
  const supabase = createSupabaseServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, signature_request_id, signed_agreement_pdf_url, signature_completed_at, status")
    .eq("signature_request_id", documentId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!booking) return { ok: false, error: `No booking matches BoldSign document ${documentId}` };

  // If we already downloaded the PDF for this document, just kick the
  // email dispatcher again (it's idempotent) and return.
  if (booking.signed_agreement_pdf_url) {
    const result = await sendBookingConfirmationEmailIfReady(booking.id);
    return { ok: true, sent: result.sent };
  }

  // Pull the signed PDF from BoldSign.
  let pdf: Buffer;
  try {
    const resp = await documentApi().downloadDocument(documentId);
    // SDK signature claims Promise<Buffer> but the actual return is the
    // wrapped response with .body. Handle both shapes.
    pdf = (resp as unknown as { body?: Buffer }).body ?? (resp as unknown as Buffer);
  } catch (err) {
    return { ok: false, error: extractBoldSignError(err) };
  }
  if (!pdf || pdf.length === 0) {
    return { ok: false, error: "BoldSign returned an empty PDF" };
  }

  // Store under signed-agreements/<bookingId>/agreement.pdf. We rely on
  // upsert so a re-fire of the webhook is harmless.
  const storagePath = `${booking.id}/agreement.pdf`;
  const { error: upErr } = await supabase.storage
    .from(SIGNED_BUCKET)
    .upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) return { ok: false, error: upErr.message };

  // The email dispatcher reads signed_agreement_pdf_url as a path
  // inside the signed-agreements bucket (not a public URL) — see
  // lib/email/booking-confirmation.ts. Store the path directly.
  await supabase
    .from("bookings")
    .update({
      signed_agreement_pdf_url: storagePath,
      signature_completed_at: booking.signature_completed_at ?? new Date().toISOString(),
      status: booking.status === "pending_signature" ? "pending_payment" : booking.status,
    })
    .eq("id", booking.id);

  const result = await sendBookingConfirmationEmailIfReady(booking.id);
  return { ok: true, sent: result.sent };
}

// BoldSign also pings this URL with an empty/minimal POST when you
// click "Verify" in the webhook setup dialog. Accept those (and any
// future keepalive variants) with 200 instead of failing them.
export async function GET() {
  return NextResponse.json({ ok: true, ready: true });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!raw || raw.trim().length === 0) {
    return NextResponse.json({ ok: true, verification: true });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Non-JSON body — likely a verification ping. Acknowledge so the
    // BoldSign dashboard doesn't refuse to save the webhook.
    return NextResponse.json({ ok: true, verification: true });
  }

  const { eventType, documentId } = extractEvent(parsed);
  if (!documentId) {
    return NextResponse.json({ ok: true, ignored: "no document id" });
  }

  if (!COMPLETION_EVENTS.has(eventType)) {
    return NextResponse.json({ ok: true, ignored: eventType || "unknown event" });
  }

  const result = await handleCompleted(documentId);
  if (!result.ok) {
    // Log + return 500 so BoldSign retries.
    console.error("[boldsign/webhook] completion failed", { documentId, error: result.error });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sent: result.sent });
}
