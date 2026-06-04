import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-form";

export const metadata = {
  title: "Choose a new password — Big D's Rental Co.",
};

export default async function ResetPasswordPage() {
  // The /auth/callback handler exchanged the recovery code for a session
  // before redirecting here. If there's no session, the link expired or
  // was opened in a different browser — send them back to /forgot.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const hasSession = !!user;

  return (
    <>
      <SiteNav />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            Big D&rsquo;s Rental
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            Choose a new password
          </h1>
          {hasSession ? (
            <>
              <p className="mt-3 text-sm text-muted">
                For <strong>{user.email}</strong>. Pick at least 8 characters.
              </p>
              <div className="mt-8">
                <ResetPasswordForm />
              </div>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted">
                This reset link is expired or invalid. Request a new one.
              </p>
              <div className="mt-8">
                <Link
                  href="/sign-in/forgot"
                  className="inline-block rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover transition-colors"
                >
                  Send a new link
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
