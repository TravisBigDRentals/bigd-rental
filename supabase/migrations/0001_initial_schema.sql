-- Big D's Rental Co. — Initial Schema
-- Run this in the Supabase SQL editor before seeding.

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- Enums --------------------------------------------------------------

create type equipment_type as enum ('excavator', 'skid_steer', 'attachment');

create type booking_status as enum (
  'pending_payment',
  'booked',
  'delivered',
  'returned',
  'closed',
  'canceled'
);

-- Tables -------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text not null,
  drivers_license_front_url text not null,
  drivers_license_back_url text not null,
  project_address_line1 text not null,
  project_address_line2 text,
  project_city text not null,
  project_province text not null,
  project_postal_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_email_idx on customers (email);
create index customers_phone_idx on customers (phone);

create table equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  serial text not null unique,
  type equipment_type not null,
  daily_rate_cents integer not null check (daily_rate_cents >= 0),
  insured_value_cents integer,
  available_for_booking boolean not null default true,
  created_at timestamptz not null default now()
);

create table addons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  daily_rate_cents integer not null check (daily_rate_cents >= 0),
  compatible_equipment_type equipment_type not null,
  created_at timestamptz not null default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete restrict,
  equipment_id uuid not null references equipment(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  dropoff_time text,
  special_instructions text,
  status booking_status not null default 'pending_payment',
  total_cents integer not null default 0,
  payment_intent_id text,
  paid_at timestamptz,
  signature_request_id text,
  signed_agreement_pdf_url text,
  audit_trail_json jsonb,
  delivered_at timestamptz,
  handoff_signature_request_id text,
  handoff_signed_pdf_url text,
  delivery_photo_urls text[] not null default '{}',
  returned_at timestamptz,
  return_photo_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index bookings_equipment_dates_idx on bookings (equipment_id, start_date, end_date);
create index bookings_status_idx on bookings (status);
create index bookings_customer_idx on bookings (customer_id);

create table booking_addons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  addon_id uuid not null references addons(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  daily_rate_cents integer not null check (daily_rate_cents >= 0),
  created_at timestamptz not null default now()
);

create index booking_addons_booking_idx on booking_addons (booking_id);

-- Double-booking guard -----------------------------------------------
-- Reject overlapping bookings on the same equipment, including a one-day
-- buffer after end_date for return inspection. Canceled bookings are ignored.

create or replace function check_double_booking()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'canceled' then
    return new;
  end if;

  if exists (
    select 1
    from bookings b
    where b.equipment_id = new.equipment_id
      and b.id <> new.id
      and b.status <> 'canceled'
      and daterange(b.start_date, b.end_date + 1, '[]')
          && daterange(new.start_date, new.end_date + 1, '[]')
  ) then
    raise exception 'Booking conflicts with existing reservation on this equipment'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger bookings_no_double_booking
before insert or update of equipment_id, start_date, end_date, status
on bookings
for each row
execute function check_double_booking();

-- updated_at touch ---------------------------------------------------

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger customers_touch_updated_at
before update on customers
for each row execute function touch_updated_at();

create trigger bookings_touch_updated_at
before update on bookings
for each row execute function touch_updated_at();

-- Row Level Security -------------------------------------------------
-- Server code uses SUPABASE_SECRET_KEY (service role) and bypasses RLS by
-- design. Anon clients can only read public-facing equipment + addons.

alter table customers enable row level security;
alter table equipment enable row level security;
alter table addons enable row level security;
alter table bookings enable row level security;
alter table booking_addons enable row level security;

create policy "anon can read available equipment"
  on equipment for select
  to anon
  using (available_for_booking = true);

create policy "authed can read all equipment"
  on equipment for select
  to authenticated
  using (true);

create policy "anon can read addons"
  on addons for select
  to anon
  using (true);

create policy "authed can read addons"
  on addons for select
  to authenticated
  using (true);

-- customers / bookings / booking_addons: no anon access at all.
-- All writes go through server routes using the service role key.
-- Admin dashboard (Phase 5) will add authenticated SELECT policies.
