-- Makes disconnection_records append-only for status changes.
--
-- The app's Disconnect/Reconnect button already inserts a new row per action.
-- But editing the `status` cell directly in the Supabase Table Editor (or any
-- other client) issues a plain UPDATE, which would silently overwrite history.
--
-- This trigger intercepts any UPDATE that changes `status` and turns it into
-- an INSERT of a new row instead, leaving the original row untouched.
--
-- Run this once in the Supabase SQL Editor.

create or replace function public.disconnection_records_log_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    insert into public.disconnection_records (consumer_id, status, performed_by)
    values (old.consumer_id, new.status, new.performed_by);
    return null; -- cancel the update, old row stays exactly as it was
  end if;
  return new;
end;
$$;

drop trigger if exists trg_disconnection_records_status_change on public.disconnection_records;

create trigger trg_disconnection_records_status_change
before update on public.disconnection_records
for each row
execute function public.disconnection_records_log_status_change();
