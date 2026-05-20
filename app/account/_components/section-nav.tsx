"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { label: string; href: string; external?: boolean }[] = [
  { label: "Account details", href: "/account/details" },
  { label: "Booking history", href: "/account/history" },
  // Swap this href when the real contact page URL is known. Placeholder
  // is the company email — works on any client + safe to ship.
  { label: "Support / Contact", href: "mailto:info@bigdrentals.ca", external: true },
];

export function AccountSectionNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account sections">
      {/* Mobile: top tabs (horizontal scroll if needed). Desktop: vertical list. */}
      <ul className="flex md:flex-col gap-1 md:gap-1 overflow-x-auto md:overflow-visible -mx-2 md:mx-0 px-2 md:px-0">
        {ITEMS.map((item) => {
          const active = !item.external && pathname.startsWith(item.href);
          const baseClass = "block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors";
          const stateClass = active
            ? "bg-accent/10 text-ink font-medium border border-accent/30 md:border-accent/30"
            : "text-ink/70 hover:text-ink hover:bg-ink/[0.04]";
          if (item.external) {
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={`${baseClass} ${stateClass}`}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noopener" : undefined}
                >
                  {item.label}
                </a>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link href={item.href} className={`${baseClass} ${stateClass}`}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
