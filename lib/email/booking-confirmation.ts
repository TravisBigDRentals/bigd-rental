import "server-only";
import { Resend } from "resend";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatCents } from "@/lib/pricing";

type Customer = {
  first_name: string;
  last_name: string;
  business_name: string | null;
  email: string;
  phone: string;
  project_address_line1: string | null;
  project_city: string | null;
  project_province: string | null;
  project_postal_code: string | null;
  customer_address_line1: string | null;
  customer_city: string | null;
  customer_province: string | null;
  customer_postal_code: string | null;
};

type Equipment = { name: string; serial: string };

type AddonRow = { name: string; daily_rate_cents: number };

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
  booking_addons: { addon: AddonRow | AddonRow[] | null }[] | null;
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
      customer:customer_id ( first_name, last_name, business_name, email, phone, project_address_line1, project_city, project_province, project_postal_code, customer_address_line1, customer_city, customer_province, customer_postal_code ),
      booking_addons ( addon:addon_id ( name, daily_rate_cents ) )
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
  const addons: AddonRow[] = (booking.booking_addons ?? [])
    .map((ba) => unwrap(ba.addon))
    .filter((a): a is AddonRow => !!a);

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
  // Normalize to lowercase. Resend's test-mode whitelist match is
  // case-sensitive, and the env var's casing is too easy to get wrong.
  const adminCc = process.env.BIGDS_ADMIN_EMAIL?.toLowerCase() || undefined;

  const addressLine = [customer.project_address_line1, customer.project_city, customer.project_province, customer.project_postal_code]
    .filter(Boolean)
    .join(", ");

  // Sandbox redirect: while in test mode, Resend's onboarding@resend.dev
  // sender only delivers to the Resend account owner. Override the actual
  // recipient to BIGDS_ADMIN_EMAIL so every dev email lands somewhere
  // useful, regardless of what the test customer typed. Production
  // (SQUARE_ENVIRONMENT=production) sends to the real customer.
  const isSandbox = (process.env.SQUARE_ENVIRONMENT ?? "sandbox") !== "production";
  const intendedRecipient = customer.email.toLowerCase();
  const recipient = isSandbox ? (adminCc ?? intendedRecipient) : intendedRecipient;
  const cc = isSandbox ? undefined : adminCc;
  const subjectPrefix = isSandbox ? "[TEST] " : "";
  const sandboxNotice = isSandbox
    ? `<div style="background:#FFF7E5; border:1px solid #F2C461; padding:10px 14px; margin-bottom:16px; font-size:13px; color:#8A5A00;">
         TEST MODE — in production this email would have gone to <strong>${intendedRecipient}</strong>.
       </div>`
    : "";

  const attachments = [
    { filename: `rental-agreement-${booking.id}.pdf`, content: pdfBuffer },
  ];

  const customerResult = await resend.emails.send({
    from: `Big D's Rental <${from}>`,
    to: recipient,
    cc,
    subject: `${subjectPrefix}Booking confirmed — ${equipment.name} (${booking.start_date})`,
    html: sandboxNotice + htmlBody({
      firstName: customer.first_name,
      equipmentName: equipment.name,
      equipmentSerial: equipment.serial,
      startDate: booking.start_date,
      endDate: booking.end_date,
      dropoffTime: booking.dropoff_time,
      addressLine,
      totalCents: booking.total_cents,
      bookingId: booking.id,
      addons,
    }),
    attachments,
  });

  if (customerResult.error) {
    // Roll back the claim so a future retry can succeed.
    await supabase.from("bookings").update({ email_sent_at: null }).eq("id", bookingId);
    return { sent: false, reason: `resend send failed: ${customerResult.error.message}` };
  }

  // Admin notification — separate operations-focused email with the PDF.
  // Goes to BIGDS_ADMIN_EMAIL (in sandbox that's the same inbox the customer
  // email got redirected to; in production it's Big D's real ops address).
  // Don't roll back the customer claim if this one fails — customer email
  // already succeeded.
  if (adminCc) {
    const customerAddressLine = [customer.customer_address_line1, customer.customer_city, customer.customer_province, customer.customer_postal_code]
      .filter(Boolean)
      .join(", ");
    const adminResult = await resend.emails.send({
      from: `Big D's Rental Bookings <${from}>`,
      to: adminCc,
      subject: `${subjectPrefix}New booking · ${equipment.name} · ${customer.first_name} ${customer.last_name} · ${booking.start_date}`,
      html: sandboxNotice + adminHtmlBody({
        customerFirstName: customer.first_name,
        customerLastName: customer.last_name,
        customerBusinessName: customer.business_name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        customerAddressLine: customerAddressLine,
        equipmentName: equipment.name,
        equipmentSerial: equipment.serial,
        startDate: booking.start_date,
        endDate: booking.end_date,
        dropoffTime: booking.dropoff_time,
        projectAddressLine: addressLine,
        totalCents: booking.total_cents,
        bookingId: booking.id,
        addons,
      }),
      attachments,
    });
    if (adminResult.error) {
      console.error(`[email] admin notification failed: ${adminResult.error.message}`);
    }
  }

  return { sent: true, messageId: customerResult.data?.id };
}

function adminHtmlBody(v: {
  customerFirstName: string;
  customerLastName: string;
  customerBusinessName: string | null;
  customerEmail: string;
  customerPhone: string;
  customerAddressLine: string;
  equipmentName: string;
  equipmentSerial: string;
  startDate: string;
  endDate: string;
  dropoffTime: string | null;
  projectAddressLine: string;
  totalCents: number;
  bookingId: string;
  addons: AddonRow[];
}): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "https://bigd-rental.vercel.app";
  const adminUrl = `${appUrl}/admin/bookings/${v.bookingId}`;
  const customerFullName = [v.customerFirstName, v.customerLastName].filter(Boolean).join(" ");
  const businessSuffix = v.customerBusinessName ? ` <span style="color:#7A766F;">· ${escapeHtml(v.customerBusinessName)}</span>` : "";
  const addonsCell = v.addons.length === 0
    ? "<span style=\"color:#7A766F;\">None</span>"
    : v.addons
        .map((a, i) => i === 0
          ? `${escapeHtml(a.name)} <span style="color:#7A766F;">(free)</span>`
          : `${escapeHtml(a.name)} <span style="color:#7A766F;">(${formatCents(a.daily_rate_cents)}/day)</span>`)
        .join("<br>");
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #0F1114;">
      <p style="font-family: monospace; font-size: 11px; letter-spacing: 0.15em; color: #7A766F; text-transform: uppercase; margin: 0;">New booking</p>
      <h1 style="font-size: 24px; margin: 4px 0 24px;">${escapeHtml(customerFullName)}${businessSuffix}</h1>

      <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.12em; color: #7A766F; margin: 24px 0 8px;">Contact</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; color: #7A766F; width: 35%;">Email</td><td style="padding: 6px 0;">${escapeHtml(v.customerEmail)}</td></tr>
        <tr><td style="padding: 6px 0; color: #7A766F;">Phone</td><td style="padding: 6px 0;"><a href="tel:${escapeHtml(v.customerPhone)}" style="color: #D4891A;">${escapeHtml(v.customerPhone)}</a></td></tr>
        <tr><td style="padding: 6px 0; color: #7A766F; vertical-align: top;">Billing address</td><td style="padding: 6px 0;">${escapeHtml(v.customerAddressLine) || "—"}</td></tr>
      </table>

      <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.12em; color: #7A766F; margin: 24px 0 8px;">Equipment</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; color: #7A766F; width: 35%;">Machine</td><td style="padding: 6px 0;">${escapeHtml(v.equipmentName)}</td></tr>
        <tr><td style="padding: 6px 0; color: #7A766F;">Serial</td><td style="padding: 6px 0; font-family: monospace; font-size: 13px;">${escapeHtml(v.equipmentSerial)}</td></tr>
        <tr><td style="padding: 6px 0; color: #7A766F; vertical-align: top;">Add-ons</td><td style="padding: 6px 0;">${addonsCell}</td></tr>
      </table>

      <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.12em; color: #7A766F; margin: 24px 0 8px;">Delivery & pickup</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; color: #7A766F; width: 35%;">Deliver</td><td style="padding: 6px 0;"><strong>${v.startDate}</strong>${v.dropoffTime ? ` at ${v.dropoffTime}` : ""}</td></tr>
        <tr><td style="padding: 6px 0; color: #7A766F;">Pick up</td><td style="padding: 6px 0;"><strong>${v.endDate}</strong>${v.dropoffTime ? ` at ${v.dropoffTime}` : ""}</td></tr>
        <tr><td style="padding: 6px 0; color: #7A766F; vertical-align: top;">Project site</td><td style="padding: 6px 0;"><strong>${escapeHtml(v.projectAddressLine) || "—"}</strong></td></tr>
      </table>

      <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.12em; color: #7A766F; margin: 24px 0 8px;">Payment</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; color: #7A766F; width: 35%;">Total</td><td style="padding: 6px 0; font-weight: 600;">${formatCents(v.totalCents)} CAD</td></tr>
      </table>

      <p style="margin-top: 32px;">
        <a href="${adminUrl}" style="display: inline-block; background: #0F1114; color: #F5F2EC; padding: 10px 20px; border-radius: 999px; text-decoration: none; font-weight: 500;">Open in admin →</a>
      </p>

      <p style="margin-top: 24px; font-family: monospace; font-size: 12px; color: #7A766F;">Booking ID: ${v.bookingId}</p>
      <p style="font-family: monospace; font-size: 12px; color: #7A766F;">Signed rental agreement attached.</p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  addons: AddonRow[];
}): string {
  const addonsCell = v.addons.length === 0
    ? "None"
    : v.addons
        .map((a, i) => i === 0
          ? `${escapeHtml(a.name)} <span style="color:#7A766F;">(free)</span>`
          : `${escapeHtml(a.name)} <span style="color:#7A766F;">(${formatCents(a.daily_rate_cents)}/day)</span>`)
        .join("<br>");
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0F1114;">
      <h1 style="font-size: 24px; margin-bottom: 16px;">Booking confirmed, ${escapeHtml(v.firstName)}.</h1>
      <p>Your payment is received and your equipment is locked in for the dates below. The signed rental agreement is attached to this email.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr><td style="padding: 8px 0; color: #7A766F; vertical-align: top;">Equipment</td><td style="padding: 8px 0; text-align: right;">${escapeHtml(v.equipmentName)}</td></tr>
        <tr><td style="padding: 8px 0; color: #7A766F; vertical-align: top;">Serial</td><td style="padding: 8px 0; text-align: right; font-family: monospace; font-size: 13px;">${escapeHtml(v.equipmentSerial)}</td></tr>
        <tr><td style="padding: 8px 0; color: #7A766F; vertical-align: top;">Add-ons</td><td style="padding: 8px 0; text-align: right;">${addonsCell}</td></tr>
        <tr><td style="padding: 8px 0; color: #7A766F; vertical-align: top;">Delivery</td><td style="padding: 8px 0; text-align: right;">${v.startDate}${v.dropoffTime ? ` at ${v.dropoffTime}` : ""}</td></tr>
        <tr><td style="padding: 8px 0; color: #7A766F; vertical-align: top;">Pickup</td><td style="padding: 8px 0; text-align: right;">${v.endDate}${v.dropoffTime ? ` at ${v.dropoffTime}` : ""}</td></tr>
        <tr><td style="padding: 8px 0; color: #7A766F; vertical-align: top;">Project address</td><td style="padding: 8px 0; text-align: right;">${escapeHtml(v.addressLine) || "—"}</td></tr>
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
