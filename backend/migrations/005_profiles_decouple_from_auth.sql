-- profiles.id currently has a foreign key requiring it to already match an
-- existing auth.users row, with ON DELETE CASCADE — leftover from a common
-- Supabase starter pattern where every profile belongs to an
-- already-authenticated user. That doesn't fit how this app actually works:
-- admin staff pre-enter a consumer's data (profiles.id freely generated)
-- before that consumer has ever signed up in the Android app.
--
-- This drops that constraint so profiles.id is a plain, independent UUID,
-- and adds a separate, nullable auth_user_id column instead. THAT is what
-- gets filled in later, once a consumer signs up in the Android app and an
-- admin confirms/links their account to this existing profile (the
-- account-claim-request flow). NULL means "not yet claimed by any login."
--
-- Run this once in the Supabase SQL Editor, before importing consumer data.

alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists auth_user_id uuid unique references auth.users(id);
