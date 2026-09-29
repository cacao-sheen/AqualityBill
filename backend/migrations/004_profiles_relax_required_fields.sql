-- Consumer profiles are now pre-entered by admin staff before the consumer
-- has created an account in the Android app, so contact info like email
-- isn't always available yet at profile-creation time.
--
-- Relaxes profiles.email to nullable; it gets filled in later via the admin
-- site, or automatically once the consumer claims their account in the
-- Android app.
--
-- Run this once in the Supabase SQL Editor, before importing consumer data.

alter table public.profiles alter column email drop not null;
