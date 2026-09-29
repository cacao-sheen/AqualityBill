-- period_start, period_end, and due_date are NOT NULL with no default, but
-- this data isn't always available yet when a bill is first entered (e.g.
-- bulk-importing historical meter readings before the collector workflow
-- exists). Relax these to nullable; they get filled in later via the admin
-- site or the collector-side app.
--
-- Run this once in the Supabase SQL Editor, before importing consumer data.

alter table public.billing_records alter column period_start drop not null;
alter table public.billing_records alter column period_end drop not null;
alter table public.billing_records alter column due_date drop not null;
