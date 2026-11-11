-- Private key/value settings for the admin backend. First use: the collector
-- app's 6-digit unlock PIN (key 'collector_pin'), stored as a bcrypt hash —
-- never the PIN itself.
--
-- Row-level security is ON with NO policies on purpose: the public anon key
-- the apps carry can't read or write this table at all. Only the admin backend
-- (service-role key) touches it. A 6-digit PIN has only a million
-- possibilities, so even its hash must never be readable from a phone; the
-- collector app asks the backend to check a PIN instead
-- (POST /api/collector-pin/verify, rate-limited).
--
-- Run this once in the Supabase SQL Editor, after 015.

create table if not exists public.app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.app_settings enable row level security;

-- Make the API see the new table right away.
notify pgrst, 'reload schema';
