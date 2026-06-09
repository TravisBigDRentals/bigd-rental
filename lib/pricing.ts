import { differenceInCalendarDays, parseISO } from "date-fns";

export type AddonSelection = {
  addonId: string;
  dailyRateCents: number;
  quantity: number;
};

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
  subtotalCents: number;
  discountCents: number;
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
    return sum + addon.dailyRateCents * days * addon.quantity;
  }, 0);

  const subtotalCents = equipmentCents + extraEquipmentCents + addonsCents;
  const discountCents = computeDiscountCents(subtotalCents, input.discount);

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
    totalCents: Math.max(0, subtotalCents - discountCents),
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
