-- Fixes the last two gaps found by the RLS audit after 009:
--
-- 1) installation_requests had RLS disabled entirely (relrowsecurity =
--    false) — any client holding just the app's anon key could read, edit,
--    or delete any consumer's installation request (name, address, phone,
--    notes), not just their own. This table is currently admin-only (the
--    "Add New Request" button on the admin site, via the Express backend's
--    service-role key, which bypasses RLS regardless) — no Android screen
--    uses it directly yet. So the fix is simple: enable RLS and add no
--    consumer-facing policies. The admin backend keeps working exactly as
--    before; every other client is now locked out until a real Android
--    submission flow needs a scoped policy added here.
--
-- 2) disconnection_records had RLS enabled but zero policies — not a leak
--    (the opposite problem), but it means a consumer can never read their
--    own disconnection status directly via Supabase. Adds a read-only
--    policy scoped through profiles.auth_user_id, same pattern as
--    billing_records/leak_reports in 009. No insert/update/delete policy:
--    only the admin (via the Express backend, service-role key) changes
--    connection status.
--
-- Run this once in the Supabase SQL Editor, after 009.

alter table public.installation_requests enable row level security;

alter table public.disconnection_records enable row level security;

drop policy if exists "Consumers can view their own disconnection status" on public.disconnection_records;
create policy "Consumers can view their own disconnection status"
  on public.disconnection_records
  for select
  to authenticated
  using (
    consumer_id in (
      select id from public.profiles where auth_user_id = auth.uid()
    )
  );
