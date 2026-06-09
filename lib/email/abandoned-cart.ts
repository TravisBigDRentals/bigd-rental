import "server-only";
import { Resend } from "resend";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type BookingRow = {
  id: string;
  start_date: string;
  end_date: string;
  abandoned_email_sent_at: string | null;
  customer: { first_name: string; email: string } | { first_name: string; email: string }[] | null;
  equipment: { name: string } | { name: string }[] | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

// Sends one "you didn't finish" email per booking that's been sitting
// in a pending status for more than the hold window. Idempotent: the
// abandoned_email_sent_at column gates this to one send per booking.
export async function sendAbandonedCartEmailIfDue(
  bookingId: string,
  baseUrl: string,
): Promise<{ sent: true } | { sent: false; reason: string }> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id, start_date, end_date, abandoned_email_sent_at,
      customer:customer_id ( first_name, email ),
      equipment:equipment_id ( name )
    `)
    .eq("id", bookingId)
    .single();
  if (error || !data) return { sent: false, reason: "Booking not found" };
  const booking = data as unknown as BookingRow;
  if (booking.abandoned_email_sent_at) return { sent: false, reason: "Already sent" };

  const customer = unwrap(booking.customer);
  const equipment = unwrap(booking.equipment);
  if (!customer?.email) return { sent: false, reason: "No customer email" };

  // Race-safe stamp: only proceed if this UPDATE actually changed the row.
  const { data: stamped, error: stampErr } = await supabase
    .from("bookings")
    .update({ abandoned_email_sent_at: new Date().toISOString() })
    .eq("id", bookingId)
    .is("abandoned_email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (stampErr) return { sent: false, reason: stampErr.message };
  if (!stamped) return { sent: false, reason: "Already stamped (race)" };

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const isSandbox = (process.env.SQUARE_ENVIRONMENT ?? "sandbox") !== "production";
  const adminEmail = process.env.BIGDS_ADMIN_EMAIL?.toLowerCase() || undefined;
  const intendedRecipient = customer.email.toLowerCase();
  const recipient = isSandbox ? (adminEmail ?? intendedRecipient) : intendedRecipient;
  const subjectPrefix = isSandbox ? "[TEST] " : "";
  const sandboxNotice = isSandbox
    ? `<div style="background:#FFF7E5;border:1px solid #F2C461;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#8A5A00;">TEST MODE — production would have gone to <strong>${intendedRecipient}</strong>.</div>`
    : "";

  const equipmentName = equipment?.name ?? "your rental";
  const resumeUrl = `${baseUrl}/book?prefill=${booking.id}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0F1114;">
      ${sandboxNotice}
      <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6b6b;margin:0 0 8px;">Big D's Rental Co.</p>
      <h1 style="font-size:24px;font-weight:700;margin:0 0 16px;">Hi ${customer.first_name}, finish your booking?</h1>
      <p style="font-size:15px;line-height:1.55;margin:0 0 16px;">You started a booking for <strong>${equipmentName}</strong> (${booking.start_date} → ${booking.end_date}) but didn't complete it. The hold on those dates has expired, but if they're still open we'd love to confirm your rental.</p>
      <p style="margin:24px 0;">
        <a href="${resumeUrl}" style="display:inline-block;background:#D58B1B;color:#F5F2EC;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Pick up where you left off →</a>
      </p>
      <p style="font-size:13px;color:#6b6b6b;line-height:1.55;margin:24px 0 0;">If the link doesn't work, copy this into your browser:<br><span style="font-family:monospace;font-size:12px;color:#0F1114;word-break:break-all;">${resumeUrl}</span></p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: `Big D's Rental <${from}>`,
      to: recipient,
      subject: `${subjectPrefix}Did you forget about your ${equipmentName} rental?`,
      html,
    });
    if (result.error) return { sent: false, reason: result.error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Send failed" };
  }
}
