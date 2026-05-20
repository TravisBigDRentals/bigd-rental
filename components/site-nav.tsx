import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Customer-facing nav. Reads auth state server-side so the CTA renders
// correctly without a hydration flash. NOT used on /admin/* — those
// pages have their own minimal header.
export async function SiteNav() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const signedIn = !!user;

  return (
    <nav className="sticky top-0 z-20 border-b border-ink/10 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="font-display text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap">
          Big D&rsquo;s Rental Co.
        </Link>
        <ul className="flex items-center gap-2 sm:gap-6 text-sm">
          <li>
            <Link href="/" className="hidden sm:inline-block px-2 py-2 text-ink/80 hover:text-ink transition-colors">
              Home
            </Link>
          </li>
          <li>
            <Link href="/book" className="px-2 py-2 text-ink/80 hover:text-ink transition-colors">
              Rentals
            </Link>
          </li>
          <li>
            <a href="mailto:info@bigdrentals.ca" className="hidden sm:inline-block px-2 py-2 text-ink/80 hover:text-ink transition-colors">
              Contact
            </a>
          </li>
          <li>
            {signedIn ? (
              <Link
                href="/account"
                className="rounded-full bg-accent px-4 sm:px-5 py-2 text-paper font-medium hover:bg-accent-hover transition-colors whitespace-nowrap"
              >
                My account
              </Link>
            ) : (
              <Link
                href="/sign-in?mode=signup"
                className="rounded-full bg-accent px-4 sm:px-5 py-2 text-paper font-medium hover:bg-accent-hover transition-colors whitespace-nowrap"
              >
                Register
              </Link>
            )}
          </li>
        </ul>
      </div>
    </nav>
  );
}
