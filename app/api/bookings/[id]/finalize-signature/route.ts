import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const PathSchema = z.object({ id: z.string().uuid() });

// Confirms the signature actually completed before transitioning the
// booking to pending_payment — never trust a client claim. We rely on
// the BoldSign webhook to set bookings.signature_completed_at and/or
// signed_agreement_pdf_url, then this endpoint just checks our own DB
// column. That avoids burning BoldSign API calls on every retry from
// the StepSign poll loop (their rate limit is 50/hr).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = PathSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  const { id } = parsed.data;

  const supabase = createSupabaseServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, signature_request_id, status, signature_completed_at, signed_agreement_pdf_url")
    .eq("id", id)
    .single();
  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (!booking.signature_request_id) {
    return NextResponse.json({ error: "No signature request on this booking" }, { status: 400 });
  }

  // Webhook hasn't fired yet — client should retry. Returning 400 (not
  // 200) because the client's poll loop expects 200 = done, anything
  // else = keep waiting.
  if (!booking.signature_completed_at && !booking.signed_agreement_pdf_url) {
    return NextResponse.json(
      { error: "Signature not yet complete — waiting for webhook" },
      { status: 400 },
    );
  }

  // Defensive: if webhook already advanced the status, leave it. Only
  // flip from pending_signature → pending_payment here.
  if (booking.status === "pending_signature") {
    await supabase
      .from("bookings")
      .update({
        status: "pending_payment",
        signature_completed_at: booking.signature_completed_at ?? new Date().toISOString(),
      })
      .eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
