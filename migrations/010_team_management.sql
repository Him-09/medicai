DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'doctor';
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users SET role = 'support_agent' WHERE role = 'assistant';

ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('owner', 'doctor', 'support_agent'));

DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id);
END $$;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_unique_pending
    ON team_invitations(clinic_id, email) WHERE status = 'pending';

COMMENT ON COLUMN users.role IS 'User role within their clinic: owner, doctor, support_agent';

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
