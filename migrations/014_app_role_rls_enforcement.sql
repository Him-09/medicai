CREATE ROLE medicai_app WITH LOGIN PASSWORD 'medicai_app_2025' NOBYPASSRLS NOSUPERUSER;

GRANT USAGE, CREATE ON SCHEMA public TO medicai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO medicai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medicai_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO medicai_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO medicai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO medicai_app;

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

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_clinic_isolation ON users FOR ALL
    USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
    WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);

ALTER TABLE clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_settings_clinic_isolation ON clinic_settings FOR ALL
    USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
    WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
