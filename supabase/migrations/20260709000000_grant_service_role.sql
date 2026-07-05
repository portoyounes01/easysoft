-- =====================================================================
-- Grant service_role full access to the public schema (existing + future).
-- service_role is the privileged BACKEND key (bypasses RLS by design) used by
-- edge functions (pair-device, future pos-checkout / admin-provision-tenant)
-- and admin tooling. Standard Supabase grants this; EasySoft was missing it
-- (genesis explicitly granted anon/authenticated but omitted service_role, and
-- the default-privilege inheritance did not cover it here) — edge functions
-- 42501'd on public tables. This is NOT a new exposure: service_role is a
-- secret backend credential that already bypasses RLS.
--
-- Only service_role gets default-privileges for FUTURE tables (so zero-client
-- tables like employee_credentials / future fiscal secrets are reachable by the
-- backend). anon/authenticated intentionally stay EXPLICIT per-table so a new
-- zero-access table is not auto-exposed to clients.
-- =====================================================================

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE         ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Future objects created by the migration role inherit service_role access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL     ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL     ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
