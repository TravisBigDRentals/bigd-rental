import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { signatureRequestApi } from "@/lib/dropbox-sign/server";
import { sendBookingConfirmationEmailIfReady } from "@/lib/email/booking-confirmation";

export const runtime = "nodejs";

// Dropbox Sign sends webhooks as multipart/form-data with a single field "json"
// containing the event payload. The body must be parsed raw (NOT via
// req.json()) to validate the HMAC signature. They require the response body
// to be the literal string "Hello API Event Received" — a 200 is not enough.

const ACK_BODY = "Hello API Event Received";
const ack = () => new Response(ACK_BODY, { status: 200, headers: { "Content-Type": "text/plain" } });
const bad = (msg: string, status = 400) => new Response(msg, { status });

export async function POST(req: Request) {
  const apiKey = process.env.HELLOSIGN_API_KEY;
  if (!apiKey) return bad("missing API key", 500);

  let payload: { event?: { event_time?: string; event_type?: string; event_hash?: string }; signature_request?: { signature_request_id?: string } };
  try {
    const formData = await req.formData();
    const json = formData.get("json");
    if (typeof json !== "string") return bad("missing json field");
    payload = JSON.parse(json);
  } catch {
    return bad("invalid body");
  }

  const event = payload.event;
  if (!event?.event_time || !event.event_type || !event.event_hash) {
    return bad("missing event fields");
  }

  // HMAC-SHA256(api_key, event_time + event_type) === event_hash
  const computed = createHmac("sha256", apiKey)
    .update(event.event_time + event.event_type)
    .digest("hex");
  const sentBuf = Buffer.from(event.event_hash, "hex");
  const computedBuf = Buffer.from(computed, "hex");
  if (sentBuf.length !== computedBuf.length || !timingSafeEqual(sentBuf, computedBuf)) {
    return bad("invalid signature", 401);
  }

  // Only act on signed events; ack everything else (Dropbox Sign needs a 200
  // response to mark the webhook healthy).
  if (event.event_type !== "signature_request_signed" && event.event_type !== "signature_request_all_signed") {
    return ack();
  }

  const sigRequestId = payload.signature_request?.signature_request_id;
  if (!sigRequestId) return ack();

  const supabase = createSupabaseServiceClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, signed_agreement_pdf_url")
    .eq("signature_request_id", sigRequestId)
    .single();
  if (!booking) return ack(); // no matching booking; nothing to do

  // Skip re-download if we already have a stored PDF for this booking
  if (booking.signed_agreement_pdf_url) return ack();

  try {
    const sigApi = signatureRequestApi();
    const fileResp = await sigApi.signatureRequestFiles(sigRequestId, "pdf");
    // SDK returns a Buffer-like in `body`; cast through ArrayBufferLike for the storage SDK.
    const fileBody = fileResp.body as unknown as ArrayBuffer | Blob | Buffer;
    const buffer = Buffer.isBuffer(fileBody) ? fileBody : Buffer.from(fileBody as ArrayBuffer);

    const path = `${booking.id}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("signed-agreements")
      .upload(path, buffer, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      // Don't fail the webhook — we'll retry next event. Just log via response.
      return bad(`storage upload failed: ${upErr.message}`, 500);
    }

    await supabase
      .from("bookings")
      .update({
        signed_agreement_pdf_url: path,
        signature_completed_at: new Date().toISOString(),
      })
      .eq("id", booking.id);

    // If payment already happened by the time the signed PDF lands, this
    // dispatch sends the confirmation email. Idempotent vs. the matching
    // call in /api/payments/charge — whichever event finishes last sends.
    const emailRes = await sendBookingConfirmationEmailIfReady(booking.id);
    if (emailRes.sent) console.log(`[email] sign-webhook: sent ${emailRes.messageId}`);
    else console.log(`[email] sign-webhook: ${emailRes.reason}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return bad(`download/store failed: ${msg}`, 500);
  }

  return ack();
}
