-- Customer accounts via Supabase Auth.
--
-- Anonymous bookings stay allowed. When a customer signs up, we link
-- auth.users.id to a customer row via `auth_user_id`. Existing
-- pre-account customer rows are NOT auto-claimed by sign-ups with the
-- same email — they stay as orphaned historical data forever. This is
-- a deliberate security stance to prevent account-takeover via email.
--
-- Consequences:
--   - email is no longer unique (multiple anonymous customer rows OK,
--     plus a separate row when they later sign up)
--   - auth_user_id IS unique when not null (one customer row per account)

alter table customers
  drop constraint if exists customers_email_key;

alter table customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists customers_auth_user_id_key
  on customers(auth_user_id) where auth_user_id is not null;
