-- Migration 000: Base Tables - DEFENSIVE VERSION
-- Purpose: Ensure all foundational tables exist (idempotent - safe to re-run)
-- This migration checks for existing tables/columns and only adds what's missing
-- Run this first before other migrations

-- =============================================================================
-- ENABLE REQUIRED EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- USERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add optional columns if they don't exist
DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS specialty TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS license_number TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS output_language TEXT DEFAULT 'fr';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_compactness TEXT DEFAULT 'normal';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'doctor';
END $$;

-- =============================================================================
-- PATIENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS patients (
    patient_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    dob TEXT NOT NULL,
    sex TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    medical_history TEXT,
    allergies TEXT[],
    active_problems TEXT[],
    status TEXT DEFAULT 'active',
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add encryption columns if they don't exist
DO $$ BEGIN
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS name_encrypted TEXT;
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS dob_encrypted TEXT;
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS email_encrypted TEXT;
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS address_encrypted TEXT;
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS encryption_key_version INT;
END $$;

CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);

-- =============================================================================
-- CONSULTATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS consultations (
    consultation_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    name TEXT,
    consultation_time TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultations_patient_id ON consultations(patient_id);

-- Only create index on consultation_time if column exists
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'consultations' AND column_name = 'consultation_time') THEN
        CREATE INDEX IF NOT EXISTS idx_consultations_time ON consultations(consultation_time DESC);
    END IF;
END $$;

-- =============================================================================
-- DOCUMENTS TABLE (matches existing schema with doc_id as primary key)
-- =============================================================================

CREATE TABLE IF NOT EXISTS documents (
    doc_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    document_type TEXT,
    date_of_service DATE,
    source_file_path TEXT,
    source_file_type TEXT,
    processed_at TIMESTAMPTZ,
    model_used TEXT,
    payload JSONB,
    review_status TEXT DEFAULT 'pending',
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    raw_file_cleaned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);

-- =============================================================================
-- CONSULTATION_WORKSPACE TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS consultation_workspace (
    consultation_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    visit_focus TEXT,
    agenda JSONB,
    hpi JSONB,
    problems JSONB,
    quick_notes JSONB,
    orders JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_patient_id ON consultation_workspace(patient_id);
CREATE INDEX IF NOT EXISTS idx_workspace_updated_at ON consultation_workspace(updated_at DESC);

-- =============================================================================
-- AUDIT_EVENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    patient_id TEXT NULL,
    action TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_patient_time ON audit_events(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_events(user_id, created_at DESC);

-- =============================================================================
-- ENCRYPTION_KEYS TABLE (for PHI encryption)
-- =============================================================================

CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_name TEXT NOT NULL,
    key_version INT NOT NULL DEFAULT 1,
    algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
    created_at TIMESTAMPTZ DEFAULT now(),
    rotated_at TIMESTAMPTZ,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(key_name, key_version)
);

-- =============================================================================
-- ROLE_PERMISSIONS TABLE (RBAC)
-- =============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(role, resource, action)
);

-- =============================================================================
-- TOKEN_BLACKLIST TABLE (for JWT revocation)
-- =============================================================================

CREATE TABLE IF NOT EXISTS token_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_jti TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    blacklisted_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(token_jti);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);

-- =============================================================================
-- RATE_LIMITS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_count INT DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT now(),
    UNIQUE(key, endpoint)
);

-- =============================================================================
-- LAB_RESULTS TABLE (structured lab data)
-- =============================================================================

CREATE TABLE IF NOT EXISTS lab_results (
    id SERIAL PRIMARY KEY,
    doc_id TEXT REFERENCES documents(doc_id) ON DELETE CASCADE,
    patient_id TEXT NOT NULL,
    date_of_service DATE,
    panel_name TEXT,
    test_name TEXT NOT NULL,
    value NUMERIC,
    unit TEXT,
    ref_low NUMERIC,
    ref_high NUMERIC,
    flag TEXT,  -- 'normal', 'low', 'high', 'critical'
    source_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_lab_results_patient ON lab_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_doc ON lab_results(doc_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_date ON lab_results(date_of_service);

-- =============================================================================
-- RADIOLOGY_REPORTS TABLE (structured radiology data)
-- =============================================================================

CREATE TABLE IF NOT EXISTS radiology_reports (
    doc_id TEXT PRIMARY KEY REFERENCES documents(doc_id) ON DELETE CASCADE,
    patient_id TEXT NOT NULL,
    date_of_service DATE,
    exam_type TEXT,
    contexte_clinique TEXT,
    technique_examen TEXT,
    resultats TEXT,
    conclusion TEXT
);

CREATE INDEX IF NOT EXISTS idx_radiology_patient ON radiology_reports(patient_id);

-- =============================================================================
-- PRESCRIPTION_ITEMS TABLE (structured prescription data)
-- =============================================================================

CREATE TABLE IF NOT EXISTS prescription_items (
    id SERIAL PRIMARY KEY,
    doc_id TEXT REFERENCES documents(doc_id) ON DELETE CASCADE,
    patient_id TEXT NOT NULL,
    date_of_service DATE,
    prescriber_name TEXT,
    prescriber_specialty TEXT,
    drug_name TEXT NOT NULL,
    strength_or_concentration TEXT,
    form TEXT,
    route TEXT,
    dose TEXT,
    frequency TEXT,
    duration TEXT,
    quantity TEXT,
    instructions TEXT,
    as_written TEXT,
    confidence TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescription_patient ON prescription_items(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescription_doc ON prescription_items(doc_id);

-- =============================================================================
-- REFRESH_TOKENS TABLE (if not created by another migration)
-- =============================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_tokens') THEN
        CREATE TABLE refresh_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            revoked_at TIMESTAMPTZ,
            device_info TEXT
        );
        CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
        CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE users IS 'User accounts for authentication and profiles';
COMMENT ON TABLE patients IS 'Patient records with demographics and medical info';
COMMENT ON TABLE consultations IS 'Patient consultation/visit records';
COMMENT ON TABLE documents IS 'Uploaded/processed documents (labs, imaging, etc.)';
COMMENT ON TABLE consultation_workspace IS 'Working state for active consultations';
COMMENT ON TABLE audit_events IS 'Audit trail for HIPAA compliance';
COMMENT ON TABLE encryption_keys IS 'Key management for PHI encryption';
COMMENT ON TABLE role_permissions IS 'Role-based access control definitions';

-- =============================================================================
-- Migration complete - all base tables ensured
-- =============================================================================
