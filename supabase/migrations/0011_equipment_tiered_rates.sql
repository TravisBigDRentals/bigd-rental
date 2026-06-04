-- Tiered equipment pricing.
--
-- Rule (per Rohit / client):
--   1-6  days → daily_rate × days
--   7-29 days → (weekly_rate / 7)  × days   (exact math, kept in cents)
--   30+  days → (monthly_rate / 30) × days   (exact math, kept in cents)
-- The tier picks the effective per-day rate; we multiply by the total
-- days and round once at the cent. Longer-but-cheaper at boundaries is
-- intentional (6 days @ daily > 7 days @ weekly) — encourages longer
-- rentals so owner makes fewer pickup/delivery trips.
--
-- Add-ons are NOT tiered — still daily-rate × days (first one free).

alter table equipment
  add column if not exists weekly_rate_cents  integer null check (weekly_rate_cents  is null or weekly_rate_cents  > 0),
  add column if not exists monthly_rate_cents integer null check (monthly_rate_cents is null or monthly_rate_cents > 0);

-- New rates for the two existing machines.
-- Mini Excavator + Mini Skid Steer: $369.99 / $1,299.99 / $4,999.99.
update equipment
  set daily_rate_cents   = 36999,
      weekly_rate_cents  = 129999,
      monthly_rate_cents = 499999
  where name in ('Kubota U10-5 Mini Excavator', 'Kubota SCL 1000 Mini Skid Steer');
