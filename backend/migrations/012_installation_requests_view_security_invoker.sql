-- installation_requests_view (pre-existing, not created by any migration in
-- this repo) was found to have security_invoker unset (reloptions IS NULL),
-- meaning it runs with the view OWNER's permissions, not the caller's.
-- Table owners/superusers bypass RLS by default in Postgres, so this view
-- currently ignores the RLS lockdown added to installation_requests in
-- 010_fix_installation_and_disconnection_rls.sql entirely — anyone with just
-- the public anon key can read it via Supabase's auto-generated REST API at
-- /rest/v1/installation_requests_view, regardless of the base table's RLS.
--
-- security_invoker = true makes the view run RLS checks as the querying
-- role instead of the owner's, so it now inherits whatever policies exist
-- (or don't exist) on installation_requests going forward. The admin
-- backend is unaffected either way — it uses the service-role key, which
-- bypasses RLS regardless.
--
-- Run this once in the Supabase SQL Editor, after 010.

alter view public.installation_requests_view set (security_invoker = true);
