import { differenceInCalendarDays, parseISO } from "date-fns";

export type AddonSelection = {
  addonId: string;
  dailyRateCents: number;
  quantity: number;
};

export type PricingInput = {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  equipmentDailyRateCents: number;
  addons: AddonSelection[];
};

export type PricingBreakdown = {
  days: number;
  equipmentCents: number;
  addonsCents: number;
  totalCents: number;
};

export function rentalDays(startDate: string, endDate: string): number {
  const days = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
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

  return {
    days,
    equipmentCents,
    addonsCents,
    totalCents: equipmentCents + addonsCents,
  };
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
