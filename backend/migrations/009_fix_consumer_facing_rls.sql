-- Fixes two problems found by auditing pg_policies after 007/008 shipped:
--
-- 1) billing_records had four leftover scaffolding policies — "Allow
--    delete/insert/read/update access", role `public`, qual/with_check
--    literally `true` — that let ANY client (including an anonymous one
--    holding just the app's anon key) read, insert, update, and delete
--    every consumer's billing records. Unrelated to the claim-request work;
--    this was already exploitable before it existed.
--
-- 2) profiles/leak_reports still had policies from before profiles.id was
--    decoupled from the auth id (005_profiles_decouple_from_auth.sql) that
--    compare a consumer/profile id straight to auth.uid(). Those don't leak
--    anything (they just silently match nothing for a claimed consumer),
--    but "Users can insert own profile" on `profiles` is the same
--    self-service bypass we removed via profiles_insert_own_new_signup in
--    008 — just from an older policy that predates it. Drop it too.
--
-- Run this once in the Supabase SQL Editor, after 008.

-- billing_records: remove the wide-open policies.
drop policy if exists "Allow delete access" on public.billing_records;
drop policy if exists "Allow insert access" on public.billing_records;
drop policy if exists "Allow read access" on public.billing_records;
drop policy if exists "Allow update access" on public.billing_records;

-- Replace the stale auth.uid() = consumer_id policy with one that resolves
-- through profiles.auth_user_id, the way every consumer-facing policy now
-- has to (see the CRITICAL note in 008).
drop policy if exists "Users can view own billing records" on public.billing_records;
create policy "Consumers can view their own billing records"
  on public.billing_records
  for select
  to authenticated
  using (
    consumer_id in (
      select id from public.profiles where auth_user_id = auth.uid()
    )
  );

-- Deliberately no insert/update/delete policy for consumers: bills are only
-- ever written by the admin backend, which uses the service-role key and
-- bypasses RLS entirely. A consumer should never be able to write their own
-- bill amount or mark it paid themselves.

-- leak_reports: same fix — resolve through profiles instead of comparing
-- user_id straight to auth.uid().
drop policy if exists "Users can insert own reports" on public.leak_reports;
create policy "Users can insert own reports"
  on public.leak_reports
  for insert
  to authenticated
  with check (
    user_id in (
      select id from public.profiles where auth_user_id = auth.uid()
    )
  );

drop policy if exists "Users can view own reports" on public.leak_reports;
create policy "Users can view own reports"
  on public.leak_reports
  for select
  to authenticated
  using (
    user_id in (
      select id from public.profiles where auth_user_id = auth.uid()
    )
  );

-- profiles: drop the stale pre-005 policies (auth.uid() = id), including
-- the self-service insert bypass, and the 008 policy in case the earlier
-- standalone drop for it wasn't run yet.
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "profiles_insert_own_new_signup" on public.profiles;
