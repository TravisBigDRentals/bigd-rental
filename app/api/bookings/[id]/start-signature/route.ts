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

// Module-scoped cache of the SENDER role's fillable field IDs, keyed by
// template id. Lives for the lifetime of the serverless instance —
// templates don't change often, so this is fine and cuts a BoldSign
// call per booking which mattered when we hit the 50/hour quota
// during testing.
const templateFillableCache = new Map<string, Set<string>>();

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
  const candidateSenderFields = buildSenderFields(customerForMerge, booking, equipment, addons);

  // Fetch the template's actual field list. BoldSign rejects the send
  // with "field count exceeds existing field count" if we hand it any
  // id that isn't on the template, so we filter our merge payload down
  // to exactly the ids the template has on the SENDER role. Result is
  // cached in module scope (per serverless instance) so we don't burn
  // BoldSign's 50/hour quota re-fetching this every booking.
  let senderFields: typeof candidateSenderFields = candidateSenderFields;
  try {
      const tmpl = unwrapBody<{
        roles?: Array<{
          name?: string | null;
          formFields?: Array<{ id?: string | null; fieldType?: string | null; type?: string | null }> | null;
        }>;
      }>(tmplResp);
      const senderRole = (tmpl.roles ?? []).find(
        (r) => (r.name ?? "").toUpperCase() === "SENDER",
      );
      // Substring matching against the field type — BoldSign uses
      // variations like "DateSigned", "DateSignedField", "Signature",
      // "SignatureField", etc. Case-insensitive contains check covers
      // them all.
      const UNFILLABLE_SUBSTRINGS = [
        "signature",
        "initial",
        "formula",
        "drawing",
        "datesigned",
        "signeddate",
      ];
      const senderTemplateFields = senderRole?.formFields ?? [];
      console.log("[start-signature] template SENDER fields", senderTemplateFields.map((f) => ({
        id: f.id,
        fieldType: f.fieldType,
        type: f.type,
      })));
      fillableIds = new Set(
        senderTemplateFields
          .filter((f) => {
            const t = (f.fieldType ?? f.type ?? "").toString().toLowerCase();
            return !UNFILLABLE_SUBSTRINGS.some((s) => t.includes(s));
          })
          .map((f) => f.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
      templateFillableCache.set(templateId(), fillableIds);
    }
    senderFields = candidateSenderFields.filter((f) => fillableIds.has(f.id));
  } catch (err) {
    console.error("[start-signature] template fetch failed", {
      error: extractBoldSignError(err),
    });
    // Fall through and try sending everything anyway; if BoldSign 400s
    // we surface the error to the customer like before.
  }

  try {
    // BoldSign's signerType enum only allows Signer / Reviewer /
    // InPersonSigner — there is NO "Sender" value. The template's
    // SENDER role just means "fields pre-filled by the API caller".
    // We model that as a Signer role with all its fields pre-filled
    // via existingFormFields; BoldSign treats it as already done.
    // Two-step pattern that BoldSign actually supports for prefilled
    // sender-role fields:
    //   1) Send the template with both roles BUT pass no existingFormFields
    //      on SENDER. Sender role still exists on the document with empty
    //      fields BoldSign expects someone to fill.
    //   2) Immediately call documentApi.prefillFields(...) with SENDER's
    //      values. This both populates the textboxes AND auto-completes
    //      the SENDER role, so RENTER's embedded sign link no longer hits
    //      the "other signers must complete first" guard.
    const sendForm = {
      roles: [
        {
          roleIndex: 1,
          signerRole: "SENDER",
          signerName: "Big D's Rental Co.",
          signerEmail: senderEmail(),
          signerType: "Signer",
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

    // Step 2: prefill SENDER's fields — auto-completes the SENDER role.
    if (senderFields.length > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await docApi.prefillFields(documentId, { fields: senderFields } as any);
      } catch (err) {
        console.error("[start-signature] prefillFields failed", {
          documentId,
          error: extractBoldSignError(err),
        });
        return NextResponse.json(
          { error: `Failed to prefill agreement: ${extractBoldSignError(err)}` },
          { status: 502 },
        );
      }
    }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    console.error("[start-signature] BoldSign error", {
      bookingId: id,
      message: msg,
      status: e?.response?.status,
      data: e?.response?.data,
      headers: e?.response?.headers,
      sentFieldIds: senderFields.map((f) => f.id),
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
