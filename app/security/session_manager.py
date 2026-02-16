# security/session_manager.py
"""
Session management with device tracking for MedicAI.
Provides secure session handling, device fingerprinting, and session revocation.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass
import logging

from user_agents import parse as parse_user_agent
from medicai.storage.postgres import get_conn

logger = logging.getLogger(__name__)

# Configuration
SESSION_DURATION_HOURS = 8  # Active session duration
REFRESH_TOKEN_DAYS = 30  # Refresh token validity
MAX_SESSIONS_PER_USER = 5  # Maximum concurrent sessions


@dataclass
class SessionInfo:
    """Session information returned to clients."""
    session_id: str
    device_name: str
    ip_address: str
    last_active: datetime
    created_at: datetime
    is_current: bool
    mfa_verified: bool


def _hash_token(token: str) -> str:
    """Hash a token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_token() -> str:
    """Generate a secure random token."""
    return secrets.token_urlsafe(32)


def _parse_device_name(user_agent_str: str) -> str:
    """Parse user agent to get a friendly device name."""
    try:
        ua = parse_user_agent(user_agent_str)
        browser = ua.browser.family
        os = ua.os.family
        if ua.is_mobile:
            device = ua.device.family
            return f"{browser} on {device}"
        return f"{browser} on {os}"
    except Exception:
        return "Unknown Device"


def create_session(
    user_id: str,
    clinic_id: str,
    ip_address: str,
    user_agent: str,
    mfa_verified: bool = False,
) -> Tuple[str, str, datetime]:
    """
    Create a new session for a user.
    
    Returns:
        Tuple of (access_token, refresh_token, expires_at)
    """
    session_token = _generate_token()
    refresh_token = _generate_token()
    family_id = secrets.token_hex(16)
    
    now = datetime.now(timezone.utc)
    session_expires = now + timedelta(hours=SESSION_DURATION_HOURS)
    refresh_expires = now + timedelta(days=REFRESH_TOKEN_DAYS)
    
    device_name = _parse_device_name(user_agent)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check session limit and revoke oldest if needed
            cur.execute("""
                SELECT id FROM user_sessions 
                WHERE user_id = %s AND revoked = FALSE
                ORDER BY created_at DESC
                OFFSET %s
            """, (user_id, MAX_SESSIONS_PER_USER - 1))
            old_sessions = cur.fetchall()
            
            for (old_id,) in old_sessions:
                cur.execute("""
                    UPDATE user_sessions 
                    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'session_limit'
                    WHERE id = %s
                """, (old_id,))
            
            # Create new session
            cur.execute("""
                INSERT INTO user_sessions (
                    user_id, clinic_id, token_hash, device_fingerprint,
                    user_agent, ip_address, device_name, expires_at,
                    mfa_verified, mfa_verified_at, is_current
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                RETURNING id
            """, (
                user_id, clinic_id, _hash_token(session_token),
                None,  # device_fingerprint set later
                user_agent, ip_address, device_name, session_expires,
                mfa_verified, now if mfa_verified else None
            ))
            session_id = cur.fetchone()[0]
            
            # Create refresh token
            cur.execute("""
                INSERT INTO refresh_tokens (
                    session_id, token_hash, expires_at, family_id, generation
                ) VALUES (%s, %s, %s, %s, 1)
            """, (session_id, _hash_token(refresh_token), refresh_expires, family_id))
            
            conn.commit()
    
    return session_token, refresh_token, session_expires


def validate_session(token: str) -> Optional[Dict[str, Any]]:
    """
    Validate a session token.
    
    Returns:
        User info dict if valid, None otherwise.
    """
    token_hash = _hash_token(token)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.id, s.user_id, s.clinic_id, s.mfa_verified, s.expires_at,
                       u.email
                FROM user_sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = %s
                AND s.revoked = FALSE
                AND s.expires_at > NOW()
            """, (token_hash,))
            row = cur.fetchone()
            
            if not row:
                return None
            
            session_id, user_id, clinic_id, mfa_verified, expires_at, email = row
            
            # Update last active
            cur.execute("""
                UPDATE user_sessions SET last_active_at = NOW()
                WHERE id = %s
            """, (session_id,))
            conn.commit()
            
            return {
                "session_id": str(session_id),
                "user_id": str(user_id),
                "clinic_id": str(clinic_id),
                "email": email,
                "mfa_verified": mfa_verified,
            }


def refresh_session(refresh_token: str) -> Optional[Tuple[str, str, datetime]]:
    """
    Refresh a session using a refresh token.
    Implements token rotation for security.
    
    Returns:
        Tuple of (new_access_token, new_refresh_token, expires_at) or None
    """
    token_hash = _hash_token(refresh_token)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Find the refresh token
            cur.execute("""
                SELECT rt.id, rt.session_id, rt.family_id, rt.generation, rt.is_used,
                       s.user_id, s.clinic_id, s.user_agent, s.ip_address, s.mfa_verified
                FROM refresh_tokens rt
                JOIN user_sessions s ON s.id = rt.session_id
                WHERE rt.token_hash = %s
                AND rt.expires_at > NOW()
            """, (token_hash,))
            row = cur.fetchone()
            
            if not row:
                return None
            
            (rt_id, session_id, family_id, generation, is_used,
             user_id, clinic_id, user_agent, ip_address, mfa_verified) = row
            
            # Check for token reuse (potential theft)
            if is_used:
                logger.warning(f"Refresh token reuse detected for user {user_id}! Revoking all sessions.")
                # Revoke entire token family (all sessions from this chain)
                cur.execute("""
                    UPDATE user_sessions SET revoked = TRUE, revoked_at = NOW(), 
                           revoked_reason = 'token_reuse_detected'
                    WHERE id IN (
                        SELECT DISTINCT session_id FROM refresh_tokens WHERE family_id = %s
                    )
                """, (family_id,))
                conn.commit()
                return None
            
            # Mark current refresh token as used
            cur.execute("""
                UPDATE refresh_tokens SET is_used = TRUE, used_at = NOW()
                WHERE id = %s
            """, (rt_id,))
            
            # Generate new tokens
            new_session_token = _generate_token()
            new_refresh_token = _generate_token()
            
            now = datetime.now(timezone.utc)
            session_expires = now + timedelta(hours=SESSION_DURATION_HOURS)
            refresh_expires = now + timedelta(days=REFRESH_TOKEN_DAYS)
            
            # Update session with new token
            cur.execute("""
                UPDATE user_sessions 
                SET token_hash = %s, expires_at = %s, last_active_at = NOW()
                WHERE id = %s
            """, (_hash_token(new_session_token), session_expires, session_id))
            
            # Create new refresh token in same family
            cur.execute("""
                INSERT INTO refresh_tokens (
                    session_id, token_hash, expires_at, family_id, generation
                ) VALUES (%s, %s, %s, %s, %s)
            """, (session_id, _hash_token(new_refresh_token), refresh_expires, 
                  family_id, generation + 1))
            
            conn.commit()
            
            return new_session_token, new_refresh_token, session_expires


def mark_mfa_verified(session_token: str) -> bool:
    """Mark a session as MFA verified."""
    token_hash = _hash_token(session_token)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE user_sessions 
                SET mfa_verified = TRUE, mfa_verified_at = NOW()
                WHERE token_hash = %s AND revoked = FALSE
                RETURNING id
            """, (token_hash,))
            result = cur.fetchone()
            conn.commit()
            return result is not None


def revoke_session(session_id: str, reason: str = "manual") -> bool:
    """Revoke a specific session."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE user_sessions 
                SET revoked = TRUE, revoked_at = NOW(), revoked_reason = %s
                WHERE id = %s AND revoked = FALSE
                RETURNING id
            """, (reason, session_id))
            result = cur.fetchone()
            conn.commit()
            return result is not None


def revoke_all_sessions(user_id: str, exclude_session_id: Optional[str] = None) -> int:
    """Revoke all sessions for a user, optionally excluding one."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if exclude_session_id:
                cur.execute("""
                    UPDATE user_sessions 
                    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'logout_all'
                    WHERE user_id = %s AND revoked = FALSE AND id != %s
                """, (user_id, exclude_session_id))
            else:
                cur.execute("""
                    UPDATE user_sessions 
                    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'logout_all'
                    WHERE user_id = %s AND revoked = FALSE
                """, (user_id,))
            count = cur.rowcount
            conn.commit()
            return count


def get_user_sessions(user_id: str, current_session_id: Optional[str] = None) -> List[SessionInfo]:
    """Get all active sessions for a user."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, device_name, ip_address, last_active_at, created_at, mfa_verified
                FROM user_sessions
                WHERE user_id = %s AND revoked = FALSE AND expires_at > NOW()
                ORDER BY last_active_at DESC
            """, (user_id,))
            rows = cur.fetchall()
            
            return [
                SessionInfo(
                    session_id=str(row[0]),
                    device_name=row[1] or "Unknown",
                    ip_address=str(row[2]) if row[2] else "Unknown",
                    last_active=row[3],
                    created_at=row[4],
                    is_current=(str(row[0]) == current_session_id),
                    mfa_verified=row[5] or False,
                )
                for row in rows
            ]
