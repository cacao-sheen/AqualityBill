-- Adds a meter_no field to profiles — the consumer's water meter number,
-- used to match a consumer's account when they later create an account in
-- the Android app, without duplicating the profile the admin already
-- entered for them.
--
-- Run this once in the Supabase SQL Editor, before importing consumer data.

alter table public.profiles
  add column if not exists meter_no text;

alter table public.profiles
  add constraint profiles_meter_no_key unique (meter_no);
