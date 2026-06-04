import Image from "next/image";
import Link from "next/link";

// Site-wide footer. Mounted by each customer-facing page (admin pages
// have their own minimal chrome and don't render this).
export function SiteFooter() {
  const navLinks = [
    { label: "Home", href: "/" },
    { label: "About", href: "#" },
    { label: "Apparel", href: "#" },
    { label: "Contact", href: "#" },
  ];

  return (
    <footer className="bg-ink text-paper mt-24">
      <div className="max-w-7xl mx-auto px-6 py-14 grid gap-12 md:grid-cols-[1fr_auto] md:items-start">
        <div className="space-y-6">
          <Image
            src="/brand/big-d-footer-logo.png"
            alt="Big D's Rental Co."
            width={140}
            height={88}
            className="h-20 w-auto invert"
          />

          <div className="flex items-center gap-3">
            <a
              href="#"
              aria-label="Instagram"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-paper hover:bg-accent-hover transition-colors"
            >
              <InstagramIcon />
            </a>
            <a
              href="#"
              aria-label="Facebook"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-paper hover:bg-accent-hover transition-colors"
            >
              <FacebookIcon />
            </a>
          </div>

          <Image
            src="/brand/google-review.png"
            alt="Trusted by 50+ customers with 5-star Google reviews."
            width={280}
            height={84}
            className="h-auto w-[280px] max-w-full rounded-md"
          />
        </div>

        <nav className="md:text-right">
          <p className="font-display tracking-[0.08em] text-sm text-paper/70 mb-4 md:mb-6">
            NAVIGATION
          </p>
          <ul className="space-y-3 text-sm">
            {navLinks.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="text-paper/80 hover:text-accent transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-paper/10">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-paper/60">
          <div className="flex items-center gap-5">
            <Link href="#" className="hover:text-paper transition-colors">Terms &amp; Conditions</Link>
            <Link href="#" className="hover:text-paper transition-colors">Privacy Policy</Link>
          </div>
          <p>©2026 All Rights Reserved Big D&rsquo;s Rental Co</p>
          <p>
            Designed by{" "}
            <a
              href="https://distinctivems.com"
              target="_blank"
              rel="noopener"
              className="font-semibold text-paper hover:text-accent transition-colors"
            >
              DistinctiveMS
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.9.3-1.5 1.6-1.5H17V4.2c-.3 0-1.3-.2-2.5-.2-2.5 0-4 1.5-4 4.2v2.3H8v3h2.5V21h3z" />
    </svg>
  );
}
