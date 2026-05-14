import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatCents } from "@/lib/pricing";

export const metadata = {
  title: "Bookings — Big D's Admin",
};

const STATUSES = ["all", "pending_payment", "booked", "delivered", "returned", "closed", "canceled"] as const;
type Status = typeof STATUSES[number];

const STATUS_COLORS: Record<string, string> = {
  pending_payment: "bg-amber-100 text-amber-900 border-amber-300",
  booked:          "bg-emerald-100 text-emerald-900 border-emerald-300",
  delivered:       "bg-sky-100 text-sky-900 border-sky-300",
  returned:        "bg-indigo-100 text-indigo-900 border-indigo-300",
  closed:          "bg-zinc-100 text-zinc-700 border-zinc-300",
  canceled:        "bg-red-100 text-red-900 border-red-300",
};

type BookingRow = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  total_cents: number;
  created_at: string;
  customer: { first_name: string; last_name: string; email: string } | null;
  equipment: { name: string } | null;
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status: rawStatus, q } = await searchParams;
  const status: Status = (STATUSES as readonly string[]).includes(rawStatus ?? "")
    ? (rawStatus as Status)
    : "all";

  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("bookings")
    .select(`
      id, start_date, end_date, status, total_cents, created_at,
      customer:customer_id ( first_name, last_name, email ),
      equipment:equipment_id ( name )
    `)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  const bookings = ((data ?? []) as unknown as BookingRow[]).filter((b) => {
    if (!q) return true;
    const haystack = `${b.customer?.first_name ?? ""} ${b.customer?.last_name ?? ""} ${b.customer?.email ?? ""} ${b.equipment?.name ?? ""}`.toLowerCase();
    return haystack.includes(q.toLowerCase());
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight">Bookings</h1>
        <p className="font-mono text-xs text-muted">{bookings.length} result{bookings.length === 1 ? "" : "s"}</p>
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, email, machine…"
          className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm w-72"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm font-mono"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-full bg-ink text-paper px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Filter
        </button>
        {(status !== "all" || q) && (
          <Link
            href="/admin/bookings"
            className="font-mono text-xs text-muted hover:text-ink"
          >
            Clear
          </Link>
        )}
      </form>

      {error && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error.message}
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-xs uppercase tracking-widest text-muted border-b border-ink/10">
              <th className="py-3 pr-4">Customer</th>
              <th className="py-3 pr-4">Equipment</th>
              <th className="py-3 pr-4">Dates</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4 text-right">Total</th>
              <th className="py-3 pr-4 text-right">Created</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted">
                  No bookings match your filters.
                </td>
              </tr>
            )}
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-ink/5 hover:bg-ink/[0.02]">
                <td className="py-3 pr-4">
                  <Link href={`/admin/bookings/${b.id}`} className="block">
                    <p className="font-medium">
                      {b.customer?.first_name} {b.customer?.last_name}
                    </p>
                    <p className="font-mono text-xs text-muted">{b.customer?.email}</p>
                  </Link>
                </td>
                <td className="py-3 pr-4">{b.equipment?.name}</td>
                <td className="py-3 pr-4 font-mono text-xs">
                  {b.start_date} → {b.end_date}
                </td>
                <td className="py-3 pr-4">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-mono ${STATUS_COLORS[b.status] ?? "bg-ink/5 border-ink/20"}`}>
                    {b.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-right font-mono">{formatCents(b.total_cents)}</td>
                <td className="py-3 pr-4 text-right font-mono text-xs text-muted">
                  {new Date(b.created_at).toLocaleDateString("en-CA")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
