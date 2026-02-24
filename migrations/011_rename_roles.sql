ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE team_invitations DROP CONSTRAINT IF EXISTS team_invitations_role_check;

UPDATE users SET role = 'assistant' WHERE role = 'support_agent';
UPDATE team_invitations SET role = 'assistant' WHERE role = 'support_agent';

ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('owner', 'doctor', 'assistant'));
ALTER TABLE team_invitations ADD CONSTRAINT team_invitations_role_check
    CHECK (role IN ('doctor', 'assistant'));
