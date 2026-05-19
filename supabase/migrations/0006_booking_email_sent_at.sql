-- Phase 4 / Phase 3 hand-off: track when the confirmation email was sent so
-- both the payment success path and the Dropbox Sign webhook path can call
-- the same dispatcher idempotently. Whichever event finishes last (payment
-- or signed-PDF upload) actually sends the email; the other no-ops.

alter table bookings
  add column if not exists email_sent_at timestamptz;
