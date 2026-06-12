-- GST applied on top of rental services. Snapshotted per booking
-- (both cents and rate) so a future tax-rate change doesn't rewrite
-- past totals. See lib/pricing.ts for the math.
--
-- Defaults are 0 / 0.00 so existing bookings continue to satisfy
-- NOT NULL; the booking-create flow is what populates real values.

alter table bookings
  add column if not exists tax_cents integer not null default 0
    check (tax_cents >= 0),
  add column if not exists tax_rate numeric(5, 4) not null default 0
    check (tax_rate >= 0 and tax_rate <= 1);
