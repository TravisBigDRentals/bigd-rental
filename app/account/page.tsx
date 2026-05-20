import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customers/current";
import { customerSignOutAction } from "@/app/sign-in/actions";
import { SiteNav } from "@/components/site-nav";

export const metadata = {
  title: "My account — Big D's Rental Co.",
};

export default async function AccountPage() {
  const current = await getCurrentCustomer();
  if (!current) {
    redirect("/sign-in?next=/account");
  }

  return (
    <>
      <SiteNav />
      <main className="flex-1 px-6 py-12 sm:py-16">
        <div className="max-w-2xl mx-auto">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            My account
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
            {current.customer
              ? `${current.customer.first_name} ${current.customer.last_name}`
              : "Welcome"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Signed in as <strong>{current.authEmail}</strong>.
          </p>

          {current.customer ? (
            <section className="mt-10 rounded-2xl border border-ink/10 bg-ink/[0.02] p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-muted">
                Saved info
              </p>
              <p className="mt-3 text-sm">
                Your name, phone, addresses, and driver&rsquo;s license are saved
                from your last booking. On your next rental, Step 2 pre-fills —
                you just confirm or update what&rsquo;s changed.
              </p>
            </section>
          ) : (
            <section className="mt-10 rounded-2xl border border-ink/10 bg-ink/[0.02] p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-muted">
                No saved info yet
              </p>
              <p className="mt-3 text-sm">
                Once you complete your first booking, your contact info and
                driver&rsquo;s license will be saved here for quick re-booking.
              </p>
            </section>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/book"
              className="rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover transition-colors"
            >
              Start a booking
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
