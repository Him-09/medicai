-- Migration 011: Rename support_agent role to assistant
-- Simplifies role naming: owner, doctor, assistant

-- Drop constraints FIRST to allow updates
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE team_invitations DROP CONSTRAINT IF EXISTS team_invitations_role_check;

-- Update existing users and invitations
UPDATE users SET role = 'assistant' WHERE role = 'support_agent';
UPDATE team_invitations SET role = 'assistant' WHERE role = 'support_agent';

-- Re-create constraints with new values
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('owner', 'doctor', 'assistant'));
ALTER TABLE team_invitations ADD CONSTRAINT team_invitations_role_check
    CHECK (role IN ('doctor', 'assistant'));
