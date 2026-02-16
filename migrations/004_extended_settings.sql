-- Migration 004: Extended settings (notifications, templates, snippets, privacy)
-- Adds user notification preferences, templates, snippets, and data retention settings

-- User notification preferences table
CREATE TABLE IF NOT EXISTS user_notification_settings (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  browser_notifications BOOLEAN NOT NULL DEFAULT false,
  new_document BOOLEAN NOT NULL DEFAULT true,
  document_review BOOLEAN NOT NULL DEFAULT true,
  urgent_alerts BOOLEAN NOT NULL DEFAULT true,
  consultation_reminder BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id)
);

-- User privacy/data retention settings
CREATE TABLE IF NOT EXISTS user_privacy_settings (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  retention_policy TEXT NOT NULL DEFAULT 'forever', -- forever, 10years, 5years
  consent_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id)
);

-- Document templates table
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('prescription', 'certificate', 'referral', 'note')),
  content TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Text snippets/shortcuts table
CREATE TABLE IF NOT EXISTS text_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shortcode TEXT NOT NULL, -- e.g., /htn, /dm2
  expansion TEXT NOT NULL, -- e.g., "Hypertension artérielle"
  category TEXT, -- e.g., "Diagnostics", "Prescriptions"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, shortcode)
);

-- Integration settings table (API keys, email forwarding, etc.)
CREATE TABLE IF NOT EXISTS user_integrations (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL, -- 'api_key', 'email_forwarding', 'scanner', 'whatsapp'
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, integration_type)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_templates_user ON document_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_snippets_user ON text_snippets(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_user ON user_integrations(user_id);
