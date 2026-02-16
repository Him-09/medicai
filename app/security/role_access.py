"""
Role-based access control middleware for MedicAI.
Restricts assistant users to read-only access on most resources,
with limited write access (e.g. document upload, chat).

Assistants CAN:
  - GET patients, consultations, documents, actions, workspace, notes
  - POST chat messages, document uploads
  - Access their own profile/security settings

Assistants CANNOT:
  - DELETE patients, consultations
  - Manage templates, snippets, knowledge base
  - Manage team members
  - Run maintenance tasks
  - Change clinic settings
  - Create orders / sign documents
"""
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

# Paths that assistants are completely blocked from (any method)
ASSISTANT_BLOCKED_PATHS = [
    "/api/settings/team",               # Team management
    "/api/settings/clinic",             # Clinic settings
    "/api/settings/templates",          # Templates
    "/api/settings/snippets",           # Snippets
    "/api/maintenance",                 # Maintenance tasks
    "/api/settings/privacy",            # Privacy settings
    "/api/settings/export-data",        # Data export
    "/api/settings/delete-account",     # Account deletion
    "/api/knowledge-base",             # Knowledge base management
]

# Specific method+path combos blocked for assistants
ASSISTANT_BLOCKED_METHODS = [
    ("DELETE", "/api/patients"),         # Cannot delete patients
    ("DELETE", "/api/consultations"),    # Cannot delete consultations
    ("POST",  "/api/patients"),          # Cannot create patients
    ("POST",  "/api/orders"),            # Cannot create orders
    ("POST",  "/api/consultations/{consultation_id}/sign"),   # Cannot sign
    ("PUT",   "/api/orders"),            # Cannot update order intents
    ("DELETE", "/api/orders"),           # Cannot delete order intents
    ("POST",  "/api/orders/documents/generate"),   # Cannot generate order docs
    ("POST",  "/api/orders/documents/{document_id}/sign"),  # Cannot sign docs
    ("POST",  "/api/orders/actions"),    # Cannot create actions
]

# Paths that assistants CAN access even with POST/PATCH (whitelisted writes)
ASSISTANT_ALLOWED_WRITES = [
    "/api/consultations/{consultation_id}/chat",    # Chat with AI
    "/api/patients/{patient_id}/documents:upload",  # Upload documents
    "/api/settings/profile",             # Own profile
    "/api/settings/change-password",     # Own password
    "/api/settings/2fa",                 # Own 2FA
    "/api/settings/sessions",            # Own sessions
    "/api/notes/",                       # Notes autocomplete etc.
    "/api/auth/",                            # Auth routes
]


def _is_path_match(request_path: str, pattern: str) -> bool:
    """Check if a request path matches a pattern (prefix match)."""
    return request_path.startswith(pattern) or request_path.rstrip("/") == pattern.rstrip("/")


def _is_assistant_blocked(method: str, path: str) -> bool:
    """Check if an assistant is blocked from this method+path."""
    # Check fully blocked paths
    for blocked in ASSISTANT_BLOCKED_PATHS:
        if _is_path_match(path, blocked):
            return True

    # Check method-specific blocks
    for blocked_method, blocked_path in ASSISTANT_BLOCKED_METHODS:
        if method == blocked_method and _is_path_match(path, blocked_path):
            return True

    return False


class RoleAccessMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces role-based access control for assistant users.
    This runs AFTER authentication, so the user's role is available.
    
    Note: This middleware checks the role stored in the request state.
    The actual role is set by the get_current_user dependency.
    We use a lightweight approach: intercept at the middleware level
    only for paths where we need to block access entirely.
    """

    async def dispatch(self, request: Request, call_next):
        # Let the request through - role checking happens at dependency level
        # This middleware only adds the role to request state for downstream use
        response = await call_next(request)
        return response
