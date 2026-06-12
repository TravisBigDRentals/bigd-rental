import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Resend } from "resend";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { firstAdminEmail } from "@/lib/admin/emails";

export const runtime = "nodejs";

type BookingRow = {
  id: string;
  signed_agreement_pdf_url: string | null;
  customer: { first_name: string; email: string } | { first_name: string; email: string }[] | null;
  equipment: { name: string } | { name: string }[] | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function parseAdminEmails(): Set<string> {
  const raw = process.env.BIGDS_ADMIN_EMAIL ?? "";
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Admin gate. The /admin/* middleware doesn't cover /api/admin/*,
  // so guard the route here.
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  const adminEmails = parseAdminEmails();
  if (!user?.email || !adminEmails.has(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id, signed_agreement_pdf_url,
      customer:customer_id ( first_name, email ),
      equipment:equipment_id ( name )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Booking not found" }, { status: 404 });
  }

  const booking = data as unknown as BookingRow;
  const customer = unwrap(booking.customer);
  const equipment = unwrap(booking.equipment);

  if (!customer?.email) {
    return NextResponse.json({ error: "Booking has no customer email" }, { status: 400 });
  }
  if (booking.signed_agreement_pdf_url) {
    return NextResponse.json({ error: "This booking is already signed" }, { status: 400 });
  }

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const signUrl = `${proto}://${host}/book/${booking.id}/sign`;

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const isSandbox = (process.env.SQUARE_ENVIRONMENT ?? "sandbox") !== "production";
  const adminEmail = firstAdminEmail();
  const intendedRecipient = customer.email.toLowerCase();
  const recipient = isSandbox ? (adminEmail ?? intendedRecipient) : intendedRecipient;
  const subjectPrefix = isSandbox ? "[TEST] " : "";
  const sandboxNotice = isSandbox
    ? `<div style="background:#FFF7E5;border:1px solid #F2C461;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#8A5A00;">TEST MODE — in production this would have gone to <strong>${intendedRecipient}</strong>.</div>`
    : "";

  const equipmentName = equipment?.name ?? "your rental";
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0F1114;">
      ${sandboxNotice}
      <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6b6b;margin:0 0 8px;">Big D's Rental Co.</p>
      <h1 style="font-size:24px;font-weight:700;margin:0 0 16px;">Hi ${customer.first_name}, please sign your rental agreement</h1>
      <p style="font-size:15px;line-height:1.55;margin:0 0 16px;">Your rental for <strong>${equipmentName}</strong> is waiting on a signed agreement before it's fully confirmed. Use the link below to review and sign.</p>
      <p style="margin:24px 0;">
        <a href="${signUrl}" style="display:inline-block;background:#D4891A;color:#F5F2EC;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Open the agreement →</a>
      </p>
      <p style="font-size:13px;color:#6b6b6b;line-height:1.55;margin:24px 0 0;">If the button doesn't work, copy this link into your browser:<br><span style="font-family:monospace;font-size:12px;color:#0F1114;word-break:break-all;">${signUrl}</span></p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: `Big D's Rental <${from}>`,
      to: recipient,
      subject: `${subjectPrefix}Action needed: sign your rental agreement`,
      html,
    });
    if (result.error) {
      console.error("[admin/resend-signature] resend rejected", {
        bookingId: id,
        from,
        to: recipient,
        error: result.error,
      });
      return NextResponse.json({ error: result.error.message }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sent_to: recipient, message_id: result.data?.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Email send failed";
    console.error("[admin/resend-signature] threw", { bookingId: id, from, to: recipient, error: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
