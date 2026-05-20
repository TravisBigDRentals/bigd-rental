import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customers/current";
import { customerSignOutAction } from "@/app/sign-in/actions";
import { SiteNav } from "@/components/site-nav";
import { AccountSectionNav } from "./_components/section-nav";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Single source of auth check for the whole /account/* tree.
  const current = await getCurrentCustomer();
  if (!current) {
    redirect("/sign-in?next=/account");
  }

  return (
    <>
      <SiteNav />
      <main className="flex-1 px-6 py-10 sm:py-12">
        <div className="max-w-5xl mx-auto">
          <header className="mb-8">
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
              My account
            </h1>
            <p className="mt-2 text-sm text-muted">
              Signed in as <strong>{current.authEmail}</strong>.
            </p>
          </header>

          <div className="flex flex-col md:flex-row gap-8">
            <aside className="md:w-56 md:shrink-0">
              <AccountSectionNav />
              <form action={customerSignOutAction} className="hidden md:block mt-6">
                <button
                  type="submit"
                  className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70 hover:text-ink hover:bg-ink/[0.04] transition-colors"
                >
                  Sign out
                </button>
              </form>
            </aside>
            <div className="flex-1 min-w-0">{children}</div>
          </div>

          <form action={customerSignOutAction} className="mt-8 md:hidden">
            <button
              type="submit"
              className="rounded-full border border-ink/15 px-6 py-3 text-sm font-medium hover:bg-ink/5 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
