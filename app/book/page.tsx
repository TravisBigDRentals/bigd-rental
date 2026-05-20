import Link from "next/link";
import { listAddons, listEquipment } from "@/lib/bookings/queries";
import { getCurrentCustomer } from "@/lib/customers/current";
import { BookingForm } from "./booking-form";
import { customerSignOutAction } from "@/app/sign-in/actions";

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
    <main className="flex-1 px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        <header className="mb-10 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-widest text-muted uppercase">
              Calgary, AB · Construction Equipment Rental
            </p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold tracking-tight">
              Book Equipment
            </h1>
          </div>
          <AuthChip current={current} />
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
  );
}

function AuthChip({ current }: { current: Awaited<ReturnType<typeof getCurrentCustomer>> }) {
  if (!current) {
    return (
      <Link
        href="/sign-in?next=/book"
        className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-ink/5 transition-colors"
      >
        Sign in
      </Link>
    );
  }
  return (
    <form action={customerSignOutAction}>
      <button
        type="submit"
        className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-ink/5 transition-colors"
      >
        Sign out
      </button>
    </form>
  );
}
