-- Read-only verification for the affiliate security hardening.
-- Run this AFTER applying all three migrations in the Supabase SQL Editor.
-- No application data is modified.

-- 1) Table-level privileges for client roles.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('affiliates', 'affiliate_private_data')
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- 2) Column-level grants on affiliates. Authenticated should only retain
-- UPDATE on name, instagram and website; it should have no INSERT grants.
SELECT grantee, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'affiliates'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type, column_name;

-- 3) RLS status and policies for both tables.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('affiliates', 'affiliate_private_data')
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('affiliates', 'affiliate_private_data')
ORDER BY tablename, policyname;

-- 4) RPC execution rights. Expected: anon/authenticated=false and
-- service_role=true for both functions.
SELECT
  pg_catalog.has_function_privilege(
    'anon',
    'public.admin_update_affiliate_atomic(uuid,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) AS anon_can_admin_update,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_update_affiliate_atomic(uuid,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) AS authenticated_can_admin_update,
  pg_catalog.has_function_privilege(
    'service_role',
    'public.admin_update_affiliate_atomic(uuid,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) AS service_role_can_admin_update,
  pg_catalog.has_function_privilege(
    'anon',
    'public.affiliate_update_profile_atomic(text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) AS anon_can_update_profile,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.affiliate_update_profile_atomic(text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) AS authenticated_can_update_profile,
  pg_catalog.has_function_privilege(
    'service_role',
    'public.affiliate_update_profile_atomic(text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) AS service_role_can_update_profile;

-- 5) Confirm the protection/update triggers are installed.
SELECT event_object_table AS table_name,
       trigger_name,
       action_timing,
       event_manipulation,
       action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('affiliates', 'affiliate_private_data')
ORDER BY event_object_table, trigger_name;
