# security/mfa.py
"""
Multi-Factor Authentication (MFA) service for MedicAI.
Provides TOTP verification, backup codes, and MFA enforcement.
"""
import json
import secrets
import hashlib
from typing import Optional, Tuple, List
from datetime import datetime, timezone
import logging

try:
    import pyotp
    TOTP_AVAILABLE = True
except ImportError:
    TOTP_AVAILABLE = False

from medicai.storage.postgres import get_conn

logger = logging.getLogger(__name__)


def is_mfa_enabled(user_id: str) -> bool:
    """Check if MFA is enabled for a user."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT totp_enabled FROM user_security_settings
                WHERE user_id = %s
            """, (user_id,))
            row = cur.fetchone()
            return row[0] if row else False


def is_mfa_required(user_id: str) -> bool:
    """
    Check if MFA is required for this user.
    Currently: MFA is mandatory for all doctors (medical staff).
    """
    # In this implementation, MFA is required for all users
    # Can be extended to check user role, clinic settings, etc.
    return True


def verify_totp(user_id: str, code: str) -> Tuple[bool, str]:
    """
    Verify a TOTP code for a user.
    
    Returns:
        Tuple of (success, message)
    """
    if not TOTP_AVAILABLE:
        return False, "TOTP not available. Install pyotp package."
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT totp_secret, totp_enabled
                FROM user_security_settings
                WHERE user_id = %s
            """, (user_id,))
            row = cur.fetchone()
            
            if not row:
                return False, "MFA not configured for this user"
            
            secret, enabled = row
            
            if not enabled or not secret:
                return False, "MFA not enabled for this user"
            
            # Verify the code
            totp = pyotp.TOTP(secret)
            if totp.verify(code, valid_window=1):
                return True, "MFA verified successfully"
            
            return False, "Invalid verification code"


def verify_backup_code(user_id: str, code: str) -> Tuple[bool, str]:
    """
    Verify and consume a backup code.
    
    Returns:
        Tuple of (success, message)
    """
    code = code.upper().strip()
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT backup_codes, backup_codes_remaining
                FROM user_security_settings
                WHERE user_id = %s AND totp_enabled = TRUE
            """, (user_id,))
            row = cur.fetchone()
            
            if not row:
                return False, "MFA not configured"
            
            backup_codes, remaining = row
            
            if not backup_codes or remaining == 0:
                return False, "No backup codes available"
            
            # Parse codes (stored as JSON array)
            codes = backup_codes if isinstance(backup_codes, list) else json.loads(backup_codes)
            
            if code not in codes:
                return False, "Invalid backup code"
            
            # Remove the used code
            codes.remove(code)
            
            cur.execute("""
                UPDATE user_security_settings
                SET backup_codes = %s::jsonb,
                    backup_codes_remaining = %s,
                    updated_at = NOW()
                WHERE user_id = %s
            """, (json.dumps(codes), len(codes), user_id))
            conn.commit()
            
            return True, f"Backup code accepted. {len(codes)} codes remaining."


def get_mfa_status(user_id: str) -> dict:
    """Get MFA status for a user."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT totp_enabled, backup_codes_remaining, created_at, updated_at
                FROM user_security_settings
                WHERE user_id = %s
            """, (user_id,))
            row = cur.fetchone()
            
            if not row:
                return {
                    "enabled": False,
                    "required": is_mfa_required(user_id),
                    "backup_codes_remaining": 0,
                    "setup_required": is_mfa_required(user_id),
                }
            
            enabled, backup_remaining, created_at, updated_at = row
            
            return {
                "enabled": enabled or False,
                "required": is_mfa_required(user_id),
                "backup_codes_remaining": backup_remaining or 0,
                "setup_required": is_mfa_required(user_id) and not enabled,
                "enabled_at": updated_at.isoformat() if updated_at and enabled else None,
            }


def generate_backup_codes(count: int = 8) -> List[str]:
    """Generate new backup codes."""
    return [secrets.token_hex(4).upper() for _ in range(count)]


def hash_backup_codes(codes: List[str]) -> List[str]:
    """Hash backup codes for storage (optional extra security)."""
    # For simplicity, we store plaintext codes
    # In high-security environments, hash them
    return codes
