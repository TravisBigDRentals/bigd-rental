import { differenceInCalendarDays, parseISO } from "date-fns";

export type AddonSelection = {
  addonId: string;
  dailyRateCents: number;
  quantity: number;
};

export type Discount =
  | { type: "percent"; value: number }   // 1-100
  | { type: "amount"; value: number };   // cents off

export type PricingInput = {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  equipmentDailyRateCents: number;
  addons: AddonSelection[];
  discount?: Discount | null;
};

export type PricingBreakdown = {
  days: number;
  equipmentCents: number;
  addonsCents: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

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
  const equipmentCents = input.equipmentDailyRateCents * days;

  const addonsCents = input.addons.reduce((sum, addon, i) => {
    if (i === 0) return sum; // first addon is free
    return sum + addon.dailyRateCents * days * addon.quantity;
  }, 0);

  const subtotalCents = equipmentCents + addonsCents;
  const discountCents = computeDiscountCents(subtotalCents, input.discount);

  return {
    days,
    equipmentCents,
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
