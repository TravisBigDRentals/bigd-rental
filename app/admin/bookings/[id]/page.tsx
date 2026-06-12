import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatCents } from "@/lib/pricing";
import { ResendSignatureButton } from "./resend-signature-button";
import { CancelBookingButton } from "./cancel-booking-button";

export const metadata = {
  title: "Booking detail — Big D's Admin",
};

type Customer = {
  first_name: string;
  last_name: string;
  business_name: string | null;
  email: string;
  phone: string;
  drivers_license_front_url: string | null;
  drivers_license_back_url: string | null;
  drivers_license_number: string | null;
  drivers_license_expiry: string | null;
  customer_address_line1: string;
  customer_address_line2: string | null;
  customer_city: string;
  customer_province: string;
  customer_postal_code: string;
  project_address_line1: string;
  project_address_line2: string | null;
  project_city: string;
  project_province: string;
  project_postal_code: string;
};

type Equipment = { name: string; serial: string };

type AddonRow = { id: string; quantity: number; daily_rate_cents: number; addon: { name: string } | null };

type Coupon = {
  code: string;
  discount_type: "percent" | "amount";
  discount_value: number;
};

type BookingDetail = {
  id: string;
  start_date: string;
  end_date: string;
  dropoff_time: string | null;
  special_instructions: string | null;
  status: string;
  total_cents: number;
  discount_cents: number;
  liability_waiver_cents: number;
  canceled_at: string | null;
  canceled_reason: string | null;
  refund_id: string | null;
  refund_amount_cents: number | null;
  payment_intent_id: string | null;
  paid_at: string | null;
  signed_agreement_pdf_url: string | null;
  drivers_license_front_url: string | null;
  drivers_license_back_url: string | null;
  drivers_license_number: string | null;
  drivers_license_expiry: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  created_at: string;
  customer: Customer | null;
  equipment: Equipment | null;
  booking_addons: AddonRow[] | null;
  extra_equipment: Equipment | null;
  coupon: Coupon | null;
};

async function signedDlUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase.storage
    .from("customer-documents")
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
  return data?.signedUrl ?? null;
}

// The BoldSign webhook stores the signed agreement as a path inside
// the private `signed-agreements` bucket (e.g. `<bookingId>/agreement.pdf`)
// rather than a public URL. Mint a short-lived signed URL so admins can
// download it from the booking detail page.
async function signedAgreementUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase.storage
    .from("signed-agreements")
    .createSignedUrl(path, 60 * 60); // 1 hour — admin reloads the page if it expires
  return data?.signedUrl ?? null;
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id, start_date, end_date, dropoff_time, special_instructions, status,
      total_cents, discount_cents, liability_waiver_cents, payment_intent_id, paid_at, signed_agreement_pdf_url,
      canceled_at, canceled_reason, refund_id, refund_amount_cents,
      drivers_license_front_url, drivers_license_back_url,
      drivers_license_number, drivers_license_expiry,
      delivered_at, returned_at, created_at,
      customer:customer_id ( first_name, last_name, business_name, email, phone, drivers_license_front_url, drivers_license_back_url, drivers_license_number, drivers_license_expiry, customer_address_line1, customer_address_line2, customer_city, customer_province, customer_postal_code, project_address_line1, project_address_line2, project_city, project_province, project_postal_code ),
      equipment:equipment_id ( name, serial ),
      extra_equipment:extra_equipment_id ( name, serial ),
      booking_addons ( id, quantity, daily_rate_cents, addon:addon_id ( name ) ),
      coupon:coupon_id ( code, discount_type, discount_value )
    `)
    .eq("id", id)
    .single();

  if (error || !data) notFound();
  const booking = data as unknown as BookingDetail;

  // Per-booking DL snapshot is the authoritative reference (added via
  // migration 0008). Fall back to customer.drivers_license_*_url for
  // historical bookings created before the snapshot was wired up.
  const dlFrontPath = booking.drivers_license_front_url ?? booking.customer?.drivers_license_front_url ?? null;
  const dlBackPath = booking.drivers_license_back_url ?? booking.customer?.drivers_license_back_url ?? null;
  const [dlFrontUrl, dlBackUrl, signedAgreementHref] = await Promise.all([
    signedDlUrl(dlFrontPath),
    signedDlUrl(dlBackPath),
    signedAgreementUrl(booking.signed_agreement_pdf_url),
  ]);

  const customer = booking.customer;
  const equipment = booking.equipment;
  const extraEquipment = booking.extra_equipment;
  const addons = booking.booking_addons ?? [];

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <Link href="/admin/bookings" className="font-mono text-xs text-muted hover:text-ink uppercase tracking-widest">
        ← All bookings
      </Link>
      <header className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {customer?.first_name} {customer?.last_name}
          </h1>
          {customer?.business_name && (
            <p className="mt-1 text-sm text-muted">{customer.business_name}</p>
          )}
          <p className="mt-1 font-mono text-xs text-muted">Booking {booking.id}</p>
        </div>
        <span className={`inline-block rounded-full border px-3 py-1 text-xs font-mono uppercase tracking-widest ${
          booking.status === "canceled"
            ? "bg-red-100 text-red-900 border-red-300"
            : "bg-paper text-ink border-ink/15"
        }`}>
          {booking.status}
        </span>
      </header>

      {booking.canceled_at && (
        <section className="mt-6 rounded-2xl border border-red-300 bg-red-50 px-5 py-4">
          <p className="font-mono text-xs uppercase tracking-widest text-red-900">Canceled</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 text-sm text-red-900">
            <div>
              <p className="text-xs text-red-900/70">Canceled at</p>
              <p className="font-mono">{new Date(booking.canceled_at).toLocaleString("en-CA")}</p>
            </div>
            {booking.refund_amount_cents !== null && (
              <div>
                <p className="text-xs text-red-900/70">Refund</p>
                <p className="font-mono">
                  {formatCents(booking.refund_amount_cents)}
                  {booking.refund_id && (
                    <span className="ml-2 text-xs text-red-900/70 break-all">({booking.refund_id})</span>
                  )}
                </p>
              </div>
            )}
            {booking.canceled_reason && (
              <div className="sm:col-span-2">
                <p className="text-xs text-red-900/70">Reason</p>
                <p className="whitespace-pre-wrap">{booking.canceled_reason}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mt-10 grid gap-6 sm:grid-cols-2">
        <DetailCard title="Equipment">
          <p className="font-medium">{equipment?.name}</p>
          <p className="font-mono text-xs text-muted">{equipment?.serial}</p>
          {extraEquipment && (
            <div className="mt-3 pt-3 border-t border-ink/10">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">+ Extra machine</p>
              <p className="mt-1 font-medium">{extraEquipment.name}</p>
              <p className="font-mono text-xs text-muted">{extraEquipment.serial}</p>
            </div>
          )}
        </DetailCard>
        <DetailCard title="Dates">
          <p className="font-mono text-sm">{booking.start_date} → {booking.end_date}</p>
          {booking.dropoff_time && (
            <p className="text-sm text-muted">Drop-off at {booking.dropoff_time}</p>
          )}
        </DetailCard>
        <DetailCard title="Contact" className="sm:col-span-2">
          <p>{customer?.email}</p>
          <p>{customer?.phone}</p>
        </DetailCard>
        <DetailCard title="Customer address">
          <p>{customer?.customer_address_line1}</p>
          {customer?.customer_address_line2 && <p>{customer.customer_address_line2}</p>}
          <p>
            {[customer?.customer_city, customer?.customer_province, customer?.customer_postal_code]
              .filter(Boolean)
              .join(", ")}
          </p>
        </DetailCard>
        <DetailCard title="Project address">
          <p>{customer?.project_address_line1}</p>
          {customer?.project_address_line2 && <p>{customer.project_address_line2}</p>}
          <p>
            {[customer?.project_city, customer?.project_province, customer?.project_postal_code]
              .filter(Boolean)
              .join(", ")}
          </p>
        </DetailCard>
        {addons.length > 0 && (
          <DetailCard title="Attachments" className="sm:col-span-2">
            <ul className="text-sm">
              {addons.map((a, i) => (
                <li key={a.id} className="flex justify-between">
                  <span>{a.addon?.name}</span>
                  <span className="font-mono text-muted">
                    {i === 0 ? "Free" : `${formatCents(a.daily_rate_cents)}/day`}
                  </span>
                </li>
              ))}
            </ul>
          </DetailCard>
        )}
        <DetailCard title="Driver's license" className="sm:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">Number</p>
              <p className="font-mono text-sm">
                {booking.drivers_license_number ?? booking.customer?.drivers_license_number ?? <span className="text-muted">—</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Expires</p>
              <p className="font-mono text-sm">
                {(booking.drivers_license_expiry ?? booking.customer?.drivers_license_expiry) ?? <span className="text-muted">—</span>}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-ink/10 flex flex-wrap gap-4 text-sm">
            {dlFrontUrl ? (
              <a href={dlFrontUrl} target="_blank" rel="noopener" className="underline text-accent">
                ↗ Front (7-day link)
              </a>
            ) : <span className="text-muted">No front uploaded</span>}
            {dlBackUrl ? (
              <a href={dlBackUrl} target="_blank" rel="noopener" className="underline text-accent">
                ↗ Back (7-day link)
              </a>
            ) : <span className="text-muted">No back uploaded</span>}
          </div>
        </DetailCard>
        {booking.special_instructions && (
          <DetailCard title="Special instructions" className="sm:col-span-2">
            <p className="text-sm whitespace-pre-wrap">{booking.special_instructions}</p>
          </DetailCard>
        )}
      </section>

      <section className="mt-10 rounded-2xl border border-ink/10 bg-ink/[0.02] p-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted">Payment</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted">Total</p>
            <p className="font-display text-2xl font-semibold">{formatCents(booking.total_cents)}</p>
            {booking.discount_cents > 0 && booking.coupon && (
              <p className="mt-1 text-xs text-emerald-800">
                <span className="font-mono">{booking.coupon.code}</span> applied — {formatCents(booking.discount_cents)} off
              </p>
            )}
            {booking.liability_waiver_cents > 0 && (
              <p className="mt-1 text-xs text-muted">
                Liability waiver applied — {formatCents(booking.liability_waiver_cents)} (flat, non-discountable)
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted">Square payment ID</p>
            <p className="font-mono text-xs break-all">{booking.payment_intent_id ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Paid at</p>
            <p className="font-mono text-xs">
              {booking.paid_at ? new Date(booking.paid_at).toLocaleString("en-CA") : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Signed agreement</p>
            <p className="font-mono text-xs">
              {signedAgreementHref ? (
                <a href={signedAgreementHref} target="_blank" rel="noopener" className="underline text-accent">
                  ↗ Download PDF
                </a>
              ) : "Not signed yet"}
            </p>
            {!booking.signed_agreement_pdf_url && booking.status !== "canceled" && (
              <ResendSignatureButton bookingId={booking.id} />
            )}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-ink/10 p-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted">Lifecycle</h2>
        <ol className="mt-3 space-y-2 text-sm">
          <Step label="Created" timestamp={booking.created_at} />
          <Step label="Paid" timestamp={booking.paid_at} />
          <Step label="Delivered" timestamp={booking.delivered_at} />
          <Step label="Returned" timestamp={booking.returned_at} />
        </ol>
        <p className="mt-4 font-mono text-xs text-muted">
          Delivery + return workflows ship in Phase 6.
        </p>
      </section>

      {booking.status !== "canceled" && (
        <section className="mt-8 rounded-2xl border border-red-200 bg-red-50/40 p-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-red-900">Cancel booking</h2>
            <p className="mt-1 text-sm text-red-900/80">
              Mark this booking as canceled and free the dates. If the customer paid, we&rsquo;ll issue a Square refund automatically.
            </p>
          </div>
          <CancelBookingButton
            bookingId={booking.id}
            totalCents={booking.total_cents}
            hasPayment={!!booking.payment_intent_id}
          />
        </section>
      )}
    </main>
  );
}

function DetailCard({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-ink/10 p-4 ${className}`}>
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Step({ label, timestamp }: { label: string; timestamp: string | null }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-3">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            timestamp ? "bg-accent" : "bg-ink/15"
          }`}
        />
        <span className={timestamp ? "" : "text-muted"}>{label}</span>
      </span>
      <span className="font-mono text-xs text-muted">
        {timestamp ? new Date(timestamp).toLocaleString("en-CA") : "—"}
      </span>
    </li>
  );
}
