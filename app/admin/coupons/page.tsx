import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatCents } from "@/lib/pricing";
import { CreateCouponForm } from "./create-form";
import { toggleCouponActiveAction } from "./actions";

export const metadata = {
  title: "Coupons — Big D's Admin",
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

export default async function CouponsAdminPage() {
  const supabase = createSupabaseServiceClient();
  const { data: coupons } = await supabase
    .from("coupons")
    .select("id, code, discount_type, discount_value, max_uses, expires_at, active, created_at")
    .order("created_at", { ascending: false });

  // For each coupon, count usages from bookings. One round-trip per row is
  // fine at admin scale — they manage maybe a few dozen codes total.
  const usageById = new Map<string, number>();
  if (coupons && coupons.length > 0) {
    const ids = (coupons as CouponRow[]).map((c) => c.id);
    const { data: bookingsByCoupon } = await supabase
      .from("bookings")
      .select("coupon_id")
      .in("coupon_id", ids);
    for (const row of bookingsByCoupon ?? []) {
      const id = (row as { coupon_id: string }).coupon_id;
      usageById.set(id, (usageById.get(id) ?? 0) + 1);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Coupons</h1>
        <p className="mt-1 text-sm text-muted">
          Discount codes customers can apply on Step 3 of the booking flow.
        </p>
      </header>

      <section className="mb-12 rounded-2xl border border-ink/10 bg-paper p-6">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted">Create new code</h2>
        <div className="mt-4">
          <CreateCouponForm />
        </div>
      </section>

      <section>
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted mb-3">All codes</h2>
        {!coupons || coupons.length === 0 ? (
          <p className="text-sm text-muted">No coupons yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-ink/10">
            <table className="min-w-full text-sm">
              <thead className="bg-ink/[0.03] text-xs font-mono uppercase tracking-widest text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Discount</th>
                  <th className="px-4 py-3 text-left">Usage</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {(coupons as CouponRow[]).map((c) => {
                  const used = usageById.get(c.id) ?? 0;
                  const expired = c.expires_at && new Date(c.expires_at) <= new Date();
                  const exhausted = c.max_uses !== null && used >= c.max_uses;
                  const live = c.active && !expired && !exhausted;
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
                      <td className="px-4 py-3">
                        {c.discount_type === "percent"
                          ? `${c.discount_value}% off`
                          : `${formatCents(c.discount_value)} off`}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {used}
                        {c.max_uses !== null ? ` / ${c.max_uses}` : " / ∞"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-CA") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-mono uppercase tracking-widest border ${
                          live ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                            : "bg-zinc-100 text-zinc-700 border-zinc-300"
                        }`}>
                          {!c.active ? "off" : expired ? "expired" : exhausted ? "used up" : "active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <form action={toggleCouponActiveAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                          <button
                            type="submit"
                            className="font-mono text-xs uppercase tracking-widest text-muted hover:text-ink"
                          >
                            {c.active ? "Deactivate" : "Reactivate"}
                          </button>
                        </form>
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
