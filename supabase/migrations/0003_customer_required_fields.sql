-- Split customer name into first/last, require dual driver's license, require project address.
-- Safe to run as-is: at the time of writing, customers table is empty.

alter table customers
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists drivers_license_front_url text,
  add column if not exists drivers_license_back_url text;

alter table customers drop column if exists name;
alter table customers drop column if exists drivers_license_url;

alter table customers
  alter column first_name set not null,
  alter column last_name set not null,
  alter column drivers_license_front_url set not null,
  alter column drivers_license_back_url set not null,
  alter column project_address_line1 set not null,
  alter column project_city set not null,
  alter column project_province set not null,
  alter column project_postal_code set not null;
