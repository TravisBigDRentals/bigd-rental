-- Tiered pricing for attachments + auger catalog refresh.
--
-- 1. Add weekly/monthly rate columns to addons (mirrors equipment tier).
--    Nullable so existing rows + back-compat code keep working — pricing
--    helper falls back to daily × days when a tier is absent.
-- 2. Mirror the same columns on booking_addons so each booking SNAPSHOTS
--    the tiered rates at submission time (future price changes don't
--    rewrite past totals — same rule we follow for equipment + waiver).
-- 3. Apply the new attachment pricing across the board:
--    $25.00 / $119.99 / $349.99 per day / week / month.
-- 4. Replace the generic "Boxer Auger ML1100" entry with two
--    bit-specific entries (9" and 12"). DELETE is safe pre-launch
--    because no historical booking_addons reference it; if any do, the
--    FK is on delete restrict and the migration will fail loudly.

alter table addons
  add column if not exists weekly_rate_cents integer
    check (weekly_rate_cents is null or weekly_rate_cents >= 0),
  add column if not exists monthly_rate_cents integer
    check (monthly_rate_cents is null or monthly_rate_cents >= 0);

alter table booking_addons
  add column if not exists weekly_rate_cents integer
    check (weekly_rate_cents is null or weekly_rate_cents >= 0),
  add column if not exists monthly_rate_cents integer
    check (monthly_rate_cents is null or monthly_rate_cents >= 0);

update addons
set
  daily_rate_cents   = 2500,
  weekly_rate_cents  = 11999,
  monthly_rate_cents = 34999;

delete from addons where name = 'Boxer Auger ML1100';

insert into addons (name, daily_rate_cents, weekly_rate_cents, monthly_rate_cents, compatible_equipment_type, image_url)
values
  ('Boxer Auger 9" bit (Model ML1100, SN 20020571)',  2500, 11999, 34999, 'skid_steer', 'MS_Auger.jpeg'),
  ('Boxer Auger 12" bit (Model ML1100, SN 20020571)', 2500, 11999, 34999, 'skid_steer', 'MS_Auger.jpeg')
on conflict (name) do nothing;
