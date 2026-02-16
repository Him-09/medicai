-- Migration: Add 2FA and profile images tables
-- This migration adds tables for TOTP 2FA authentication and user profile images

-- User security settings for 2FA
CREATE TABLE IF NOT EXISTS user_security_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    totp_secret VARCHAR(64),
    totp_enabled BOOLEAN DEFAULT FALSE,
    backup_codes JSONB,
    backup_codes_remaining INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_security_settings_user_id ON user_security_settings(user_id);

-- User profile images (photo, signature, stamp/cachet)
CREATE TABLE IF NOT EXISTS user_profile_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_photo TEXT,  -- Base64 data URL
    signature_image TEXT,  -- Base64 data URL
    stamp_image TEXT,  -- Base64 data URL (cachet)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profile_images_user_id ON user_profile_images(user_id);

-- Add comment for documentation
COMMENT ON TABLE user_security_settings IS 'Stores 2FA TOTP secrets and backup codes for users';
COMMENT ON TABLE user_profile_images IS 'Stores profile photo, signature, and stamp images for users';
