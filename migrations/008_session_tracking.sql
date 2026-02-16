-- Migration 008: Session Tracking and Device Management
-- Purpose: Track user sessions and devices for security monitoring
-- Enables: logout from specific devices, session timeout, suspicious login detection

-- =============================================================================
-- USER SESSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clinic_id UUID,  -- Don't reference clinics in case it doesn't exist
    
    -- Session token (hashed)
    token_hash TEXT NOT NULL UNIQUE,
    
    -- Device identification
    device_fingerprint TEXT,
    user_agent TEXT,
    ip_address INET,
    device_name TEXT,  -- Parsed from user-agent: "Chrome on Windows"
    
    -- Location (optional, from IP geolocation)
    country_code TEXT,
    city TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    
    -- Session state
    is_current BOOLEAN DEFAULT FALSE,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,  -- 'manual', 'timeout', 'password_change', 'security'
    
    -- 2FA verified for this session
    mfa_verified BOOLEAN DEFAULT FALSE,
    mfa_verified_at TIMESTAMPTZ
);

-- Indexes for efficient queries (only if table was just created or index doesn't exist)
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_clinic ON user_sessions(clinic_id);

-- Partial index for active sessions
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_sessions_active') THEN
        CREATE INDEX idx_user_sessions_active ON user_sessions(user_id, revoked, expires_at) 
            WHERE revoked = FALSE;
    END IF;
END $$;

-- =============================================================================
-- REFRESH TOKENS TABLE (for token rotation)
-- Handle case where table exists with different schema
-- =============================================================================

DO $$ 
BEGIN
    -- Check if refresh_tokens table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_tokens') THEN
        -- Table exists - check if it has session_id column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'refresh_tokens' AND column_name = 'session_id') THEN
            -- Old schema without session_id - add missing columns
            ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS session_id UUID;
            ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS is_used BOOLEAN DEFAULT FALSE;
            ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id UUID;
            ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS generation INT DEFAULT 1;
            
            -- Update family_id for existing rows
            UPDATE refresh_tokens SET family_id = gen_random_uuid() WHERE family_id IS NULL;
        END IF;
    ELSE
        -- Create fresh table
        CREATE TABLE refresh_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            
            -- Token lifecycle
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            
            -- Security: each refresh token can only be used once
            is_used BOOLEAN DEFAULT FALSE,
            
            -- If compromised, we can trace token family
            family_id UUID NOT NULL,
            generation INT NOT NULL DEFAULT 1
        );
    END IF;
END $$;

-- Add indexes if they don't exist
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'refresh_tokens' AND column_name = 'session_id') THEN
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session ON refresh_tokens(session_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token_hash);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'refresh_tokens' AND column_name = 'family_id') THEN
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
    END IF;
END $$;

-- =============================================================================
-- SUSPICIOUS LOGIN ATTEMPTS (for security alerts)
-- =============================================================================

CREATE TABLE IF NOT EXISTS suspicious_logins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    
    -- Attempt details
    ip_address INET,
    user_agent TEXT,
    country_code TEXT,
    
    -- What triggered the flag
    reason TEXT NOT NULL,
    risk_score INT,
    
    -- Resolution
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    blocked BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suspicious_logins_user ON suspicious_logins(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_logins_email ON suspicious_logins(email);
CREATE INDEX IF NOT EXISTS idx_suspicious_logins_ip ON suspicious_logins(ip_address);

-- =============================================================================
-- FUNCTIONS FOR SESSION MANAGEMENT
-- =============================================================================

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions
    WHERE expires_at < NOW() - INTERVAL '30 days'
    AND revoked = TRUE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    UPDATE user_sessions
    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'timeout'
    WHERE expires_at < NOW() AND revoked = FALSE;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke all sessions for a user
CREATE OR REPLACE FUNCTION revoke_user_sessions(
    p_user_id UUID,
    p_reason TEXT DEFAULT 'security',
    p_exclude_session_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    revoked_count INTEGER;
BEGIN
    UPDATE user_sessions
    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = p_reason
    WHERE user_id = p_user_id
    AND revoked = FALSE
    AND (p_exclude_session_id IS NULL OR id != p_exclude_session_id);
    
    GET DIAGNOSTICS revoked_count = ROW_COUNT;
    RETURN revoked_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- ENABLE RLS ON SESSION TABLES (only if user_sessions has clinic_id)
-- =============================================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'user_sessions' AND column_name = 'clinic_id') THEN
        ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS user_sessions_isolation ON user_sessions;
        CREATE POLICY user_sessions_isolation ON user_sessions
            FOR ALL
            USING (clinic_id IS NULL OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
            WITH CHECK (clinic_id IS NULL OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
    END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE user_sessions IS 'Active user sessions with device tracking for security';
COMMENT ON TABLE suspicious_logins IS 'Flagged login attempts for security review';
COMMENT ON FUNCTION cleanup_expired_sessions() IS 'Periodic cleanup of expired sessions';
COMMENT ON FUNCTION revoke_user_sessions(UUID, TEXT, UUID) IS 'Revoke all sessions for a user';
