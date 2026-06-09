-- Optional Liability Waiver — flat $400 fee (snapshotted per booking
-- so future price changes don't rewrite past totals). Excluded from
-- coupon discounts; see lib/pricing.ts for the math.

alter table bookings
  add column if not exists liability_waiver_cents integer not null default 0
    check (liability_waiver_cents >= 0);
