-- Equipment descriptions for the machine-picker on Step 1.
-- Plain text (no markdown / HTML) — rendered as a paragraph under
-- the serial number on the machine card.

alter table equipment
  add column if not exists description text null;

update equipment
  set description = 'Compact excavator ideal for small trenching, landscaping, and foundation work. Designed for operation on firm, level surfaces. Maximum digging depth approx. 6 ft.'
  where name = 'Kubota U10-5 Mini Excavator';

update equipment
  set description = 'Compact tracked loader suitable for earthmoving, hauling, and light demolition. Rated for up to 1000 lb. operating capacity. Operate on stable ground only.'
  where name = 'Kubota SCL 1000 Mini Skid Steer';
