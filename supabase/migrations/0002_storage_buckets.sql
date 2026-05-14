-- Storage buckets for customer documents and signed artifacts.
-- All buckets are PRIVATE. Reads/writes go through server routes that use
-- SUPABASE_SECRET_KEY (service role) and bypass storage RLS by design.

insert into storage.buckets (id, name, public)
values
  ('customer-documents', 'customer-documents', false),
  ('signed-agreements',  'signed-agreements',  false),
  ('condition-photos',   'condition-photos',   false)
on conflict (id) do nothing;
