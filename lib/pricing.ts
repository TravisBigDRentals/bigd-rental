import { differenceInCalendarDays, parseISO } from "date-fns";

export type AddonSelection = {
  addonId: string;
  dailyRateCents: number;
  // Optional tier rates. When null/undefined for an addon, that tier
  // falls back to daily × days — mirrors the equipment tier behaviour
  // for back-compat with any addon row created before tiered rates.
  weeklyRateCents?: number | null;
  monthlyRateCents?: number | null;
  quantity: number;
};

// Optional liability waiver — flat fee, NOT discountable. If the
// customer opts in we add this AFTER the discount is applied, so a
// 100%-off coupon on a $1000 rental still owes the $499.99 waiver.
// Snapshotted on each booking at the moment of submission so future
// price changes don't rewrite past totals.
export const LIABILITY_WAIVER_CENTS = 49999;

// Canadian GST applied to all rental services (equipment, extras,
// add-ons, liability waiver). Rates on equipment + add-ons are stored
// tax-EXCLUSIVE — GST sits on top. Alberta has no PST, so 5% is the
// full sales tax. Snapshotted per booking via bookings.tax_rate so a
// future rate change doesn't rewrite past totals.
export const GST_RATE = 0.05;

export type Discount =
  | { type: "percent"; value: number }   // 1-100
  | { type: "amount"; value: number };   // cents off

export type ExtraEquipmentInput = {
  dailyRateCents: number;
  weeklyRateCents?: number | null;
  monthlyRateCents?: number | null;
};

export type PricingInput = {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  equipmentDailyRateCents: number;
  // Optional tiered rates. When null/undefined, falls back to daily × days
  // for every length (back-compat for any equipment row added before the
  // tiered-rates migration).
  equipmentWeeklyRateCents?: number | null;
  equipmentMonthlyRateCents?: number | null;
  // Optional secondary machine (currently only the TMG Plate Compactor).
  // Priced the same way as the main equipment — tiered by rental days.
  extraEquipment?: ExtraEquipmentInput | null;
  addons: AddonSelection[];
  liabilityWaiverOptIn?: boolean;
  discount?: Discount | null;
};

export type PricingTier = "daily" | "weekly" | "monthly";

export type PricingBreakdown = {
  days: number;
  equipmentCents: number;
  equipmentTier: PricingTier;
  equipmentEffectiveDailyCents: number;  // per-day rate at the tier
  extraEquipmentCents: number;
  extraEquipmentTier: PricingTier | null; // null when no extra picked
  addonsCents: number;
  // subtotalCents = equipment + extra + addons. This is what the
  // discount applies to. The waiver sits outside it.
  subtotalCents: number;
  discountCents: number;
  liabilityWaiverCents: number;  // 0 or LIABILITY_WAIVER_CENTS
  // GST sits on top of (subtotal − discount) + waiver. Rate is
  // snapshotted per booking so future rate changes don't rewrite
  // past totals.
  taxRate: number;               // e.g. 0.05 for 5% GST
  taxCents: number;
  totalCents: number;
};

// Pick the tier and effective per-day rate based on how many days the
// customer is renting for. Returns the daily-equivalent in cents (used
// to compute equipment subtotal as effective * days). When the tier
// rate is missing, falls back to plain daily for that tier.
export function selectEquipmentTier(
  days: number,
  dailyCents: number,
  weeklyCents?: number | null,
  monthlyCents?: number | null,
): { tier: PricingTier; effectiveDailyCents: number } {
  if (days >= 30 && monthlyCents && monthlyCents > 0) {
    return { tier: "monthly", effectiveDailyCents: monthlyCents / 30 };
  }
  if (days >= 7 && weeklyCents && weeklyCents > 0) {
    return { tier: "weekly", effectiveDailyCents: weeklyCents / 7 };
  }
  return { tier: "daily", effectiveDailyCents: dailyCents };
}

// Rental days = end_date − delivery_date.
//
// `end_date` is when Big D's PICKS UP the equipment (morning of), not the
// last day the customer has it. So a May 21 → May 22 rental is 24 hours = 1
// day. Same model as hotel check-in/check-out (check-out date is not a
// billed night). Floor of 1 so a same-day delivery/pickup mistake doesn't
// produce a $0 booking — validation in the form should prevent that case.
export function rentalDays(startDate: string, endDate: string): number {
  const days = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
  return Math.max(1, days);
}

// Pricing rule (per CLAUDE.md): the first selected add-on is free; each
// additional add-on is billed at its `daily_rate_cents` × days × quantity.
export function calculatePricing(input: PricingInput): PricingBreakdown {
  const days = rentalDays(input.startDate, input.endDate);
  const { tier, effectiveDailyCents } = selectEquipmentTier(
    days,
    input.equipmentDailyRateCents,
    input.equipmentWeeklyRateCents,
    input.equipmentMonthlyRateCents,
  );
  // Round once at the equipment subtotal — weekly/monthly tiers produce
  // non-integer cents per day, but the customer total is always in
  // whole cents.
  const equipmentCents = Math.round(effectiveDailyCents * days);

  // Extra machine (plate compactor) uses the same tiered pricing logic
  // as the main equipment. It does NOT take the "first addon free"
  // slot — that's reserved for attachments only.
  let extraEquipmentCents = 0;
  let extraEquipmentTier: PricingTier | null = null;
  if (input.extraEquipment) {
    const xt = selectEquipmentTier(
      days,
      input.extraEquipment.dailyRateCents,
      input.extraEquipment.weeklyRateCents,
      input.extraEquipment.monthlyRateCents,
    );
    extraEquipmentTier = xt.tier;
    extraEquipmentCents = Math.round(xt.effectiveDailyCents * days);
  }

  const addonsCents = input.addons.reduce((sum, addon, i) => {
    if (i === 0) return sum; // first addon is free
    // Pick a tier the same way equipment does — weekly/monthly is just
    // a discounted prepaid block, so daily × days at the effective tier
    // rate is the right model.
    const { effectiveDailyCents } = selectEquipmentTier(
      days,
      addon.dailyRateCents,
      addon.weeklyRateCents,
      addon.monthlyRateCents,
    );
    return sum + Math.round(effectiveDailyCents * days) * addon.quantity;
  }, 0);

  const subtotalCents = equipmentCents + extraEquipmentCents + addonsCents;
  const discountCents = computeDiscountCents(subtotalCents, input.discount);
  const liabilityWaiverCents = input.liabilityWaiverOptIn ? LIABILITY_WAIVER_CENTS : 0;

  // Taxable base = what the customer actually pays for the rental.
  // Discount comes off first, then waiver is added; GST applies to
  // the whole package. Rounded to whole cents.
  const preTaxCents = Math.max(0, subtotalCents - discountCents) + liabilityWaiverCents;
  const taxCents = Math.round(preTaxCents * GST_RATE);

  return {
    days,
    equipmentCents,
    equipmentTier: tier,
    equipmentEffectiveDailyCents: effectiveDailyCents,
    extraEquipmentCents,
    extraEquipmentTier,
    addonsCents,
    subtotalCents,
    discountCents,
    liabilityWaiverCents,
    taxRate: GST_RATE,
    taxCents,
    totalCents: preTaxCents + taxCents,
  };
}

// Discount is clamped to the subtotal so a $100-off code on a $40 booking
// becomes a $40 discount (the booking total floors at $0, never negative).
export function computeDiscountCents(subtotalCents: number, discount?: Discount | null): number {
  if (!discount) return 0;
  const raw = discount.type === "percent"
    ? Math.floor((subtotalCents * discount.value) / 100)
    : discount.value;
  return Math.min(Math.max(0, raw), subtotalCents);
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
