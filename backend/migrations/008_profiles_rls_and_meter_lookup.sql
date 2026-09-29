-- Companion to 007_account_claim_requests.sql: lets the Android app (using
-- the anon/authenticated Supabase key, not this admin backend's service-role
-- key) read and edit only the profiles row an admin has linked to it, and
-- lets an anonymous visitor check a meter number during signup without being
-- able to browse every consumer's data.
--
-- Run this once in the Supabase SQL Editor, after 007.

-- 1) A signed-in consumer may read/update only the profile linked to them.
--
-- Deliberately NO insert policy: every profiles row — whether from the
-- spreadsheet import or a brand-new consumer requesting service for the
-- first time — is created by an admin (import, or the Installations flow),
-- never by the app. The app's only write path into identity is submitting a
-- claim in account_claim_requests for an admin to approve; letting a
-- consumer insert their own profiles row directly would let them pick their
-- own meter_no/full_name and skip that review entirely.
--
-- profiles.id has no default; give it one anyway purely as a DB-level
-- convenience for admin-side inserts (the admin backend already generates
-- ids itself as a fallback, so this doesn't grant any new capability).
alter table public.profiles alter column id set default gen_random_uuid();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_linked" on public.profiles;
create policy "profiles_select_own_linked"
  on public.profiles
  for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "profiles_update_own_linked" on public.profiles;
create policy "profiles_update_own_linked"
  on public.profiles
  for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- IMPORTANT — do this part manually, this migration can't see your policies:
-- If `profiles` already has an older policy keyed on `id = auth.uid()` (left
-- over from before profiles.id was decoupled from the auth id in
-- 005_profiles_decouple_from_auth.sql), drop it. Check Database > profiles >
-- Policies in the Supabase dashboard and remove anything like that —
-- otherwise it just sits there matching nothing for every consumer onboarded
-- through the claim flow, which is harmless but confusing to leave in place.

-- 2) Meter-number lookup for the sign-up screen, usable by an anonymous
-- visitor (no session yet). A SECURITY DEFINER function instead of an open
-- SELECT policy, so it can confirm "yes/no, this meter number is on file"
-- without exposing any consumer's name/address/meter number to the public.
create or replace function public.meter_no_exists(p_meter_no text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where meter_no = p_meter_no
  );
$$;

revoke all on function public.meter_no_exists(text) from public;
grant execute on function public.meter_no_exists(text) to anon, authenticated;

-- ============================================================================
-- CRITICAL — read this before you consider the claim-request flow done.
-- ============================================================================
-- Before this flow existed, the Android app likely keyed every table
-- (billing_records.consumer_id, leak_reports.user_id,
-- installation_requests.profile_id, disconnection_records.consumer_id, and
-- the leak-photos Storage bucket) directly off auth.uid(), because
-- profiles.id used to equal the consumer's auth id. It no longer does:
-- profiles.id is admin-assigned, and the app must resolve it once via
-- `profiles.auth_user_id = auth.uid()` and use THAT id everywhere else.
--
-- If any RLS policy on those tables still reads like:
--     using (consumer_id = auth.uid())
-- it will now silently return ZERO rows for every consumer onboarded through
-- this claim flow (RLS filters rows, it doesn't error) — billing history,
-- leak reports, installation requests, and disconnection notices would all
-- appear empty in the app with no visible failure.
--
-- Check each policy in Database > Policies for these tables and, if it
-- compares the consumer/profile column directly to auth.uid(), change it to
-- resolve through profiles instead, e.g.:
--
--   using (
--     consumer_id in (
--       select id from public.profiles where auth_user_id = auth.uid()
--     )
--   )
--
-- Same fix applies to the leak-photos bucket's storage policies if they
-- compare a path segment directly to auth.uid().
-- ============================================================================
