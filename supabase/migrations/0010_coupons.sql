-- Coupons + per-booking discount snapshot.
--
-- Codes are stored uppercase, looked up uppercase. Discount type is
-- either 'percent' (1-100) or 'amount' (cents). max_uses null = unlimited
-- (until expires_at or active=false). times_used is NOT a column — we
-- COUNT(bookings WHERE coupon_id = X) at validation time so abandoned
-- bookings still count against the cap (simpler than a counter with
-- decrement-on-cancel).

create table coupons (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  discount_type   text not null check (discount_type in ('percent', 'amount')),
  discount_value  integer not null check (discount_value > 0),
  max_uses        integer null check (max_uses is null or max_uses > 0),
  expires_at      timestamptz null,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Per-booking discount snapshot. coupon_id is nullable because most
-- bookings won't have one; discount_cents defaults to 0.
alter table bookings
  add column if not exists coupon_id      uuid null references coupons(id) on delete set null,
  add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0);

create index bookings_coupon_idx on bookings (coupon_id) where coupon_id is not null;

-- RLS: only the service role talks to this table (admin pages + the
-- booking-create + validate-coupon endpoints all use service client).
-- No anon/auth-user reads or writes.
alter table coupons enable row level security;
