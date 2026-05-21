import { listAddons, listEquipment } from "@/lib/bookings/queries";
import { getCurrentCustomer } from "@/lib/customers/current";
import { BookingForm } from "./booking-form";
import { SiteNav } from "@/components/site-nav";

export const metadata = {
  title: "Book Equipment — Big D's Rental Co.",
};

export default async function BookPage() {
  const [equipment, addons, current] = await Promise.all([
    listEquipment(),
    listAddons(),
    getCurrentCustomer(),
  ]);

  return (
  <>
    <SiteNav />
    <main className="flex-1 px-6 py-12 sm:py-16">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            Calgary, AB · Construction Equipment Rental
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold tracking-tight">
            Book Equipment
          </h1>
        </header>

        {current && !current.customer && (
          <p className="mb-6 rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm text-muted">
            Signed in as <strong>{current.authEmail}</strong>. Your info will be
            saved on your first booking so it pre-fills next time.
          </p>
        )}
        {current?.customer && (
          <p className="mb-6 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
            Signed in as <strong>{current.customer.first_name} {current.customer.last_name}</strong>.
            Step 2 is pre-filled — review and update anything that&rsquo;s changed.
          </p>
        )}

        <BookingForm
          equipment={equipment}
          addons={addons}
          initialCustomer={current?.customer ?? null}
          isAuthenticated={!!current}
          authEmail={current?.authEmail ?? null}
        />
      </div>
    </main>
  </>
  );
}
