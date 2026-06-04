-- Adds the TMG Plate Compactor as a third bookable machine.
--
-- IMPORTANT: ALTER TYPE ADD VALUE has historically had transaction
-- restrictions in PostgreSQL — if Supabase complains, paste this file
-- as two separate runs in the SQL editor (the ALTER TYPE first, the
-- INSERT second).

alter type equipment_type add value if not exists 'plate_compactor';

insert into equipment (
  name,
  serial,
  type,
  daily_rate_cents,
  weekly_rate_cents,
  monthly_rate_cents,
  insured_value_cents,
  available_for_booking,
  image_url,
  description
) values (
  'TMG Plate Compactor',
  'TMG-PC150K21095002',
  'plate_compactor',
  9900,
  42900,
  123900,
  null,
  true,
  'TMG-Industrial-Vibratory.webp',
  'Vibratory compactor for soil and gravel compaction in small areas. Not suitable for asphalt paving or wet ground.'
);
