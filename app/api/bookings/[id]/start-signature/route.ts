import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  signatureRequestApi,
  embeddedApi,
  templateId,
  clientId,
} from "@/lib/dropbox-sign/server";
import { buildMergeFields, type CustomerLike, type EquipmentLike, type AddonLike } from "@/lib/dropbox-sign/merge-fields";

export const runtime = "nodejs";

const PathSchema = z.object({ id: z.string().uuid() });

type NestedBooking = {
  id: string;
  start_date: string;
  end_date: string;
  dropoff_time: string | null;
  total_cents: number;
  status: string;
  signature_request_id: string | null;
  customer: CustomerLike | null;
  equipment: EquipmentLike | null;
  booking_addons: { addon: AddonLike | null }[] | null;
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = PathSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  const { id } = parsed.data;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id, start_date, end_date, dropoff_time, total_cents, status, signature_request_id,
      customer:customer_id (
        first_name, last_name, business_name, email, phone,
        customer_address_line1, customer_address_line2, customer_city, customer_province, customer_postal_code,
        project_address_line1, project_address_line2, project_city, project_province, project_postal_code
      ),
      equipment:equipment_id ( name, serial, daily_rate_cents ),
      booking_addons ( addon:addon_id ( name, daily_rate_cents ) )
    `)
    .eq("id", id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Booking not found" }, { status: 404 });
  }
  const booking = data as unknown as NestedBooking;
  // Supabase nested FK selects sometimes return single-FK relations as an
  // array-of-one rather than a bare object. Defensive unwrap.
  function unwrap<T>(v: T | T[] | null | undefined): T | null {
    if (!v) return null;
    return Array.isArray(v) ? v[0] ?? null : v;
  }
  const customer = unwrap<CustomerLike>(booking.customer as CustomerLike | CustomerLike[] | null);
  const equipment = unwrap<EquipmentLike>(booking.equipment as EquipmentLike | EquipmentLike[] | null);
  if (!customer || !equipment) {
    return NextResponse.json({ error: "Booking is missing customer or equipment" }, { status: 500 });
  }
  if (!customer.email || !customer.first_name) {
    return NextResponse.json({ error: "Customer record is missing email or name" }, { status: 500 });
  }
  const addons: AddonLike[] = (booking.booking_addons ?? [])
    .map((ba) => unwrap<AddonLike>(ba.addon as AddonLike | AddonLike[] | null))
    .filter((a): a is AddonLike => !!a);

  const sigApi = signatureRequestApi();
  const embApi = embeddedApi();

  // If a signature request already exists for this booking, return a fresh
  // embedded sign URL for the same request (so refreshing Step 4 doesn't
  // create duplicate requests).
  if (booking.signature_request_id) {
    try {
      const existing = await sigApi.signatureRequestGet(booking.signature_request_id);
      const signatureId = existing.body.signatureRequest?.signatures?.[0]?.signatureId;
      if (signatureId) {
        const emb = await embApi.embeddedSignUrl(signatureId);
        const signUrl = emb.body.embedded?.signUrl;
        if (signUrl) return NextResponse.json({ sign_url: signUrl });
      }
    } catch {
      // fall through and create a fresh request
    }
  }

  const customFields = buildMergeFields(customer, booking, equipment, addons);

  try {
    const signerPayload = {
      role: "Renter",
      emailAddress: customer.email,
      name: `${customer.first_name} ${customer.last_name}`.trim(),
    };
    console.log("[start-signature] payload", {
      bookingId: id,
      templateId: templateId(),
      clientId: clientId(),
      signer: signerPayload,
      fieldCount: customFields.length,
    });
    const resp = await sigApi.signatureRequestCreateEmbeddedWithTemplate({
      clientId: clientId(),
      templateIds: [templateId()],
      subject: `Rental Agreement — ${equipment.name}`,
      message: "Please review and sign your equipment rental agreement.",
      signers: [signerPayload],
      customFields,
      testMode: true,
    });

    const sigReq = resp.body.signatureRequest;
    const requestId = sigReq?.signatureRequestId;
    const signatureId = sigReq?.signatures?.[0]?.signatureId;
    if (!requestId || !signatureId) {
      return NextResponse.json({ error: "Dropbox Sign returned no IDs" }, { status: 502 });
    }

    await supabase
      .from("bookings")
      .update({ signature_request_id: requestId })
      .eq("id", id);

    const emb = await embApi.embeddedSignUrl(signatureId);
    const signUrl = emb.body.embedded?.signUrl;
    if (!signUrl) return NextResponse.json({ error: "No embedded sign URL" }, { status: 502 });

    return NextResponse.json({ sign_url: signUrl });
  } catch (err) {
    return NextResponse.json({ error: extractError(err) }, { status: 502 });
  }
}

// The @dropbox/sign SDK throws HttpError instances whose top-level message
// is just "HTTP request failed". The actually useful detail (validation
// errors, missing fields, bad template ID, etc.) lives on `.body.error` or
// `.response.body`. Surface it.
function extractError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { body?: unknown; message?: unknown; statusCode?: unknown };
    if (e.body) {
      const body = e.body as { error?: { errorMsg?: string; errorName?: string } };
      const apiErr = body.error;
      if (apiErr?.errorMsg) {
        return apiErr.errorName ? `${apiErr.errorName}: ${apiErr.errorMsg}` : apiErr.errorMsg;
      }
      try { return JSON.stringify(e.body); } catch { /* fall through */ }
    }
    if (typeof e.message === "string") return e.message;
  }
  return "Dropbox Sign API error";
}
