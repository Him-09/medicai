#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Required extensions
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "vector";

    -- Application role for RLS enforcement
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'medicai_app') THEN
            CREATE ROLE medicai_app LOGIN PASSWORD '${MEDICAI_APP_PASSWORD:-medicai_secure}';
        END IF;
    END
    \$\$;

    -- Grants
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO medicai_app;
    GRANT USAGE  ON SCHEMA public TO medicai_app;
    GRANT CREATE ON SCHEMA public TO medicai_app;
EOSQL

echo "[init-db] PostgreSQL extensions and roles configured."
