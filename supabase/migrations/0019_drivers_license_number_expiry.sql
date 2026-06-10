-- Capture DL number + expiry text fields so they auto-populate the
-- new Dropbox Sign template (added 2026-06). Customer row holds the
-- latest values; booking row keeps a per-booking snapshot (same
-- pattern as the DL image URLs from migration 0008).

alter table customers
  add column if not exists drivers_license_number  text null,
  add column if not exists drivers_license_expiry  date null;

alter table bookings
  add column if not exists drivers_license_number  text null,
  add column if not exists drivers_license_expiry  date null;
