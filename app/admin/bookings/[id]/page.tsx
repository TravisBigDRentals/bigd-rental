import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatCents } from "@/lib/pricing";

export const metadata = {
  title: "Booking detail — Big D's Admin",
};

type Customer = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  drivers_license_front_url: string | null;
  drivers_license_back_url: string | null;
  project_address_line1: string;
  project_address_line2: string | null;
  project_city: string;
  project_province: string;
  project_postal_code: string;
};

type Equipment = { name: string; serial: string };

type AddonRow = { id: string; quantity: number; daily_rate_cents: number; addon: { name: string } | null };

type BookingDetail = {
  id: string;
  start_date: string;
  end_date: string;
  dropoff_time: string | null;
  special_instructions: string | null;
  status: string;
  total_cents: number;
  payment_intent_id: string | null;
  paid_at: string | null;
  signed_agreement_pdf_url: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  created_at: string;
  customer: Customer | null;
  equipment: Equipment | null;
  booking_addons: AddonRow[] | null;
};

async function signedDlUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase.storage
    .from("customer-documents")
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
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
      total_cents, payment_intent_id, paid_at, signed_agreement_pdf_url,
      delivered_at, returned_at, created_at,
      customer:customer_id ( first_name, last_name, email, phone, drivers_license_front_url, drivers_license_back_url, project_address_line1, project_address_line2, project_city, project_province, project_postal_code ),
      equipment:equipment_id ( name, serial ),
      booking_addons ( id, quantity, daily_rate_cents, addon:addon_id ( name ) )
    `)
    .eq("id", id)
    .single();

  if (error || !data) notFound();
  const booking = data as unknown as BookingDetail;

  const [dlFrontUrl, dlBackUrl] = await Promise.all([
    signedDlUrl(booking.customer?.drivers_license_front_url ?? null),
    signedDlUrl(booking.customer?.drivers_license_back_url ?? null),
  ]);

  const customer = booking.customer;
  const equipment = booking.equipment;
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
          <p className="mt-1 font-mono text-xs text-muted">Booking {booking.id}</p>
        </div>
        <span className="inline-block rounded-full border border-ink/15 bg-paper px-3 py-1 text-xs font-mono uppercase tracking-widest">
          {booking.status}
        </span>
      </header>

      <section className="mt-10 grid gap-6 sm:grid-cols-2">
        <DetailCard title="Equipment">
          <p className="font-medium">{equipment?.name}</p>
          <p className="font-mono text-xs text-muted">{equipment?.serial}</p>
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
        <DetailCard title="Project address" className="sm:col-span-2">
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
          <div className="flex flex-wrap gap-4 text-sm">
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
              {booking.signed_agreement_pdf_url ? (
                <a href={booking.signed_agreement_pdf_url} target="_blank" rel="noopener" className="underline text-accent">
                  ↗ Download PDF
                </a>
              ) : "Not signed yet (Phase 3)"}
            </p>
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
