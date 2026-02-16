# security/__init__.py
"""
Security module for MedicAI.
Provides session management, encryption, MFA, and security utilities.
"""

from app.security.session_manager import (
    create_session,
    validate_session,
    refresh_session,
    mark_mfa_verified,
    revoke_session,
    revoke_all_sessions,
    get_user_sessions,
    SessionInfo,
)
from app.security.file_encryption import (
    encrypt_file,
    decrypt_file,
    generate_data_key,
    EncryptedFile,
)
from app.security.tenant_context import (
    set_clinic_context,
    get_clinic_context,
    clinic_context,
)
from app.security.mfa import (
    is_mfa_enabled,
    is_mfa_required,
    verify_totp,
    verify_backup_code,
    get_mfa_status,
)
from app.security.phi_redactor import (
    redact_phi,
    configure_phi_safe_logging,
    PHIRedactingFilter,
)
from app.security.middleware import (
    add_security_middleware,
    SecurityHeadersMiddleware,
)

__all__ = [
    # Session management
    "create_session",
    "validate_session", 
    "refresh_session",
    "mark_mfa_verified",
    "revoke_session",
    "revoke_all_sessions",
    "get_user_sessions",
    "SessionInfo",
    # File encryption
    "encrypt_file",
    "decrypt_file",
    "generate_data_key",
    "EncryptedFile",
    # Tenant context
    "set_clinic_context",
    "get_clinic_context",
    "clinic_context",
    # MFA
    "is_mfa_enabled",
    "is_mfa_required",
    "verify_totp",
    "verify_backup_code",
    "get_mfa_status",
    # PHI protection
    "redact_phi",
    "configure_phi_safe_logging",
    "PHIRedactingFilter",
    # Middleware
    "add_security_middleware",
    "SecurityHeadersMiddleware",
]
