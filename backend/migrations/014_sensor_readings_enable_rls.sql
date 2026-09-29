-- sensor_readings shows "UNRESTRICTED" in the Supabase table editor -- RLS was
-- never enabled on it. It's only ever read/written through the /api/iot/* Express
-- endpoints, which authenticate with the service-role key (bypasses RLS entirely)
-- and enforce their own checks (X-Device-Key on ingest, admin session on the rest).
-- With RLS off, anyone holding the project's anon key could read, insert, or
-- delete rows directly via Supabase's REST API, bypassing the device key and the
-- admin auth check completely.
--
-- Same fix already applied to billing_records in 009: enable RLS and add no
-- policies at all. No anon/authenticated client should ever touch this table
-- directly, so there's nothing to grant -- only the service-role key (which
-- bypasses RLS) should be able to reach it.
--
-- Run this once in the Supabase SQL Editor, after 013.

alter table public.sensor_readings enable row level security;
