import Image from "next/image";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Customer-facing nav. Reads auth state server-side so the CTA renders
// correctly without a hydration flash. NOT used on /admin/* — those
// pages have their own minimal header.
export async function SiteNav() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const signedIn = !!user;

  // Marketing pages live on the WordPress site (sg-host.com); RENT is
  // the only internal route. External links use a plain <a> so we don't
  // hand Next.js routes a non-app URL.
  const MARKETING_HOME = "https://bigdrentals.ca";
  const links = [
    { label: "HOME", href: MARKETING_HOME, external: true },
    { label: "ABOUT", href: "https://bigdrentals.ca/about/", external: true },
    { label: "RENT", href: "/book", external: false },
    { label: "APPAREL", href: "https://bigdrentals.ca/shop/", external: true },
    { label: "CONTACT", href: "https://bigdrentals.ca/contact/", external: true },
  ];

  return (
    <nav className="sticky top-0 z-30 border-b border-ink/10 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-6">
        <a href={MARKETING_HOME} className="flex items-center" aria-label="Big D's Rental Co. home">
          <Image
            src="/brand/big-d-footer-logo.png"
            alt="Big D's Rental Co."
            width={88}
            height={56}
            priority
            className="h-12 w-auto"
          />
        </a>

        <div className="flex items-center gap-8">
          <ul className="hidden md:flex items-center gap-8 font-display tracking-[0.08em] text-sm">
            {links.map((l) => (
              <li key={l.label}>
                {l.external ? (
                  <a
                    href={l.href}
                    className="text-ink/90 hover:text-accent transition-colors"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link
                    href={l.href}
                    className="text-ink/90 hover:text-accent transition-colors"
                  >
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {signedIn ? (
            <Link
              href="/account"
              className="hidden sm:inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-paper font-display tracking-[0.08em] text-sm hover:bg-accent-hover transition-colors"
            >
              MY ACCOUNT
            </Link>
          ) : (
            <Link
              href="/book"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-paper font-display tracking-[0.08em] text-sm hover:bg-accent-hover transition-colors"
            >
              RENT <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
