-- Auto-flags consumers as "pending" in disconnection_records the moment they
-- cross the disconnection grace period (2+ days past due on an unpaid/overdue
-- bill), without cutting their water automatically. The actual
-- connected/disconnected status change still only happens when the admin
-- acts (button click, or a manual edit in the Table Editor — see
-- 001_disconnection_records_append_only.sql for how that becomes a new row).
--
-- Run this once in the Supabase SQL Editor, after 001.

-- 1) Allow a third status value: 'pending' alongside 'connected' / 'disconnected'.
alter table public.disconnection_records
  drop constraint if exists disconnection_records_status_check;

alter table public.disconnection_records
  add constraint disconnection_records_status_check
  check (status in ('connected', 'disconnected', 'pending'));

-- 2) Function: find consumers whose oldest unpaid/overdue bill is 2+ days
-- past due, and whose latest disconnection_records entry is not already
-- 'pending' or 'disconnected' — then log a new 'pending' row for them.
-- Mirrors DISCONNECTION_GRACE_DAYS / isEligibleForDisconnection in
-- backend/controllers/disconnection.controller.js.
create or replace function public.disconnection_records_flag_overdue()
returns void
language plpgsql
as $$
declare
  grace_days constant int := 2;
begin
  with overdue_consumers as (
    select b.consumer_id, min(b.due_date) as oldest_due_date
    from public.billing_records b
    where lower(trim(b.payment_status)) in ('unpaid', 'overdue')
    group by b.consumer_id
    having (current_date - min(b.due_date)::date) >= grace_days
  ),
  latest_status as (
    select distinct on (dr.consumer_id) dr.consumer_id, dr.status
    from public.disconnection_records dr
    order by dr.consumer_id, dr.created_at desc
  )
  insert into public.disconnection_records (consumer_id, status, performed_by)
  select oc.consumer_id, 'pending', 'system:auto-overdue'
  from overdue_consumers oc
  left join latest_status ls on ls.consumer_id = oc.consumer_id
  where ls.status is null or ls.status = 'connected';
end;
$$;

-- 3) Schedule it to run every hour via pg_cron.
-- If "create extension" errors with a permissions message, enable pg_cron
-- from the Supabase dashboard first: Database -> Extensions -> pg_cron -> Enable.
create extension if not exists pg_cron;

select cron.unschedule('disconnection-flag-overdue-hourly')
where exists (select 1 from cron.job where jobname = 'disconnection-flag-overdue-hourly');

select cron.schedule(
  'disconnection-flag-overdue-hourly',
  '0 * * * *',
  $$select public.disconnection_records_flag_overdue();$$
);

-- Optional: run it once immediately so already-overdue consumers get flagged
-- right away instead of waiting for the next hourly tick.
select public.disconnection_records_flag_overdue();
