import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { SignPad } from "./sign-pad";

export const metadata = {
  title: "Sign your rental agreement — Big D's Rental Co.",
};

type BookingForSign = {
  id: string;
  signed_agreement_pdf_url: string | null;
  status: string;
  equipment: { name: string } | { name: string }[] | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StandaloneSignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, signed_agreement_pdf_url, status, equipment:equipment_id ( name )")
    .eq("id", id)
    .single();

  if (error || !data) notFound();
  const booking = data as unknown as BookingForSign;
  const equipment = unwrap(booking.equipment);
  const alreadySigned = !!booking.signed_agreement_pdf_url;

  return (
    <>
      <SiteNav />
      <main className="flex-1 px-6 py-12 sm:py-16">
        <div className="max-w-2xl mx-auto">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            Booking {booking.id}
          </p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Sign your rental agreement
          </h1>
          {equipment && (
            <p className="mt-2 text-sm text-muted">For: {equipment.name}</p>
          )}

          {alreadySigned ? (
            <div className="mt-10 rounded-2xl border border-emerald-300 bg-emerald-50 px-6 py-6">
              <p className="font-medium text-emerald-900">
                ✓ This agreement has already been signed.
              </p>
              <p className="mt-2 text-sm text-emerald-900/80">
                No further action needed. Your booking is confirmed.
              </p>
              <Link
                href="/"
                className="mt-5 inline-block rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover transition-colors"
              >
                ← Back to home
              </Link>
            </div>
          ) : (
            <div className="mt-8">
              <SignPad bookingId={booking.id} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
