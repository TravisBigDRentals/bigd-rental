import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatCents } from "@/lib/pricing";

export const metadata = {
  title: "Coupon detail — Big D's Admin",
};

type CouponRow = {
  id: string;
  code: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  max_uses: number | null;
  expires_at: string | null;
  active: boolean;
  created_at: string;
};

type RedemptionRow = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  total_cents: number;
  discount_cents: number;
  created_at: string;
  customer: { first_name: string; last_name: string; email: string } | { first_name: string; last_name: string; email: string }[] | null;
  equipment: { name: string } | { name: string }[] | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function CouponDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseServiceClient();

  const { data: coupon } = await supabase
    .from("coupons")
    .select("id, code, discount_type, discount_value, max_uses, expires_at, active, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!coupon) notFound();
  const c = coupon as CouponRow;

  const { data: redemptions } = await supabase
    .from("bookings")
    .select(`
      id, start_date, end_date, status, total_cents, discount_cents, created_at,
      customer:customer_id ( first_name, last_name, email ),
      equipment:equipment_id ( name )
    `)
    .eq("coupon_id", id)
    .order("created_at", { ascending: false });

  const rows = (redemptions ?? []) as unknown as RedemptionRow[];
  const used = rows.length;
  const expired = c.expires_at && new Date(c.expires_at) <= new Date();
  const exhausted = c.max_uses !== null && used >= c.max_uses;
  const live = c.active && !expired && !exhausted;

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <Link href="/admin/coupons" className="font-mono text-xs text-muted hover:text-ink uppercase tracking-widest">
        ← All coupons
      </Link>

      <header className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight font-mono">{c.code}</h1>
          <p className="mt-1 text-sm text-muted">
            {c.discount_type === "percent"
              ? `${c.discount_value}% off`
              : `${formatCents(c.discount_value)} off`}
            {" · "}
            Created {new Date(c.created_at).toLocaleDateString("en-CA")}
          </p>
        </div>
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-mono uppercase tracking-widest border ${
          live ? "bg-emerald-100 text-emerald-900 border-emerald-300"
            : "bg-zinc-100 text-zinc-700 border-zinc-300"
        }`}>
          {!c.active ? "off" : expired ? "expired" : exhausted ? "used up" : "active"}
        </span>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Usage" value={`${used}${c.max_uses !== null ? ` / ${c.max_uses}` : " / ∞"}`} />
        <Stat label="Expires" value={c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-CA") : "Never"} />
        <Stat
          label="Total discount given"
          value={formatCents(rows.reduce((sum, r) => sum + r.discount_cents, 0))}
        />
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted mb-3">Redemptions</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No one has used this code yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-ink/10">
            <table className="min-w-full text-sm">
              <thead className="bg-ink/[0.03] text-xs font-mono uppercase tracking-widest text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Equipment</th>
                  <th className="px-4 py-3 text-left">Dates</th>
                  <th className="px-4 py-3 text-left">Discount</th>
                  <th className="px-4 py-3 text-left">Total</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {rows.map((r) => {
                  const customer = unwrap(r.customer);
                  const equipment = unwrap(r.equipment);
                  return (
                    <tr key={r.id} className="hover:bg-ink/[0.02]">
                      <td className="px-4 py-3">
                        <Link href={`/admin/bookings/${r.id}`} className="hover:underline">
                          <div className="font-medium">
                            {customer ? `${customer.first_name} ${customer.last_name}` : "—"}
                          </div>
                          <div className="font-mono text-xs text-muted">{customer?.email ?? ""}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">{equipment?.name ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.start_date} → {r.end_date}
                      </td>
                      <td className="px-4 py-3 text-emerald-800 font-mono">
                        −{formatCents(r.discount_cents)}
                      </td>
                      <td className="px-4 py-3 font-mono">{formatCents(r.total_cents)}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs uppercase tracking-widest text-muted">
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">
                        {new Date(r.created_at).toLocaleDateString("en-CA")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
    </div>
  );
}
