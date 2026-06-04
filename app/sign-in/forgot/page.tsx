import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata = {
  title: "Reset password — Big D's Rental Co.",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            Big D&rsquo;s Rental
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            Reset your password
          </h1>
          <p className="mt-3 text-sm text-muted">
            Enter the email you used to sign up. We&rsquo;ll send you a link to
            choose a new password.
          </p>
          <div className="mt-8">
            <ForgotPasswordForm />
          </div>
          <p className="mt-6 text-xs text-muted">
            <Link href="/sign-in" className="underline hover:text-ink">
              ← Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
