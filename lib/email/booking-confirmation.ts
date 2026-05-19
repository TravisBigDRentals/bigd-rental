import "server-only";
import { Resend } from "resend";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatCents } from "@/lib/pricing";

type Customer = {
  first_name: string;
  last_name: string;
  email: string;
  project_address_line1: string | null;
  project_city: string | null;
  project_province: string | null;
  project_postal_code: string | null;
};

type Equipment = { name: string; serial: string };

type BookingRow = {
  id: string;
  start_date: string;
  end_date: string;
  dropoff_time: string | null;
  total_cents: number;
  status: string;
  signed_agreement_pdf_url: string | null;
  email_sent_at: string | null;
  customer: Customer | Customer[] | null;
  equipment: Equipment | Equipment[] | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

// Dispatcher — call from both the payment-success path and the Dropbox Sign
// webhook. The second event to land actually sends; the first one no-ops.
// Idempotent via the `email_sent_at` column (atomic conditional UPDATE
// guarantees no double-send even under race).
export async function sendBookingConfirmationEmailIfReady(bookingId: string): Promise<
  { sent: true; messageId?: string } | { sent: false; reason: string }
> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id, start_date, end_date, dropoff_time, total_cents, status,
      signed_agreement_pdf_url, email_sent_at,
      equipment:equipment_id ( name, serial ),
      customer:customer_id ( first_name, last_name, email, project_address_line1, project_city, project_province, project_postal_code )
    `)
    .eq("id", bookingId)
    .single();
  if (error || !data) return { sent: false, reason: `booking not found: ${error?.message ?? "no row"}` };
  const booking = data as unknown as BookingRow;

  if (booking.email_sent_at) return { sent: false, reason: "already sent" };
  if (booking.status !== "booked") return { sent: false, reason: `status is ${booking.status}, waiting for payment` };
  if (!booking.signed_agreement_pdf_url) return { sent: false, reason: "waiting for signed PDF" };

  const customer = unwrap(booking.customer);
  const equipment = unwrap(booking.equipment);
  if (!customer || !equipment) return { sent: false, reason: "booking missing customer or equipment" };

  // Race-safe claim: atomic UPDATE that only succeeds if email_sent_at is
  // still null. If someone else got there first, this affects 0 rows and we
  // bail out.
  const { data: claimed, error: claimErr } = await supabase
    .from("bookings")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", bookingId)
    .is("email_sent_at", null)
    .select("id");
  if (claimErr) return { sent: false, reason: `claim failed: ${claimErr.message}` };
  if (!claimed || claimed.length === 0) return { sent: false, reason: "already sent (raced)" };

  // Download the signed PDF as a Buffer for attachment.
  const { data: pdfBlob, error: dlErr } = await supabase.storage
    .from("signed-agreements")
    .download(booking.signed_agreement_pdf_url);
  if (dlErr || !pdfBlob) {
    // Unclaim — clear email_sent_at so the next event retries.
    await supabase.from("bookings").update({ email_sent_at: null }).eq("id", bookingId);
    return { sent: false, reason: `pdf download failed: ${dlErr?.message ?? "no blob"}` };
  }
  const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const adminCc = process.env.BIGDS_ADMIN_EMAIL || undefined;

  const addressLine = [customer.project_address_line1, customer.project_city, customer.project_province, customer.project_postal_code]
    .filter(Boolean)
    .join(", ");

  const result = await resend.emails.send({
    from: `Big D's Rental <${from}>`,
    to: customer.email,
    cc: adminCc,
    subject: `Booking confirmed — ${equipment.name} (${booking.start_date})`,
    html: htmlBody({
      firstName: customer.first_name,
      equipmentName: equipment.name,
      equipmentSerial: equipment.serial,
      startDate: booking.start_date,
      endDate: booking.end_date,
      dropoffTime: booking.dropoff_time,
      addressLine,
      totalCents: booking.total_cents,
      bookingId: booking.id,
    }),
    attachments: [
      { filename: `rental-agreement-${booking.id}.pdf`, content: pdfBuffer },
    ],
  });

  if (result.error) {
    // Roll back the claim so a future retry can succeed.
    await supabase.from("bookings").update({ email_sent_at: null }).eq("id", bookingId);
    return { sent: false, reason: `resend send failed: ${result.error.message}` };
  }

  return { sent: true, messageId: result.data?.id };
}

function htmlBody(v: {
  firstName: string;
  equipmentName: string;
  equipmentSerial: string;
  startDate: string;
  endDate: string;
  dropoffTime: string | null;
  addressLine: string;
  totalCents: number;
  bookingId: string;
}): string {
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0F1114;">
      <h1 style="font-size: 24px; margin-bottom: 16px;">Booking confirmed, ${v.firstName}.</h1>
      <p>Your payment is received and your equipment is locked in for the dates below. The signed rental agreement is attached to this email.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr><td style="padding: 8px 0; color: #7A766F;">Equipment</td><td style="padding: 8px 0; text-align: right;">${v.equipmentName}</td></tr>
        <tr><td style="padding: 8px 0; color: #7A766F;">Serial</td><td style="padding: 8px 0; text-align: right; font-family: monospace; font-size: 13px;">${v.equipmentSerial}</td></tr>
        <tr><td style="padding: 8px 0; color: #7A766F;">Delivery</td><td style="padding: 8px 0; text-align: right;">${v.startDate}${v.dropoffTime ? ` at ${v.dropoffTime}` : ""}</td></tr>
        <tr><td style="padding: 8px 0; color: #7A766F;">Pickup</td><td style="padding: 8px 0; text-align: right;">${v.endDate}${v.dropoffTime ? ` at ${v.dropoffTime}` : ""}</td></tr>
        <tr><td style="padding: 8px 0; color: #7A766F;">Project address</td><td style="padding: 8px 0; text-align: right;">${v.addressLine || "—"}</td></tr>
        <tr style="border-top: 1px solid #E5DFD3;"><td style="padding: 12px 0 0; font-weight: 600;">Total paid</td><td style="padding: 12px 0 0; text-align: right; font-weight: 600;">${formatCents(v.totalCents)} CAD</td></tr>
      </table>
      <p style="font-family: monospace; font-size: 12px; color: #7A766F;">Booking ID: ${v.bookingId}</p>
      <p style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E5DFD3; font-size: 13px; color: #7A766F;">
        Questions? Reply to this email.<br>
        Big D&rsquo;s Rental Co. · 31 Cimarron Meadows Crescent, Okotoks, Alberta · 403-422-7368
      </p>
    </div>
  `;
}
