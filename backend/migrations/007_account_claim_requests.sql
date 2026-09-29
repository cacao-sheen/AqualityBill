-- Backs the "claim by meter number + admin confirmation" flow: a consumer who
-- already has a pre-loaded billing profile (imported from spreadsheet data,
-- no login yet) signs up in the Android app, enters their meter number, and
-- the app inserts a row here. This table is what the admin site's new
-- "Account Requests" page reviews before binding that Supabase Auth account
-- to the existing profiles row (profiles.auth_user_id, see
-- 005_profiles_decouple_from_auth.sql) — preventing duplicate consumer
-- records.
--
-- The Android app talks to Supabase directly (not through this Express
-- backend), so RLS below is what keeps a signed-in consumer able to submit
-- and check their own request without being able to read or act on anyone
-- else's. The admin backend uses the service-role key and bypasses RLS.
--
-- Run this once in the Supabase SQL Editor, after 005.
--
-- Safe to re-run even if the Android side already created a narrower version
-- of this table on its own (e.g. without email/phone/admin_note/reviewed_by)
-- — the ALTER TABLE ... ADD COLUMN IF NOT EXISTS calls below backfill
-- whatever's missing instead of assuming this CREATE TABLE was the one that
-- won.

create table if not exists public.account_claim_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  meter_no text not null,
  full_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Admin-review fields the Next.js admin app's approve/reject endpoints need,
-- regardless of which script created the table first.
alter table public.account_claim_requests add column if not exists email text;
alter table public.account_claim_requests add column if not exists phone text;
alter table public.account_claim_requests add column if not exists admin_note text;
alter table public.account_claim_requests add column if not exists reviewed_by text;

-- Only one open (pending) claim per meter number at a time — stops the same
-- meter from being claimed twice while the first request is still in review.
create unique index if not exists account_claim_requests_meter_no_pending_key
  on public.account_claim_requests (meter_no)
  where status = 'pending';

create index if not exists account_claim_requests_status_idx
  on public.account_claim_requests (status);

alter table public.account_claim_requests enable row level security;

drop policy if exists "Consumers can submit their own claim request" on public.account_claim_requests;
create policy "Consumers can submit their own claim request"
  on public.account_claim_requests
  for insert
  to authenticated
  with check (auth_user_id = auth.uid());

drop policy if exists "Consumers can view their own claim request" on public.account_claim_requests;
create policy "Consumers can view their own claim request"
  on public.account_claim_requests
  for select
  to authenticated
  using (auth_user_id = auth.uid());
