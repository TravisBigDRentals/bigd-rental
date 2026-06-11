import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { documentApi, extractBoldSignError } from "@/lib/boldsign/client";

export const runtime = "nodejs";

const PathSchema = z.object({ id: z.string().uuid() });

// Verifies the signature actually completed on BoldSign's side before
// transitioning the booking to pending_payment — never trust a client
// claim. The webhook does the heavy lifting of downloading and storing
// the signed PDF; this route is the synchronous "is it done yet?" check
// the embedded iframe relies on to advance the customer to payment.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = PathSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  const { id } = parsed.data;

  const supabase = createSupabaseServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, signature_request_id, status")
    .eq("id", id)
    .single();
  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (!booking.signature_request_id) {
    return NextResponse.json({ error: "No signature request on this booking" }, { status: 400 });
  }

  try {
    const propsResp = await documentApi().getProperties(booking.signature_request_id);
    // SDK typings claim Promise<DocumentProperties>; runtime returns the
    // wrapped response with .body holding the actual properties.
    const properties = (propsResp as unknown as { body?: { status?: string } }).body
      ?? (propsResp as unknown as { status?: string });
    const status = properties.status;
    // BoldSign DocumentStatus enum values: Sent, InProgress, Completed,
    // Declined, Revoked, Expired, ApprovalPending, etc. We advance once
    // the document reaches Completed.
    if (status !== "Completed") {
      return NextResponse.json(
        { error: `Signature not yet complete (status: ${status})` },
        { status: 400 },
      );
    }

    if (booking.status === "pending_signature") {
      await supabase
        .from("bookings")
        .update({
          status: "pending_payment",
          signature_completed_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: extractBoldSignError(err) }, { status: 502 });
  }
}
