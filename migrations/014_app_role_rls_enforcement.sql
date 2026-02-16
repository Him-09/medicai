-- Migration 014: Non-superuser application role + RLS on users/clinic_settings
-- Applied via _run_014.py + _check_rls.py
-- Date: 2025

-- 1. Create application role (NOBYPASSRLS = subject to RLS)
CREATE ROLE medicai_app WITH LOGIN PASSWORD 'medicai_app_2025' NOBYPASSRLS NOSUPERUSER;

-- 2. Grant permissions
GRANT USAGE, CREATE ON SCHEMA public TO medicai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO medicai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medicai_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO medicai_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO medicai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO medicai_app;

-- 3. Transfer ownership of all existing objects so CREATE TABLE IF NOT EXISTS works
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO medicai_app', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO medicai_app', r.sequencename);
  END LOOP;
END $$;

-- 3. Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_clinic_isolation ON users FOR ALL
    USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
    WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);

-- 4. Enable RLS on clinic_settings table
ALTER TABLE clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_settings_clinic_isolation ON clinic_settings FOR ALL
    USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
    WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
