-- The Android signup form collects address, gender, and birth_date and
-- currently only saves them onto account_claim_requests — they never make
-- it onto the consumer's actual profile. profiles already has `address`;
-- this adds the two it's missing (gender, birth_date) and makes sure
-- account_claim_requests has all three (defensive — the Android side may
-- already have added them itself).
--
-- The copy itself happens in backend/controllers/claimRequest.controller.js
-- (approveClaimRequest): when an admin approves a claim, any of these three
-- fields that are still blank on the matched profile get filled in from what
-- the consumer submitted at signup. Admin-entered data always wins — this
-- only fills gaps, never overwrites.
--
-- Run this once in the Supabase SQL Editor, after 010.

alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists birth_date date;

alter table public.account_claim_requests add column if not exists address text;
alter table public.account_claim_requests add column if not exists gender text;
alter table public.account_claim_requests add column if not exists birth_date date;
