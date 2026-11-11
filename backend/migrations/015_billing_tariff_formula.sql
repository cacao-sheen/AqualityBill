-- Switches billing_records.total_amount to the cooperative's real tariff,
-- the same one the collector app and the consumer app compute:
--
--   total = minimum charge + max(0, consumption - included m³) * excess rate
--         = ₱150 for the first 10 m³, then ₱5 per m³ beyond that
--
-- Before this, total_amount was generated as base_charge + consumption *
-- rate_per_cbm (no included allowance). The August 2026 import faked the
-- tariff on that formula by storing a back-computed, 2-decimal "rate" per
-- consumer, which left most totals a few centavos off (11 m³ = ₱154.95
-- instead of ₱155.00). And every new bill the collector saved was charged
-- for the first 10 m³ twice (its printed ticket said one amount, the
-- database stored a higher one).
--
-- What this does to existing rows:
--   * Bills whose stored total is within ₱1 of the tariff are switched to
--     the tariff itself (rate 5, 10 m³ included) — fixes the centavos.
--   * Bills that don't follow the tariff (4 in August 2026: 15 m³ = ₱225,
--     39 m³ = ₱245.94, 48 m³ = ₱150, 56 m³ = ₱321.36) keep their exact
--     recorded total: they get included_cubic_meters = 0, which makes the
--     new formula reduce to the old one for those rows.
--
-- Also creates billing_config, the single-row rate table both apps read
-- (copied from the collector app's supabase/billing_config.sql).
--
-- Does NOT change any row-level security policy on billing_records.
--
-- Run this once in the Supabase SQL Editor, after 014. It runs in one
-- transaction: if any step fails, nothing is changed.

begin;

-- 1) The included allowance. Existing rows start at 0 so their totals are
--    unchanged until step 2 decides which ones follow the tariff.
alter table public.billing_records
  add column if not exists included_cubic_meters numeric(10, 2) not null default 0;

-- 2) Bills that already follow the tariff (within ₱1 of it) → the exact tariff.
update public.billing_records
set rate_per_cbm = 5.00,
    included_cubic_meters = 10.00
where base_charge = 150
  and abs(total_amount - (150 + greatest(0, (current_reading - previous_reading) - 10) * 5)) <= 1;

-- 3) New bills default to the tariff.
alter table public.billing_records
  alter column base_charge set default 150.00,
  alter column rate_per_cbm set default 5.00,
  alter column included_cubic_meters set default 10.00;

-- 4) Recreate total_amount with the tariff formula (a generated column's
--    expression can only be changed by dropping and re-adding it).
alter table public.billing_records drop column if exists total_amount;

alter table public.billing_records
  add column total_amount numeric(10, 2) generated always as (
    base_charge + greatest(0, (current_reading - previous_reading) - included_cubic_meters) * rate_per_cbm
  ) stored;

-- 5) Shared rate table read by the collector app and the consumer app.
create table if not exists public.billing_config (
  id                     int primary key default 1 check (id = 1),
  minimum_charge         numeric(10, 2) not null default 150.00,
  included_cubic_meters  numeric(10, 2) not null default 10.00,
  excess_rate_per_cbm    numeric(10, 2) not null default 5.00,
  updated_at             timestamptz not null default now()
);

insert into public.billing_config (id) values (1) on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists billing_config_updated_at on public.billing_config;
create trigger billing_config_updated_at
  before update on public.billing_config
  for each row execute procedure public.set_updated_at();

alter table public.billing_config enable row level security;

-- Both apps read the current rates. Rate changes are made by an admin from
-- the Supabase dashboard (service role, bypasses RLS) — nobody else can write.
drop policy if exists "Allow read access" on public.billing_config;
create policy "Allow read access"
  on public.billing_config for select
  using (true);

commit;

-- Make the API see the new column/table right away.
notify pgrst, 'reload schema';

-- Check: how many bills follow the tariff exactly vs. keep a recorded amount.
select
  count(*) filter (where included_cubic_meters = 10) as on_tariff,
  count(*) filter (where included_cubic_meters = 0)  as kept_recorded_amount,
  sum(total_amount)                                  as total_billed
from public.billing_records;
