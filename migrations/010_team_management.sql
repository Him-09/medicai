-- Migration 010: Team Management
-- Purpose: Add team member management (roles, invitations) within a clinic
-- Each clinic owner can invite team members with different roles.
-- Roles: owner (full access), doctor (clinical access), support_agent (limited access)

-- =============================================================================
-- STEP 1: Ensure users.role column exists and update constraint for new roles
-- =============================================================================

DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'doctor';
END $$;

-- Drop the old constraint that only allows ['doctor', 'assistant']
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Migrate any existing 'assistant' roles to 'support_agent'
UPDATE users SET role = 'support_agent' WHERE role = 'assistant';

-- Add new constraint that includes all team roles
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('owner', 'doctor', 'support_agent'));

-- Add invited_by to track who invited this user
DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id);
END $$;

-- =============================================================================
-- STEP 2: Create team_invitations table for pending invitations
-- =============================================================================

CREATE TABLE IF NOT EXISTS team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'support_agent'
        CHECK (role IN ('doctor', 'support_agent')),
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_clinic ON team_invitations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);

-- Unique constraint: only one pending invitation per email per clinic
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_unique_pending
    ON team_invitations(clinic_id, email) WHERE status = 'pending';

-- =============================================================================
-- STEP 3: Create role permissions reference (not enforced in DB, used by app)
-- =============================================================================

-- Role permissions documentation:
-- owner:         All access. Can invite/remove members, manage clinic settings, access all patients.
-- doctor:        Clinical access. Can manage patients, consultations, documents. Cannot manage team.
-- support_agent: Limited access. Can view patients, upload documents, view consultations. 
--                Cannot use AI chat, cannot delete, cannot manage settings.

COMMENT ON COLUMN users.role IS 'User role within their clinic: owner, doctor, support_agent';

-- =============================================================================
-- STEP 4: Set first user per clinic as owner (if not already set)
-- =============================================================================

-- Mark the first user in each clinic as 'owner' if their role is still 'doctor'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT DISTINCT ON (clinic_id) id, clinic_id
        FROM users
        WHERE clinic_id IS NOT NULL
        ORDER BY clinic_id, created_at ASC
    ) LOOP
        UPDATE users SET role = 'owner' WHERE id = r.id AND role = 'doctor';
    END LOOP;
END $$;
