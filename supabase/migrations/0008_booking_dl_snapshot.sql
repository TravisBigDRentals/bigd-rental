-- Per-booking driver's license snapshot for audit trail.
--
-- Customer rows hold only the LATEST license. If a customer re-uploads
-- between bookings, you'd lose the ability to prove which DL was on
-- file when the older rental actually happened — bad for damage
-- disputes on $37k–$56k machines.
--
-- New behavior: every booking captures its own DL paths at creation
-- time. The customer row still tracks the latest version for prefill
-- convenience, but the booking row is the authoritative record for
-- "what DL did this customer present when they rented this machine?"

alter table bookings
  add column if not exists drivers_license_front_url text,
  add column if not exists drivers_license_back_url text;
