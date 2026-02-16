-- Migration 007: Tenant Isolation with Row-Level Security (RLS)
-- Purpose: Implement per-clinic logical isolation for HIPAA compliance
-- This ensures that each clinic can only access their own data
-- Note: Run migrations 001-006 first. Tables that don't exist will be skipped.

-- =============================================================================
-- STEP 1: Create clinics table
-- =============================================================================

-- Create clinics table first (if not exists)
CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert a default clinic for existing data
INSERT INTO clinics (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Clinic', 'default')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- STEP 2: Add clinic_id to core tables (only if they exist)
-- =============================================================================

-- Add clinic_id to users table
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
        UPDATE users SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
        ALTER TABLE users ALTER COLUMN clinic_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
    END IF;
END $$;

-- Add clinic_id to patients table
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patients') THEN
        ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
        UPDATE patients SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
        ALTER TABLE patients ALTER COLUMN clinic_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
    END IF;
END $$;

-- Add clinic_id to documents table
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
        UPDATE documents SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
        ALTER TABLE documents ALTER COLUMN clinic_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
    END IF;
END $$;

-- Add clinic_id to consultations table
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultations') THEN
        ALTER TABLE consultations ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
        UPDATE consultations SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
        ALTER TABLE consultations ALTER COLUMN clinic_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
    END IF;
END $$;

-- Add clinic_id to audit_events table
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_events') THEN
        ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
        UPDATE audit_events SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
    END IF;
END $$;

-- Add clinic_id to consultation_orders table
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultation_orders') THEN
        ALTER TABLE consultation_orders ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
        UPDATE consultation_orders SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
    END IF;
END $$;

-- Add clinic_id to consultation_documents table
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultation_documents') THEN
        ALTER TABLE consultation_documents ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
        UPDATE consultation_documents SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
    END IF;
END $$;

-- Add clinic_id to document_embeddings table (for RAG)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_embeddings') THEN
        ALTER TABLE document_embeddings ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
        UPDATE document_embeddings SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;
    END IF;
END $$;

-- =============================================================================
-- STEP 3: Create indexes for clinic_id columns (only for existing tables)
-- =============================================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        CREATE INDEX IF NOT EXISTS idx_users_clinic ON users(clinic_id);
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patients') THEN
        CREATE INDEX IF NOT EXISTS idx_patients_clinic ON patients(clinic_id);
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
        CREATE INDEX IF NOT EXISTS idx_documents_clinic ON documents(clinic_id);
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultations') THEN
        CREATE INDEX IF NOT EXISTS idx_consultations_clinic ON consultations(clinic_id);
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_events') THEN
        CREATE INDEX IF NOT EXISTS idx_audit_events_clinic ON audit_events(clinic_id);
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultation_orders') THEN
        CREATE INDEX IF NOT EXISTS idx_consultation_orders_clinic ON consultation_orders(clinic_id);
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultation_documents') THEN
        CREATE INDEX IF NOT EXISTS idx_consultation_documents_clinic ON consultation_documents(clinic_id);
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_embeddings') THEN
        CREATE INDEX IF NOT EXISTS idx_document_embeddings_clinic ON document_embeddings(clinic_id);
    END IF;
END $$;

-- =============================================================================
-- STEP 4: Enable Row-Level Security (RLS) on PHI tables
-- =============================================================================

-- Enable RLS on patients (if exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patients') THEN
        ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
        ALTER TABLE patients FORCE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Enable RLS on documents (if exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
        ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
        ALTER TABLE documents FORCE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Enable RLS on consultations (if exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultations') THEN
        ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
        ALTER TABLE consultations FORCE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Enable RLS on audit_events (if exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_events') THEN
        ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
        ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Enable RLS on consultation_orders (if exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultation_orders') THEN
        ALTER TABLE consultation_orders ENABLE ROW LEVEL SECURITY;
        ALTER TABLE consultation_orders FORCE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Enable RLS on consultation_documents (if exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultation_documents') THEN
        ALTER TABLE consultation_documents ENABLE ROW LEVEL SECURITY;
        ALTER TABLE consultation_documents FORCE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Enable RLS on document_embeddings (if exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_embeddings') THEN
        ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
        ALTER TABLE document_embeddings FORCE ROW LEVEL SECURITY;
    END IF;
END $$;

-- =============================================================================
-- STEP 5: Create RLS policies based on app.current_clinic_id setting
-- The application must SET app.current_clinic_id before each connection
-- =============================================================================

-- Patients policies
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patients') THEN
        DROP POLICY IF EXISTS patients_clinic_isolation ON patients;
        CREATE POLICY patients_clinic_isolation ON patients
            FOR ALL
            USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
            WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
    END IF;
END $$;

-- Documents policies
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
        DROP POLICY IF EXISTS documents_clinic_isolation ON documents;
        CREATE POLICY documents_clinic_isolation ON documents
            FOR ALL
            USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
            WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
    END IF;
END $$;

-- Consultations policies
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultations') THEN
        DROP POLICY IF EXISTS consultations_clinic_isolation ON consultations;
        CREATE POLICY consultations_clinic_isolation ON consultations
            FOR ALL
            USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
            WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
    END IF;
END $$;

-- Audit events policies
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_events') THEN
        DROP POLICY IF EXISTS audit_events_clinic_isolation ON audit_events;
        CREATE POLICY audit_events_clinic_isolation ON audit_events
            FOR ALL
            USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
            WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
    END IF;
END $$;

-- Consultation orders policies
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultation_orders') THEN
        DROP POLICY IF EXISTS consultation_orders_clinic_isolation ON consultation_orders;
        CREATE POLICY consultation_orders_clinic_isolation ON consultation_orders
            FOR ALL
            USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
            WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
    END IF;
END $$;

-- Consultation documents policies
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultation_documents') THEN
        DROP POLICY IF EXISTS consultation_documents_clinic_isolation ON consultation_documents;
        CREATE POLICY consultation_documents_clinic_isolation ON consultation_documents
            FOR ALL
            USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
            WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
    END IF;
END $$;

-- Document embeddings policies
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_embeddings') THEN
        DROP POLICY IF EXISTS document_embeddings_clinic_isolation ON document_embeddings;
        CREATE POLICY document_embeddings_clinic_isolation ON document_embeddings
            FOR ALL
            USING (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
            WITH CHECK (clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
    END IF;
END $$;

-- =============================================================================
-- STEP 6: Add comments for documentation
-- =============================================================================

COMMENT ON TABLE clinics IS 'Multi-tenant clinic registry for data isolation';

-- =============================================================================
-- IMPORTANT: Application must call this at connection start:
-- SET app.current_clinic_id = '<clinic-uuid>';
-- =============================================================================
