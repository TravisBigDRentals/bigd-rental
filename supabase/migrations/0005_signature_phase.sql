-- Phase 3 — Agreement & Signature
--
-- Adds a `pending_signature` status that comes BEFORE `pending_payment` in
-- the booking lifecycle, plus columns to track the Dropbox Sign request and
-- completion timestamp. The signed PDF URL column (`signed_agreement_pdf_url`)
-- already exists from migration 0001.

-- ALTER TYPE ... ADD VALUE cannot run inside a transaction, so this is a
-- standalone statement. Supabase's SQL editor runs each statement separately.
alter type booking_status add value if not exists 'pending_signature' before 'pending_payment';

alter table bookings
  add column if not exists signature_request_id text,
  add column if not exists signature_completed_at timestamptz;
