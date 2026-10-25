#!/usr/bin/env bash

# The official image may source non-executable .sh files.
# A subshell keeps our shell options and variables local.
(
    set -Eeuo pipefail

    : "${POSTGRES_USER:?POSTGRES_USER is required}"
    : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
    : "${POSTGRES_DB:?POSTGRES_DB is required}"
    : "${APP_DB_USERNAME:?APP_DB_USERNAME is required}"
    : "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

    if [[ "$APP_DB_USERNAME" == "$POSTGRES_USER" ]]; then
        echo "Administrative and application usernames must differ." >&2
        exit 1
    fi

    if [[ ! "$APP_DB_USERNAME" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
        echo "APP_DB_USERNAME must be a lowercase PostgreSQL role name of at most 63 characters." >&2
        exit 1
    fi

    case "$POSTGRES_DB" in
        postgres|template0|template1)
            echo "Use a dedicated application database." >&2
            exit 1
            ;;
    esac

    export PGPASSWORD="$POSTGRES_PASSWORD"

    psql \
        --no-psqlrc \
        --no-password \
        --username "$POSTGRES_USER" \
        --dbname "$POSTGRES_DB" \
        --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_user APP_DB_USERNAME
\getenv app_password APP_DB_PASSWORD
\getenv database_name POSTGRES_DB

BEGIN;

CREATE ROLE :"app_user"
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOREPLICATION
    NOBYPASSRLS;

ALTER ROLE :"app_user" PASSWORD :'app_password';

REVOKE ALL PRIVILEGES ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO :"app_user";

REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";

-- This cluster is dedicated to Proof3161.
-- Do not leave default PUBLIC access to the maintenance databases.
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;

COMMIT;
SQL
)