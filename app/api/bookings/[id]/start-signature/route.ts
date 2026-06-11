import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  templateApi,
  documentApi,
  templateId,
  senderEmail,
  extractBoldSignError,
} from "@/lib/boldsign/client";
import { buildSenderFields, type CustomerLike, type EquipmentLike, type AddonLike } from "@/lib/boldsign/merge-fields";

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
  drivers_license_number: string | null;
  drivers_license_expiry: string | null;
  customer: CustomerLike | null;
  equipment: EquipmentLike | null;
  booking_addons: { addon: AddonLike | null }[] | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

// The boldsign SDK declares Promise<T> returns but the runtime hands
// back the underlying http response with .body holding T. Smooth over
// both shapes so we can read fields uniformly.
function unwrapBody<T>(resp: unknown): T {
  if (resp && typeof resp === "object" && "body" in (resp as Record<string, unknown>)) {
    return (resp as { body: T }).body;
  }
  return resp as T;
}

async function callbackUrl(bookingId: string): Promise<string> {
  // Where BoldSign redirects the iframe after the renter signs. We use a
  // tiny app route that postMessage's the parent and shows a "Done" UI.
  // NEXT_PUBLIC_SITE_URL is the canonical production URL when set;
  // otherwise we use the host header for the current deploy.
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return `${explicit.replace(/\/$/, "")}/book/${bookingId}/signed-callback`;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/book/${bookingId}/signed-callback`;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = PathSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  const { id } = parsed.data;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id, start_date, end_date, dropoff_time, total_cents, status, signature_request_id,
      drivers_license_number, drivers_license_expiry,
      customer:customer_id (
        first_name, last_name, business_name, email, phone,
        customer_address_line1, customer_address_line2, customer_city, customer_province, customer_postal_code,
        project_address_line1, project_address_line2, project_city, project_province, project_postal_code,
        drivers_license_number, drivers_license_expiry
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

  const docApi = documentApi();

  // If a BoldSign document was already created for this booking (e.g.,
  // customer refreshed Step 4), just fetch a fresh embedded sign URL for
  // it rather than creating a duplicate document.
  if (booking.signature_request_id) {
    try {
      const linkResp = await docApi.getEmbeddedSignLink(
        booking.signature_request_id,
        customer.email,
        undefined,
        undefined,
        undefined,
        await callbackUrl(booking.id),
      );
      const link = unwrapBody<{ signLink?: string }>(linkResp);
      const signUrl = link.signLink;
      if (signUrl) return NextResponse.json({ sign_url: signUrl });
    } catch {
      // fall through and create a fresh document
    }
  }

  // Booking row's DL snapshot wins over the customer row — it's the
  // value the customer entered at booking time, which is what the
  // signed agreement should reflect.
  const customerForMerge: CustomerLike = {
    ...customer,
    drivers_license_number: booking.drivers_license_number ?? customer.drivers_license_number ?? null,
    drivers_license_expiry: booking.drivers_license_expiry ?? customer.drivers_license_expiry ?? null,
  };
  const senderFields = buildSenderFields(customerForMerge, booking, equipment, addons);

  try {
    // BoldSign's signerType enum only allows Signer / Reviewer /
    // InPersonSigner — there is NO "Sender" value. The template's
    // SENDER role just means "fields pre-filled by the API caller".
    // We model that as a Signer role with all its fields pre-filled
    // via existingFormFields; BoldSign treats it as already done.
    const sendForm = {
      roles: [
        {
          roleIndex: 1,
          signerRole: "SENDER",
          signerName: "Big D's Rental Co.",
          signerEmail: senderEmail(),
          signerType: "Signer",
          existingFormFields: senderFields,
        },
        {
          roleIndex: 2,
          signerRole: "RENTER",
          signerName: `${customer.first_name} ${customer.last_name}`.trim(),
          signerEmail: customer.email,
          signerType: "Signer",
        },
      ],
      title: `Rental Agreement — ${equipment.name}`,
      message: "Please review and sign your equipment rental agreement.",
      // Embedded flow — we don't want BoldSign to email the customer; the
      // signing link is presented in our iframe.
      disableEmails: true,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendResp = await templateApi().sendUsingTemplate(templateId(), sendForm as any);
    const created = unwrapBody<{ documentId?: string }>(sendResp);
    const documentId = created.documentId;
    if (!documentId) {
      return NextResponse.json({ error: "BoldSign returned no document id" }, { status: 502 });
    }

    await supabase
      .from("bookings")
      .update({ signature_request_id: documentId })
      .eq("id", id);

    const linkResp = await docApi.getEmbeddedSignLink(
      documentId,
      customer.email,
      undefined,
      undefined,
      undefined,
      await callbackUrl(id),
    );
    const link = unwrapBody<{ signLink?: string }>(linkResp);
    const signUrl = link.signLink;
    if (!signUrl) return NextResponse.json({ error: "BoldSign returned no embedded sign URL" }, { status: 502 });

    return NextResponse.json({ sign_url: signUrl, document_id: documentId });
  } catch (err) {
    const msg = extractBoldSignError(err);
    console.error("[start-signature] BoldSign error", {
      bookingId: id,
      error: msg,
      raw: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
