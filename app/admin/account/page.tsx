import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = {
  title: "Account — Big D's Admin",
};

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <Link
        href="/admin/bookings"
        className="font-mono text-xs text-muted hover:text-ink uppercase tracking-widest"
      >
        ← Bookings
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Account</h1>
      <p className="mt-2 text-sm text-muted">
        Signed in as <strong>{user?.email}</strong>.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">Change password</h2>
        <p className="mt-1 text-sm text-muted">
          New password applies immediately. You stay signed in on this device.
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </section>
    </main>
  );
}
