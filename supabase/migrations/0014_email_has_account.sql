-- email_has_account(text) — used by /api/auth/email-exists to surface
-- a "we have an account for this email" nudge on Step 2 of the booking
-- form. Returns a single boolean. Privacy-wise this is a mild
-- enumeration surface (caller learns whether an address has an
-- account); acceptable for a small-fleet rental app, and only called
-- when a customer is mid-booking, not exposed as a UI lookup.

create or replace function public.email_has_account(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from auth.users
    where lower(email) = lower(check_email)
  );
$$;

-- Service role only — endpoint always runs through the service client.
revoke all on function public.email_has_account(text) from public;
grant execute on function public.email_has_account(text) to service_role;
