-- Migration 003: User profile and clinic settings
-- Adds profile fields to users table and creates clinic_settings table
-- Note: Run migration 000_base_tables.sql first

-- Add profile fields to users table
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS specialty TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS license_number TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS output_language TEXT DEFAULT 'fr';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_compactness TEXT DEFAULT 'normal';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add raw_file_cleaned_at to documents table for cleanup tracking (only if table exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS raw_file_cleaned_at TIMESTAMPTZ;
    END IF;
END $$;

-- Clinic settings table (singleton pattern with id=1)
CREATE TABLE IF NOT EXISTS clinic_settings (
  id INT PRIMARY KEY DEFAULT 1,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  CONSTRAINT singleton_clinic CHECK (id = 1)
);

-- Insert default clinic settings if not exists
INSERT INTO clinic_settings (id, settings, schedule)
VALUES (
  1,
  '{
    "name": "",
    "address1": "",
    "address2": "",
    "postal_code": "",
    "city": "",
    "country": "Maroc",
    "timezone": "Africa/Casablanca",
    "default_consultation_duration": 20,
    "date_format": "dd/MM/yyyy",
    "currency": "MAD"
  }'::jsonb,
  '[
    {"day": "monday", "dayLabel": "Lundi", "enabled": true, "start": "09:00", "end": "18:00"},
    {"day": "tuesday", "dayLabel": "Mardi", "enabled": true, "start": "09:00", "end": "18:00"},
    {"day": "wednesday", "dayLabel": "Mercredi", "enabled": true, "start": "09:00", "end": "18:00"},
    {"day": "thursday", "dayLabel": "Jeudi", "enabled": true, "start": "09:00", "end": "18:00"},
    {"day": "friday", "dayLabel": "Vendredi", "enabled": true, "start": "09:00", "end": "18:00"},
    {"day": "saturday", "dayLabel": "Samedi", "enabled": true, "start": "09:00", "end": "13:00"},
    {"day": "sunday", "dayLabel": "Dimanche", "enabled": false, "start": "09:00", "end": "18:00"}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
