"use client";

import type { Addon, Equipment } from "@/lib/bookings/queries";
import { computeDiscountCents, formatCents, rentalDays, type Discount } from "@/lib/pricing";

type PricingProps = {
  equipment: Equipment | null;
  startDate: string;
  endDate: string;
  selectedAddons: Addon[];
  appliedCoupon?: { code: string; discount_type: "percent" | "amount"; discount_value: number } | null;
  nextLabel: string;
  nextDisabled: boolean;
  onNext: () => void;
  loading?: boolean;
};

function computeTotals({ equipment, startDate, endDate, selectedAddons, appliedCoupon }: Pick<PricingProps, "equipment" | "startDate" | "endDate" | "selectedAddons" | "appliedCoupon">) {
  const days = startDate && endDate ? rentalDays(startDate, endDate) : 0;
  const haveDates = days > 0;
  const equipmentSubtotal = equipment && haveDates ? equipment.daily_rate_cents * days : 0;
  const addonsSubtotal = selectedAddons.reduce((sum, a, i) => {
    if (!haveDates) return sum;
    if (i === 0) return sum;
    return sum + a.daily_rate_cents * days;
  }, 0);
  const subtotal = equipmentSubtotal + addonsSubtotal;
  const discount: Discount | null = appliedCoupon
    ? { type: appliedCoupon.discount_type, value: appliedCoupon.discount_value }
    : null;
  const discountCents = computeDiscountCents(subtotal, discount);
  return {
    days, haveDates, equipmentSubtotal, addonsSubtotal,
    discountCents,
    total: Math.max(0, subtotal - discountCents),
  };
}

// Desktop: sticky sidebar that sits inside the form's grid as the
// right column. Single grid child so the parent CSS Grid sees only
// one item per column (form + this) and the sticky context works
// cleanly inside its grid cell.
export function PricingWidget(props: PricingProps) {
  const { equipment, selectedAddons, appliedCoupon, nextLabel, nextDisabled, onNext, loading } = props;
  const { days, haveDates, equipmentSubtotal, discountCents, total } = computeTotals(props);
  const dayCountLabel = haveDates ? `${days} day${days === 1 ? "" : "s"}` : "Pick dates to see your total";

  return (
    <aside className="hidden lg:block lg:sticky lg:top-20 self-start">
      <div className="rounded-2xl border border-ink/15 bg-paper p-5 shadow-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          {haveDates ? `Your rental · ${dayCountLabel}` : "Your rental"}
        </p>

        <ul className="mt-4 space-y-3 text-sm">
          {equipment ? (
            <li className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{equipment.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {formatCents(equipment.daily_rate_cents)}/day{haveDates ? ` × ${days}` : ""}
                </p>
              </div>
              <span className="font-mono whitespace-nowrap">
                {haveDates ? formatCents(equipmentSubtotal) : "—"}
              </span>
            </li>
          ) : (
            <li className="text-muted text-sm">Pick a machine →</li>
          )}

          {selectedAddons.map((a, i) => {
            const isFree = i === 0;
            const sub = isFree || !haveDates ? 0 : a.daily_rate_cents * days;
            return (
              <li key={a.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {isFree ? "First attachment — free" : `${formatCents(a.daily_rate_cents)}/day${haveDates ? ` × ${days}` : ""}`}
                  </p>
                </div>
                <span className="font-mono whitespace-nowrap">
                  {isFree ? "Free" : haveDates ? formatCents(sub) : "—"}
                </span>
              </li>
            );
          })}
        </ul>

        {!haveDates && equipment && (
          <p className="mt-4 text-xs text-muted">{dayCountLabel}</p>
        )}

        {appliedCoupon && discountCents > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-emerald-800">
            <span>
              Discount{" "}
              <span className="font-mono text-xs text-emerald-700">({appliedCoupon.code})</span>
            </span>
            <span className="font-mono whitespace-nowrap">−{formatCents(discountCents)}</span>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-ink/10 flex items-end justify-between gap-3">
          <span className="font-display text-lg font-semibold">Total</span>
          <span className="font-display text-2xl font-bold">
            {haveDates ? formatCents(total) : "—"}
          </span>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || !!loading}
          className="mt-5 w-full rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {loading ? "…" : nextLabel}
        </button>
      </div>
    </aside>
  );
}

// Mobile: fixed bottom bar. Lives OUTSIDE the form's grid so it
// doesn't take up a grid cell (which was breaking the desktop
// sidebar's sticky positioning).
export function PricingMobileBar(props: PricingProps) {
  const { nextLabel, nextDisabled, onNext, loading } = props;
  const { haveDates, total, days } = computeTotals(props);

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-ink/15 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85 shadow-[0_-4px_12px_rgba(15,17,20,0.06)]">
      <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-widest text-muted truncate">
            {haveDates ? `Total · ${days} day${days === 1 ? "" : "s"}` : "Total"}
          </p>
          <p className="font-display text-xl font-bold">
            {haveDates ? formatCents(total) : "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || !!loading}
          className="rounded-full bg-accent px-5 py-2.5 text-paper text-sm font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? "…" : nextLabel}
        </button>
      </div>
    </div>
  );
}
