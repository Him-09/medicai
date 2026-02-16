-- Migration 001: Users and Audit Events tables
-- Run this migration once using psql or your migration tool

-- Enable uuid generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- USERS table for authentication
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AUDIT EVENTS for compliance and security logging
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id UUID NULL, -- allow null for generic events
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient audit queries
CREATE INDEX IF NOT EXISTS idx_audit_patient_time ON audit_events(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_events(user_id, created_at DESC);

-- Example: Insert first doctor user (run after generating password hash in Python)
-- INSERT INTO users (email, password_hash) VALUES ('doctor@clinic.ma', '<PUT_HASH_HERE>');
