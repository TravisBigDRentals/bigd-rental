import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customers/current";
import { customerSignOutAction } from "@/app/sign-in/actions";
import { SiteNav } from "@/components/site-nav";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatCents } from "@/lib/pricing";

export const metadata = {
  title: "My account — Big D's Rental Co.",
};

type Booking = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  dropoff_time: string | null;
  total_cents: number;
  signed_agreement_pdf_url: string | null;
  created_at: string;
  equipment: { name: string } | { name: string }[] | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending_signature: "Awaiting signature",
  pending_payment: "Awaiting payment",
  booked: "Booked",
  delivered: "Delivered",
  returned: "Returned",
  closed: "Closed",
  canceled: "Canceled",
};

const STATUS_COLORS: Record<string, string> = {
  pending_signature: "bg-amber-100 text-amber-900 border-amber-300",
  pending_payment:   "bg-amber-100 text-amber-900 border-amber-300",
  booked:            "bg-emerald-100 text-emerald-900 border-emerald-300",
  delivered:         "bg-sky-100 text-sky-900 border-sky-300",
  returned:          "bg-indigo-100 text-indigo-900 border-indigo-300",
  closed:            "bg-zinc-100 text-zinc-700 border-zinc-300",
  canceled:          "bg-red-100 text-red-900 border-red-300",
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function AccountPage() {
  const current = await getCurrentCustomer();
  if (!current) {
    redirect("/sign-in?next=/account");
  }

  // Fetch this customer's bookings + signed-PDF download URLs (per-booking
  // signed URLs, scoped to this user since the customer_id matches their
  // own customer row — which is auth-linked).
  let bookings: (Booking & { pdfUrl: string | null })[] = [];
  if (current.customer) {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
      .from("bookings")
      .select(`
        id, status, start_date, end_date, dropoff_time, total_cents,
        signed_agreement_pdf_url, created_at,
        equipment:equipment_id ( name )
      `)
      .eq("customer_id", current.customer.id)
      .order("created_at", { ascending: false });

    bookings = await Promise.all(
      ((data ?? []) as unknown as Booking[]).map(async (b) => {
        let pdfUrl: string | null = null;
        if (b.signed_agreement_pdf_url) {
          const { data: signed } = await supabase.storage
            .from("signed-agreements")
            .createSignedUrl(b.signed_agreement_pdf_url, 60 * 60 * 24 * 7);
          pdfUrl = signed?.signedUrl ?? null;
        }
        return { ...b, pdfUrl };
      }),
    );
  }

  return (
    <>
      <SiteNav />
      <main className="flex-1 px-6 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
            My account
          </h1>
          <p className="mt-3 text-sm text-muted">
            Signed in as <strong>{current.authEmail}</strong>.
          </p>

          <section className="mt-10">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-semibold">Booking history</h2>
              {bookings.length > 0 && (
                <p className="font-mono text-xs text-muted">
                  {bookings.length} booking{bookings.length === 1 ? "" : "s"}
                </p>
              )}
            </div>

            {bookings.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-ink/10 bg-ink/[0.02] p-6">
                <p className="text-sm">
                  No bookings yet. Once you complete your first rental, it&rsquo;ll show
                  up here along with the signed agreement and a quick re-book option.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {bookings.map((b) => {
                  const equipment = unwrap(b.equipment);
                  return (
                    <li
                      key={b.id}
                      className="rounded-2xl border border-ink/10 bg-paper p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-lg font-semibold">
                            {equipment?.name ?? "Rental"}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted">
                            {b.start_date} → {b.end_date}
                            {b.dropoff_time ? ` · ${b.dropoff_time}` : ""}
                          </p>
                        </div>
                        <span
                          className={`inline-block rounded-full border px-3 py-1 text-xs font-mono ${
                            STATUS_COLORS[b.status] ?? "border-ink/15 bg-ink/[0.04] text-muted"
                          }`}
                        >
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="font-display text-xl font-semibold">
                          {formatCents(b.total_cents)}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          {b.pdfUrl && (
                            <a
                              href={b.pdfUrl}
                              target="_blank"
                              rel="noopener"
                              className="text-accent underline hover:opacity-80"
                            >
                              Download agreement (PDF)
                            </a>
                          )}
                          <span className="font-mono text-xs text-muted">
                            {new Date(b.created_at).toLocaleDateString("en-CA")}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Link
              href="/book"
              className="rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover transition-colors"
            >
              Start a new booking
            </Link>
            <form action={customerSignOutAction}>
              <button
                type="submit"
                className="rounded-full border border-ink/15 px-6 py-3 font-medium hover:bg-ink/5 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
