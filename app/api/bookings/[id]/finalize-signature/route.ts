import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { signatureRequestApi } from "@/lib/dropbox-sign/server";

export const runtime = "nodejs";

const PathSchema = z.object({ id: z.string().uuid() });

// Server-side verifies the signature actually completed before transitioning
// the booking to pending_payment — never trust a client claim. The async
// webhook will independently download and store the signed PDF.
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
    const sigApi = signatureRequestApi();
    const resp = await sigApi.signatureRequestGet(booking.signature_request_id);
    const signatures = resp.body.signatureRequest?.signatures ?? [];
    const allSigned = signatures.length > 0 && signatures.every((s) => s.statusCode === "signed");

    if (!allSigned) {
      return NextResponse.json({ error: "Signature not yet complete" }, { status: 400 });
    }

    // Idempotent — only advance if still in pending_signature
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
    const message = err instanceof Error ? err.message : "Dropbox Sign API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
