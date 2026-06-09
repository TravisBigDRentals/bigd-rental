-- 15-minute hold model.
--
-- Old model: any non-canceled booking blocked dates indefinitely, so an
-- abandoned booking held a slot forever. New model:
--   * Paid statuses (booked, delivered, returned, closed) always block.
--   * Pending statuses (pending_signature, pending_payment) block only
--     for 15 minutes after `created_at`. After that, the hold expires
--     and other customers can rent those dates.
--   * Canceled never blocks (unchanged).
--
-- A scheduled cron emails the customer once at the 15-minute mark.
-- abandoned_email_sent_at gates the cron to one-shot semantics.

alter table bookings
  add column if not exists abandoned_email_sent_at timestamptz null;

create or replace function check_double_booking()
returns trigger
language plpgsql
as $$
declare
  conflict_count int;
begin
  select count(*)
    into conflict_count
    from bookings b
    where b.id is distinct from new.id
      and b.status <> 'canceled'
      and (
        -- Paid + post-paid statuses always block.
        b.status in ('booked', 'delivered', 'returned', 'closed')
        -- Pending statuses only block during the 15-minute hold window.
        or (
          b.status in ('pending_signature', 'pending_payment')
          and b.created_at > now() - interval '15 minutes'
        )
      )
      and daterange(b.start_date, b.end_date + 1, '[]')
          && daterange(new.start_date, new.end_date + 1, '[]')
      and (
        b.equipment_id = new.equipment_id
        or (new.extra_equipment_id is not null and b.equipment_id = new.extra_equipment_id)
        or (b.extra_equipment_id is not null and b.extra_equipment_id = new.equipment_id)
        or (
          b.extra_equipment_id is not null
          and new.extra_equipment_id is not null
          and b.extra_equipment_id = new.extra_equipment_id
        )
      );

  if conflict_count > 0 then
    raise exception 'Booking conflicts with existing reservation';
  end if;

  return new;
end;
$$;

-- Trigger re-fires when extra_equipment_id changes too (extended in 0015,
-- kept here for completeness in case 0015 wasn't run yet).
drop trigger if exists bookings_no_double_booking on bookings;
create trigger bookings_no_double_booking
  before insert or update of equipment_id, extra_equipment_id, start_date, end_date, status
  on bookings
  for each row
  execute function check_double_booking();

-- Helps the cron's lookup pattern (oldest pending bookings missing the email).
create index if not exists bookings_pending_abandoned_idx
  on bookings (status, created_at)
  where status in ('pending_signature', 'pending_payment')
    and abandoned_email_sent_at is null;
