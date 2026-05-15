-- Add business name (optional) and customer's home/HQ address (required).
-- Customer address is distinct from project_address (the job-site address).
-- Existing rows: backfill customer_address from project_address (most renters
-- use the same address; admin can update later if needed).

alter table customers
  add column if not exists business_name text,
  add column if not exists customer_address_line1 text,
  add column if not exists customer_address_line2 text,
  add column if not exists customer_city text,
  add column if not exists customer_province text,
  add column if not exists customer_postal_code text;

update customers set
  customer_address_line1 = project_address_line1,
  customer_address_line2 = project_address_line2,
  customer_city          = project_city,
  customer_province      = project_province,
  customer_postal_code   = project_postal_code
where customer_address_line1 is null;

alter table customers
  alter column customer_address_line1 set not null,
  alter column customer_city          set not null,
  alter column customer_province      set not null,
  alter column customer_postal_code   set not null;
