"use client";

import type { Addon, Equipment } from "@/lib/bookings/queries";
import { computeDiscountCents, formatCents, rentalDays, selectEquipmentTier, type Discount, type PricingTier } from "@/lib/pricing";

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

  let equipmentSubtotal = 0;
  let tier: PricingTier = "daily";
  if (equipment && haveDates) {
    const sel = selectEquipmentTier(
      days,
      equipment.daily_rate_cents,
      equipment.weekly_rate_cents,
      equipment.monthly_rate_cents,
    );
    tier = sel.tier;
    equipmentSubtotal = Math.round(sel.effectiveDailyCents * days);
  }

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
    tier,
    discountCents,
    total: Math.max(0, subtotal - discountCents),
  };
}

function tierLabel(tier: PricingTier, equipment: { daily_rate_cents: number; weekly_rate_cents: number | null; monthly_rate_cents: number | null }, days: number): string {
  if (tier === "monthly" && equipment.monthly_rate_cents) {
    return `${formatCents(equipment.monthly_rate_cents)}/mo · ${days} day${days === 1 ? "" : "s"}`;
  }
  if (tier === "weekly" && equipment.weekly_rate_cents) {
    return `${formatCents(equipment.weekly_rate_cents)}/wk · ${days} day${days === 1 ? "" : "s"}`;
  }
  return `${formatCents(equipment.daily_rate_cents)}/day${days > 0 ? ` × ${days}` : ""}`;
}

// Desktop: sticky sidebar. Single grid child so the parent CSS Grid
// sees only one item per column and sticky context works correctly.
export function PricingWidget(props: PricingProps) {
  const { equipment, selectedAddons, appliedCoupon, nextLabel, nextDisabled, onNext, loading } = props;
  const { days, haveDates, equipmentSubtotal, tier, discountCents, total } = computeTotals(props);

  return (
    <aside className="hidden lg:block lg:sticky lg:top-24 self-start">
      <div className="rounded-xl border border-ink/10 bg-ink/[0.04] p-5">
        <p className="font-display tracking-[0.12em] text-xs uppercase text-muted">
          {haveDates
            ? <>Your rental · {days} day{days === 1 ? "" : "s"}</>
            : "Your rental"}
        </p>

        <ul className="mt-5 space-y-3">
          {equipment ? (
            <li className="rounded-lg bg-paper border border-ink/10 px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display tracking-wide uppercase text-sm truncate">{equipment.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted">
                  {haveDates
                    ? tierLabel(tier, equipment, days)
                    : `${formatCents(equipment.daily_rate_cents)}/day`}
                </p>
              </div>
              <span className="font-mono text-sm font-semibold whitespace-nowrap">
                {haveDates ? formatCents(equipmentSubtotal) : "—"}
              </span>
            </li>
          ) : (
            <li className="rounded-lg bg-paper border border-ink/10 px-4 py-6 text-center font-display tracking-wide uppercase text-sm text-ink/40">
              Pick a machine
            </li>
          )}

          {selectedAddons.map((a, i) => {
            const isFree = i === 0;
            const sub = isFree || !haveDates ? 0 : a.daily_rate_cents * days;
            return (
              <li key={a.id} className="rounded-lg bg-paper border border-ink/10 px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display tracking-wide uppercase text-sm truncate">{a.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">
                    {isFree ? "First attachment — free" : `${formatCents(a.daily_rate_cents)}/day${haveDates ? ` × ${days}` : ""}`}
                  </p>
                </div>
                <span className="font-mono text-sm font-semibold whitespace-nowrap">
                  {isFree ? "Free" : haveDates ? formatCents(sub) : "—"}
                </span>
              </li>
            );
          })}
        </ul>

        {appliedCoupon && discountCents > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-emerald-800">
            <span>
              Discount{" "}
              <span className="font-mono text-xs text-emerald-700">({appliedCoupon.code})</span>
            </span>
            <span className="font-mono whitespace-nowrap">−{formatCents(discountCents)}</span>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-ink/15 flex items-end justify-between gap-3">
          <span className="font-display text-2xl tracking-wide uppercase">Total</span>
          <span className="font-display text-3xl tracking-wide">
            {haveDates ? formatCents(total) : "—"}
          </span>
        </div>
        {!haveDates && (equipment || selectedAddons.length > 0) && (
          <p className="mt-2 text-xs text-muted text-right">
            Pick rental dates to see your total.
          </p>
        )}

        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || !!loading}
          className="mt-5 w-full rounded-md bg-accent px-6 py-3.5 text-paper font-display tracking-[0.1em] text-sm uppercase hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {loading ? "…" : nextLabel}
        </button>
      </div>
    </aside>
  );
}

// Mobile: fixed bottom bar. Lives OUTSIDE the form's grid so it
// doesn't take up a grid cell.
export function PricingMobileBar(props: PricingProps) {
  const { nextLabel, nextDisabled, onNext, loading } = props;
  const { haveDates, total, days } = computeTotals(props);

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-ink/15 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85 shadow-[0_-4px_12px_rgba(15,17,20,0.06)]">
      <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display tracking-[0.12em] text-[10px] uppercase text-muted truncate">
            {haveDates ? `Total · ${days} day${days === 1 ? "" : "s"}` : "Total"}
          </p>
          <p className="font-display text-2xl tracking-wide">
            {haveDates ? formatCents(total) : "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || !!loading}
          className="rounded-md bg-accent px-5 py-2.5 text-paper font-display tracking-[0.08em] text-xs uppercase hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? "…" : nextLabel}
        </button>
      </div>
    </div>
  );
}
