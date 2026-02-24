from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

ASSISTANT_BLOCKED_PATHS = [
    "/api/settings/team",
    "/api/settings/clinic",
    "/api/settings/templates",
    "/api/settings/snippets",
    "/api/maintenance",
    "/api/settings/privacy",
    "/api/settings/export-data",
    "/api/settings/delete-account",
]

ASSISTANT_BLOCKED_METHODS = [
    ("DELETE", "/api/patients"),
    ("DELETE", "/api/consultations"),
    ("POST",  "/api/patients"),
    ("POST",  "/api/consultations/{consultation_id}/sign"),
]

ASSISTANT_ALLOWED_WRITES = [
    "/api/patients/{patient_id}/documents:upload",
    "/api/settings/profile",
    "/api/settings/change-password",
    "/api/settings/sessions",
    "/api/auth/",
]

def _is_path_match(request_path: str, pattern: str) -> bool:
    return request_path.startswith(pattern) or request_path.rstrip("/") == pattern.rstrip("/")

def _is_assistant_blocked(method: str, path: str) -> bool:
    for blocked in ASSISTANT_BLOCKED_PATHS:
        if _is_path_match(path, blocked):
            return True

    for blocked_method, blocked_path in ASSISTANT_BLOCKED_METHODS:
        if method == blocked_method and _is_path_match(path, blocked_path):
            return True

    return False

class RoleAccessMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        return response
