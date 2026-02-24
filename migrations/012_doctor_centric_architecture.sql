ALTER TABLE clinics ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);

UPDATE clinics c
SET owner_id = sub.uid
FROM (
    SELECT DISTINCT ON (clinic_id) id AS uid, clinic_id
    FROM users
    WHERE role IN ('owner', 'doctor')
    ORDER BY clinic_id, created_at ASC
) sub
WHERE c.id = sub.clinic_id AND c.owner_id IS NULL;

UPDATE users SET role = 'doctor' WHERE role = 'owner';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('doctor', 'assistant'));
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'doctor';

ALTER TABLE team_invitations DROP CONSTRAINT IF EXISTS team_invitations_role_check;
ALTER TABLE team_invitations ADD CONSTRAINT team_invitations_role_check CHECK (role IN ('assistant'));
ALTER TABLE team_invitations ALTER COLUMN role SET DEFAULT 'assistant';

CREATE OR REPLACE FUNCTION check_max_assistants()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'assistant' THEN
        IF (
            SELECT COUNT(*)
            FROM users
            WHERE clinic_id = NEW.clinic_id
              AND role = 'assistant'
              AND id IS DISTINCT FROM NEW.id
        ) >= 2 THEN
            RAISE EXCEPTION 'Maximum 2 assistants per clinic/doctor workspace';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_max_assistants ON users;
CREATE TRIGGER enforce_max_assistants
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION check_max_assistants();

CREATE OR REPLACE FUNCTION check_one_doctor_per_clinic()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'doctor' THEN
        IF (
            SELECT COUNT(*)
            FROM users
            WHERE clinic_id = NEW.clinic_id
              AND role = 'doctor'
              AND id IS DISTINCT FROM NEW.id
        ) >= 1 THEN
            RAISE EXCEPTION 'Each clinic workspace can only have one doctor';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_one_doctor_per_clinic ON users;
CREATE TRIGGER enforce_one_doctor_per_clinic
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION check_one_doctor_per_clinic();

ALTER TABLE clinic_settings DROP CONSTRAINT IF EXISTS clinic_settings_pkey;
ALTER TABLE clinic_settings DROP CONSTRAINT IF EXISTS clinic_settings_id_check;
ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

UPDATE clinic_settings SET clinic_id = '00000000-0000-0000-0000-000000000001' WHERE clinic_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'clinic_settings_clinic_id_unique'
    ) THEN
        ALTER TABLE clinic_settings ADD CONSTRAINT clinic_settings_clinic_id_unique UNIQUE (clinic_id);
    END IF;
END $$;
