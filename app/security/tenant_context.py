# security/tenant_context.py
"""
Tenant context management for Row-Level Security (RLS).
Ensures clinic_id is set on every database connection.
"""
import os
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Optional, Generator
import logging

from medicai.storage.postgres import get_conn as _base_get_conn, set_rls_clinic_id, clear_rls_clinic_id

logger = logging.getLogger(__name__)

# Context variable to store current clinic_id
_current_clinic_id: ContextVar[Optional[str]] = ContextVar('clinic_id', default=None)

# Default clinic for single-tenant mode
DEFAULT_CLINIC_ID = os.getenv("DEFAULT_CLINIC_ID", "00000000-0000-0000-0000-000000000001")


def set_clinic_context(clinic_id: str) -> None:
    """Set the current clinic context for RLS."""
    _current_clinic_id.set(clinic_id)
    # Also set on postgres module so ALL get_conn() calls pick it up
    set_rls_clinic_id(clinic_id)


def get_clinic_context() -> Optional[str]:
    """Get the current clinic context."""
    return _current_clinic_id.get()


def clear_clinic_context() -> None:
    """Clear the current clinic context."""
    _current_clinic_id.set(None)
    clear_rls_clinic_id()


@contextmanager
def clinic_context(clinic_id: str) -> Generator[None, None, None]:
    """
    Context manager to set clinic context for a block of code.
    
    Usage:
        with clinic_context("clinic-uuid"):
            # All DB queries here will be filtered by RLS
            patients = get_all_patients()
    """
    old_value = _current_clinic_id.get()
    _current_clinic_id.set(clinic_id)
    try:
        yield
    finally:
        _current_clinic_id.set(old_value)


@contextmanager
def get_conn_with_rls():
    """
    Get a database connection with RLS context set.
    This should be used instead of raw get_conn() for all user-facing queries.
    """
    clinic_id = _current_clinic_id.get() or DEFAULT_CLINIC_ID
    
    with _base_get_conn() as conn:
        with conn.cursor() as cur:
            # Set the clinic context for RLS policies
            cur.execute("SELECT set_config('app.current_clinic_id', %s, false)", (clinic_id,))
        conn.commit()
        yield conn


def get_conn_for_clinic(clinic_id: str):
    """
    Get a database connection for a specific clinic.
    Use this when you need to explicitly specify the clinic.
    """
    with _base_get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('app.current_clinic_id', %s, false)", (clinic_id,))
        conn.commit()
        yield conn


class TenantMiddleware:
    """
    FastAPI middleware to set tenant context from authenticated user.
    """
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # Tenant context is set in the auth dependency after token validation
            # This middleware just ensures cleanup
            try:
                await self.app(scope, receive, send)
            finally:
                clear_clinic_context()
        else:
            await self.app(scope, receive, send)
