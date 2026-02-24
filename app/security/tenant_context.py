import os
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Optional, Generator
import logging

from medicai.storage.postgres import get_conn as _base_get_conn, set_rls_clinic_id, clear_rls_clinic_id

logger = logging.getLogger(__name__)

_current_clinic_id: ContextVar[Optional[str]] = ContextVar('clinic_id', default=None)

DEFAULT_CLINIC_ID = os.getenv("DEFAULT_CLINIC_ID", "00000000-0000-0000-0000-000000000001")

def set_clinic_context(clinic_id: str) -> None:
    _current_clinic_id.set(clinic_id)
    set_rls_clinic_id(clinic_id)

def get_clinic_context() -> Optional[str]:
    return _current_clinic_id.get()

def clear_clinic_context() -> None:
    _current_clinic_id.set(None)
    clear_rls_clinic_id()

@contextmanager
def clinic_context(clinic_id: str) -> Generator[None, None, None]:
    old_value = _current_clinic_id.get()
    _current_clinic_id.set(clinic_id)
    try:
        yield
    finally:
        _current_clinic_id.set(old_value)

@contextmanager
def get_conn_with_rls():
    clinic_id = _current_clinic_id.get() or DEFAULT_CLINIC_ID
    
    with _base_get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('app.current_clinic_id', %s, false)", (clinic_id,))
        conn.commit()
        yield conn

def get_conn_for_clinic(clinic_id: str):
    with _base_get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('app.current_clinic_id', %s, false)", (clinic_id,))
        conn.commit()
        yield conn

class TenantMiddleware:
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            try:
                await self.app(scope, receive, send)
            finally:
                clear_clinic_context()
        else:
            await self.app(scope, receive, send)
