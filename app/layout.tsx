import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";

// Custom display + sans fonts (Anton, Degular) are loaded via @font-face
// in globals.css from /public/fonts. Space Mono is still served via
// next/font since we don't bundle it locally.
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Big D's Rental Co. — Equipment Rentals in Calgary",
  description:
    "Book construction equipment online. Mini excavators, skid steers, and attachments. Calgary, AB.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${spaceMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
