-- Booking cancellation + refund metadata. Status enum already includes
-- 'canceled' from migration 0001; these columns just track the who/why
-- and the Square refund (if one was issued).

alter table bookings
  add column if not exists canceled_at         timestamptz null,
  add column if not exists canceled_reason     text null,
  add column if not exists refund_id           text null,
  add column if not exists refund_amount_cents integer null check (refund_amount_cents is null or refund_amount_cents >= 0);

create index if not exists bookings_canceled_idx
  on bookings (canceled_at)
  where canceled_at is not null;
