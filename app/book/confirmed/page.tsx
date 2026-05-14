import { notFound } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatCents } from "@/lib/pricing";

export const metadata = {
  title: "Booking received — Big D's Rental Co.",
};

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  if (!id) notFound();

  const supabase = createSupabaseServiceClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(`
      id, start_date, end_date, dropoff_time, total_cents, status,
      equipment:equipment_id ( name, serial ),
      customer:customer_id ( name, email )
    `)
    .eq("id", id)
    .single();

  if (!booking) notFound();

  return (
    <main className="flex-1 px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <p className="font-mono text-xs tracking-widest text-muted uppercase">
          Booking received
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold tracking-tight">
          Thanks{
            // @ts-expect-error Supabase nested-select returns object, not array
            booking.customer?.name ? `, ${booking.customer.name.split(" ")[0]}` : ""
          }.
        </h1>
        <p className="mt-4 text-lg text-ink/80">
          We&rsquo;ve held your dates. Next, we&rsquo;ll have you sign the rental agreement and pay — coming in Phases 3 and 4 of this build.
        </p>

        <div className="mt-10 rounded-2xl border border-ink/10 bg-ink/[0.02] p-6 space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-muted">Booking ID</span>
            <span className="font-mono text-sm">{booking.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted">Equipment</span>
            <span className="text-sm">
              {/* @ts-expect-error nested select shape */}
              {booking.equipment?.name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted">Dates</span>
            <span className="text-sm">{booking.start_date} → {booking.end_date}</span>
          </div>
          {booking.dropoff_time && (
            <div className="flex justify-between">
              <span className="text-sm text-muted">Drop-off</span>
              <span className="text-sm">{booking.dropoff_time}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-ink/10 pt-3">
            <span className="text-sm text-muted">Status</span>
            <span className="font-mono text-xs uppercase tracking-widest">
              {booking.status}
            </span>
          </div>
          <div className="flex justify-between font-display text-xl font-semibold">
            <span>Total</span>
            <span>{formatCents(booking.total_cents)}</span>
          </div>
        </div>

        <p className="mt-8 font-mono text-xs text-muted">
          A confirmation email is coming once Phase 4 (payments) is live.
        </p>
      </div>
    </main>
  );
}
