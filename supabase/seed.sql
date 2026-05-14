-- Big D's Rental Co. — Seed Data
-- Run after 0001_initial_schema.sql. Idempotent: re-runnable.

insert into equipment (name, serial, type, daily_rate_cents, insured_value_cents, available_for_booking)
values
  ('Kubota U10-5 Mini Excavator', 'KBCAZ16CKP3B10665', 'excavator', 95000, 3700000, true),
  ('Kubota SCL 1000 Mini Skid Steer', 'KBXLCA1CPTLA22675', 'skid_steer', 42500, 5600000, true)
on conflict do nothing;

insert into addons (name, daily_rate_cents, compatible_equipment_type)
values
  ('Toothed Bucket 36" (AP-CL136LT)', 4000, 'excavator'),
  ('Smooth Bucket 42" (AP-CL142LC)', 4000, 'excavator'),
  ('Pallet Fork 36"',                4000, 'skid_steer'),
  ('Boxer Auger ML1100',             4000, 'skid_steer'),
  ('Trencher',                       4000, 'skid_steer')
on conflict do nothing;
