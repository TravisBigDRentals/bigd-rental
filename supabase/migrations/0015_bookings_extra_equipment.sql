-- Add a nullable "extra equipment" slot to bookings — a second machine
-- (currently the TMG Plate Compactor) that the customer can rent
-- alongside the main machine. Pricing uses the equipment row's normal
-- tier rates. Compactors are filtered out of the main "Pick a machine"
-- list in the UI; they appear under their own section after a main
-- machine is selected.
--
-- ALSO extends check_double_booking() so a new booking is rejected if
-- *either* slot collides with an existing booking's main or extra slot.

alter table bookings
  add column if not exists extra_equipment_id uuid null references equipment(id) on delete set null;

create index if not exists bookings_extra_equipment_dates_idx
  on bookings (extra_equipment_id, start_date, end_date)
  where extra_equipment_id is not null;

create or replace function check_double_booking()
returns trigger
language plpgsql
as $$
declare
  conflict_count int;
begin
  -- Both slots get the same inspection buffer (existing trigger logic).
  -- We check each of the new booking's slots (main, extra) against each
  -- of the existing bookings' slots, ignoring canceled rows and the
  -- in-flight row itself.
  select count(*)
    into conflict_count
    from bookings b
    where b.id is distinct from new.id
      and b.status <> 'canceled'
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

-- Replace the existing trigger so it re-fires when extra_equipment_id
-- changes too.
drop trigger if exists bookings_no_double_booking on bookings;
create trigger bookings_no_double_booking
  before insert or update of equipment_id, extra_equipment_id, start_date, end_date, status
  on bookings
  for each row
  execute function check_double_booking();
