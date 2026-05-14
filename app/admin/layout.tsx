import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "./login/actions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Login page renders without the chrome
  if (!user) return <>{children}</>;

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-ink/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/admin/bookings" className="font-display text-lg font-semibold">
              Big D&rsquo;s Admin
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/admin/bookings" className="hover:text-accent transition-colors">
                Bookings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-muted hidden sm:inline">
              {user.email}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="font-mono text-xs text-muted uppercase tracking-widest hover:text-ink transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
