from __future__ import annotations

import os
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator, Optional

import psycopg
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ── RLS context (set by FastAPI auth middleware) ──────────────────────────────
_rls_clinic_id: ContextVar[Optional[str]] = ContextVar("pg_rls_clinic_id", default=None)


def set_rls_clinic_id(clinic_id: str) -> None:
    """Set the clinic_id that get_conn() will apply as RLS context."""
    _rls_clinic_id.set(clinic_id)


def clear_rls_clinic_id() -> None:
    _rls_clinic_id.set(None)


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


@contextmanager
def get_conn(autocommit: bool = False) -> Iterator[psycopg.Connection]:
    """
    Get a database connection.
    If a clinic_id has been set via set_rls_clinic_id(), it is applied
    as the PostgreSQL session variable ``app.current_clinic_id`` so that
    RLS policies filter rows automatically.
    """
    conn = psycopg.connect(get_database_url())
    if autocommit:
        conn.autocommit = True
    try:
        # Apply RLS clinic context if available
        clinic_id = _rls_clinic_id.get(None)
        if clinic_id:
            with conn.cursor() as cur:
                # SET doesn't support prepared-statement params; use
                # format() but the value is a trusted UUID from our auth layer.
                cur.execute("SELECT set_config('app.current_clinic_id', %s, false)", (clinic_id,))
            if not autocommit:
                conn.commit()
        yield conn
    finally:
        conn.close()


def ping_db() -> bool:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("select 1;")
                cur.fetchone()
        return True
    except Exception:
        return False
