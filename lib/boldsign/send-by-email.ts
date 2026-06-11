import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { documentApi, templateApi, templateId, extractBoldSignError } from "./client";
import { buildSenderFields, type CustomerLike, type EquipmentLike, type AddonLike } from "./merge-fields";

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function unwrapBody<T>(resp: unknown): T {
  if (resp && typeof resp === "object" && "body" in (resp as Record<string, unknown>)) {
    return (resp as { body: T }).body;
  }
  return resp as T;
}

// Module-level cache so we don't re-fetch the template per booking.
const templateFillableCache = new Map<string, Set<string>>();

async function getFillableSenderFieldIds(): Promise<Set<string>> {
  const cached = templateFillableCache.get(templateId());
  if (cached) return cached;

  const tmplResp = await templateApi().getProperties(templateId());
  const tmpl = unwrapBody<{
    roles?: Array<{
      name?: string | null;
      formFields?: Array<{ id?: string | null; fieldType?: string | null; type?: string | null }> | null;
    }>;
  }>(tmplResp);
  const senderRole = (tmpl.roles ?? []).find((r) => (r.name ?? "").toUpperCase() === "SENDER");
  const UNFILLABLE = ["signature", "initial", "formula", "drawing", "datesigned", "signeddate"];
  const ids = new Set(
    (senderRole?.formFields ?? [])
      .filter((f) => {
        const t = (f.fieldType ?? f.type ?? "").toString().toLowerCase();
        return !UNFILLABLE.some((s) => t.includes(s));
      })
      .map((f) => f.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  templateFillableCache.set(templateId(), ids);
  return ids;
}

// Sends the agreement to the customer via BoldSign's email mode (NOT
// embedded). Used after Square payment success while we're operating
// with signing-after-payment instead of signing-in-flow. The customer
// gets an email from BoldSign, clicks the link, signs on the hosted
// page. Webhook handles the rest — same downstream path as the
// embedded flow.
export async function sendAgreementByEmail(bookingId: string): Promise<
  { ok: true; documentId: string } | { ok: false; error: string }
> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id, start_date, end_date, dropoff_time, total_cents, signature_request_id,
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
    .eq("id", bookingId)
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Booking not found" };
  }

  // If a BoldSign document was already created (admin re-send, etc.),
  // don't create a second one.
  if (data.signature_request_id) {
    return { ok: true, documentId: data.signature_request_id };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const booking = data as any;
  const customer = unwrap<CustomerLike>(booking.customer);
  const equipment = unwrap<EquipmentLike>(booking.equipment);
  if (!customer || !equipment || !customer.email || !customer.first_name) {
    return { ok: false, error: "Booking missing customer or equipment info" };
  }
  const addons: AddonLike[] = (booking.booking_addons ?? [])
    .map((ba: { addon: AddonLike | AddonLike[] | null }) => unwrap(ba.addon))
    .filter((a: AddonLike | null): a is AddonLike => !!a);

  const customerForMerge: CustomerLike = {
    ...customer,
    drivers_license_number: booking.drivers_license_number ?? customer.drivers_license_number ?? null,
    drivers_license_expiry: booking.drivers_license_expiry ?? customer.drivers_license_expiry ?? null,
  };
  const candidate = buildSenderFields(customerForMerge, booking, equipment, addons);

  let senderFields = candidate;
  try {
    const fillableIds = await getFillableSenderFieldIds();
    senderFields = candidate.filter((f) => fillableIds.has(f.id));
  } catch (err) {
    console.error("[send-by-email] template fetch failed, sending unfiltered", {
      error: extractBoldSignError(err),
    });
  }

  // Template has a single SENDER role — the customer signs as SENDER.
  // disableEmails: false so BoldSign emails them the signing link.
  const sendForm = {
    roles: [
      {
        roleIndex: 1,
        signerRole: "SENDER",
        signerName: `${customer.first_name} ${customer.last_name}`.trim(),
        signerEmail: customer.email,
        signerType: "Signer",
      },
    ],
    title: `Rental Agreement — ${equipment.name}`,
    message: "Please review and sign your equipment rental agreement.",
    disableEmails: false,
  };

  let documentId: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendResp = await templateApi().sendUsingTemplate(templateId(), sendForm as any);
    const created = unwrapBody<{ documentId?: string }>(sendResp);
    documentId = created.documentId;
  } catch (err) {
    const msg = extractBoldSignError(err);
    console.error("[send-by-email] sendUsingTemplate failed", { bookingId, error: msg });
    return { ok: false, error: msg };
  }
  if (!documentId) return { ok: false, error: "BoldSign returned no document id" };

  await supabase
    .from("bookings")
    .update({ signature_request_id: documentId })
    .eq("id", bookingId);

  // Prefill SENDER's fields — auto-completes SENDER role so only the
  // renter needs to actually sign via the email link.
  if (senderFields.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await documentApi().prefillFields(documentId, { fields: senderFields } as any);
    } catch (err) {
      console.error("[send-by-email] prefillFields failed", {
        documentId,
        error: extractBoldSignError(err),
      });
      // Non-fatal — the email was already sent, customer can still
      // sign, the fields just won't be pre-populated.
    }
  }

  return { ok: true, documentId };
}
