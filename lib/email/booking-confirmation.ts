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

export async function sendBookingConfirmationEmail({ bookingId }: { bookingId: string }) {
  const supabase = createSupabaseServiceClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(`
      id, start_date, end_date, dropoff_time, total_cents, status,
      equipment:equipment_id ( name, serial ),
      customer:customer_id ( first_name, last_name, email, project_address_line1, project_city, project_province, project_postal_code )
    `)
    .eq("id", bookingId)
    .single();

  if (error || !booking) throw new Error(`Booking ${bookingId} not found: ${error?.message}`);

  const customer = booking.customer as unknown as Customer;
  const equipment = booking.equipment as unknown as Equipment;

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  const addressLine = [customer.project_address_line1, customer.project_city, customer.project_province, customer.project_postal_code]
    .filter(Boolean)
    .join(", ");

  return resend.emails.send({
    from: `Big D's Rental <${from}>`,
    to: customer.email,
    subject: `Booking confirmed — ${equipment.name} (${booking.start_date})`,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0F1114;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">Booking confirmed, ${customer.first_name}.</h1>
        <p>Your payment is received and your equipment is locked in for the dates below.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
          <tr><td style="padding: 8px 0; color: #7A766F;">Equipment</td><td style="padding: 8px 0; text-align: right;">${equipment.name}</td></tr>
          <tr><td style="padding: 8px 0; color: #7A766F;">Serial</td><td style="padding: 8px 0; text-align: right; font-family: monospace; font-size: 13px;">${equipment.serial}</td></tr>
          <tr><td style="padding: 8px 0; color: #7A766F;">Dates</td><td style="padding: 8px 0; text-align: right;">${booking.start_date} → ${booking.end_date}</td></tr>
          <tr><td style="padding: 8px 0; color: #7A766F;">Drop-off</td><td style="padding: 8px 0; text-align: right;">${booking.dropoff_time ?? "—"}</td></tr>
          <tr><td style="padding: 8px 0; color: #7A766F;">Project address</td><td style="padding: 8px 0; text-align: right;">${addressLine || "—"}</td></tr>
          <tr style="border-top: 1px solid #E5DFD3;"><td style="padding: 12px 0 0; font-weight: 600;">Total paid</td><td style="padding: 12px 0 0; text-align: right; font-weight: 600;">${formatCents(booking.total_cents)} CAD</td></tr>
        </table>
        <p style="font-family: monospace; font-size: 12px; color: #7A766F;">Booking ID: ${booking.id}</p>
        <p>We&rsquo;ll be in touch shortly with the signed rental agreement.</p>
        <p style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E5DFD3; font-size: 13px; color: #7A766F;">
          Questions? Reply to this email.<br>
          Big D&rsquo;s Rental Co. · Calgary, AB
        </p>
      </div>
    `,
  });
}
