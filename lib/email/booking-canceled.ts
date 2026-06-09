import "server-only";
import { Resend } from "resend";
import { formatCents } from "@/lib/pricing";

type Customer = { first_name: string; email: string };
type Equipment = { name: string };

export async function sendBookingCanceledEmail(opts: {
  bookingId: string;
  customer: Customer;
  equipment: Equipment | null;
  startDate: string;
  endDate: string;
  refundAmountCents: number | null; // null = no refund issued
  reason: string | null;
}): Promise<{ sent: true } | { sent: false; error: string }> {
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const isSandbox = (process.env.SQUARE_ENVIRONMENT ?? "sandbox") !== "production";
  const adminEmail = process.env.BIGDS_ADMIN_EMAIL?.toLowerCase() || undefined;
  const intendedRecipient = opts.customer.email.toLowerCase();
  const recipient = isSandbox ? (adminEmail ?? intendedRecipient) : intendedRecipient;
  const subjectPrefix = isSandbox ? "[TEST] " : "";
  const sandboxNotice = isSandbox
    ? `<div style="background:#FFF7E5;border:1px solid #F2C461;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#8A5A00;">TEST MODE — production would have gone to <strong>${intendedRecipient}</strong>.</div>`
    : "";

  const equipmentName = opts.equipment?.name ?? "your rental";
  const refundLine = opts.refundAmountCents
    ? `<p style="font-size:15px;line-height:1.55;margin:0 0 16px;">A refund of <strong>${formatCents(opts.refundAmountCents)}</strong> has been issued to the card on file. It usually appears in 3–5 business days.</p>`
    : "";
  const reasonLine = opts.reason
    ? `<p style="font-size:14px;line-height:1.55;margin:0 0 16px;color:#4A4A4A;"><strong>Reason:</strong> ${escapeHtml(opts.reason)}</p>`
    : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0F1114;">
      ${sandboxNotice}
      <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6b6b;margin:0 0 8px;">Big D's Rental Co.</p>
      <h1 style="font-size:24px;font-weight:700;margin:0 0 16px;">Hi ${opts.customer.first_name}, your booking has been canceled</h1>
      <p style="font-size:15px;line-height:1.55;margin:0 0 16px;">Your rental for <strong>${equipmentName}</strong> (${opts.startDate} → ${opts.endDate}) has been canceled.</p>
      ${reasonLine}
      ${refundLine}
      <p style="font-size:13px;color:#6b6b6b;line-height:1.55;margin:24px 0 0;">If this was unexpected or you have questions, reply to this email and we'll sort it out.</p>
      <p style="font-size:12px;color:#9a9a9a;margin:32px 0 0;">Booking ID: ${opts.bookingId}</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: `Big D's Rental <${from}>`,
      to: recipient,
      subject: `${subjectPrefix}Your ${equipmentName} booking has been canceled`,
      html,
    });
    if (result.error) return { sent: false, error: result.error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
