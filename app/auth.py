# auth.py
"""
Authentication module for MedicAI.
Provides JWT-based authentication with bcrypt password hashing, account lockout,
mandatory MFA, and session-based token management.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict, Any
import os

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import dotenv

dotenv.load_dotenv()

from medicai.storage.postgres import get_conn
from app.security.tenant_context import set_clinic_context, DEFAULT_CLINIC_ID

# Configuration from environment
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or JWT_SECRET == "CHANGE_ME_USE_ENV" or len(JWT_SECRET) < 32:
    raise RuntimeError(
        "JWT_SECRET must be set and at least 32 chars. "
        "Example: export JWT_SECRET='a-long-random-secret...'"
    )

JWT_ALG = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "30"))
TEMP_TOKEN_MINUTES = 5  # Short-lived token for MFA flow
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 10

# MFA enforcement
MFA_REQUIRED = os.getenv("MFA_REQUIRED", "true").lower() == "true"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


class TokenOut(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None  # seconds until expiry


class MFARequiredResponse(BaseModel):
    """Response when MFA verification is required."""
    requires_mfa: bool = True
    temp_token: str
    mfa_methods: list = ["totp", "backup_code"]
    message: str = "MFA verification required"


class UserOut(BaseModel):
    """User data returned from authentication."""
    id: str
    email: str
    clinic_id: Optional[str] = None
    mfa_verified: bool = False


def hash_password(password: str) -> str:
    """Hash a password using bcrypt with salt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, mfa_verified: bool = True, clinic_id: Optional[str] = None) -> str:
    """Create a JWT access token for a user."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "clinic_id": clinic_id or DEFAULT_CLINIC_ID,
        "mfa_verified": mfa_verified,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_TOKEN_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def create_temp_token(user_id: str, clinic_id: Optional[str] = None) -> str:
    """
    Create a short-lived temporary token for MFA verification flow.
    This token cannot be used for API access - only for /auth/verify-mfa.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "clinic_id": clinic_id or DEFAULT_CLINIC_ID,
        "type": "mfa_pending",  # Mark as MFA-pending token
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=TEMP_TOKEN_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_temp_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a temporary MFA token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "mfa_pending":
            return None
        return payload
    except jwt.PyJWTError:
        return None


def _is_locked(locked_until: Optional[datetime]) -> bool:
    """Check if account is currently locked."""
    if not locked_until:
        return False
    # Ensure timezone awareness
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    return locked_until > datetime.now(timezone.utc)


async def authenticate_user(email: str, password: str) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Authenticate a user by email and password.
    
    Returns:
        Tuple of (user_dict or None, status_string)
        Status can be: "OK", "INVALID", "LOCKED", "MFA_REQUIRED"
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT u.id, u.email, u.password_hash, u.failed_attempts, u.locked_until, u.clinic_id,
                          COALESCE(s.totp_enabled, FALSE) as mfa_enabled
                   FROM users u
                   LEFT JOIN user_security_settings s ON s.user_id = u.id
                   WHERE u.email = %s""",
                (email,),
            )
            row = cur.fetchone()
            
            if not row:
                return None, "INVALID"
            
            user_id, user_email, password_hash, failed_attempts, locked_until, clinic_id, mfa_enabled = row
            
            if _is_locked(locked_until):
                return None, "LOCKED"
            
            if not verify_password(password, password_hash):
                # Increment failed attempts
                failed = (failed_attempts or 0) + 1
                new_locked_until = None
                
                if failed >= MAX_FAILED_ATTEMPTS:
                    new_locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
                    failed = 0  # Reset after lock to avoid perma-lock loops
                
                cur.execute(
                    "UPDATE users SET failed_attempts = %s, locked_until = %s WHERE id = %s",
                    (failed, new_locked_until, user_id),
                )
                conn.commit()
                return None, "INVALID"
            
            # Success: reset counters
            cur.execute(
                "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = %s",
                (user_id,),
            )
            conn.commit()
            
            user_data = {
                "id": str(user_id), 
                "email": user_email,
                "clinic_id": str(clinic_id) if clinic_id else DEFAULT_CLINIC_ID,
                "mfa_enabled": mfa_enabled,
            }
            
            # Check if MFA is required
            if MFA_REQUIRED and mfa_enabled:
                return user_data, "MFA_REQUIRED"
            elif MFA_REQUIRED and not mfa_enabled:
                # MFA required but not set up - user needs to set up MFA
                return user_data, "MFA_SETUP_REQUIRED"
            
            return user_data, "OK"


async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """
    Dependency to get the current authenticated user from JWT token.
    Requires MFA verification if MFA_REQUIRED is enabled.
    
    Raises:
        HTTPException: If token is invalid, expired, or MFA not verified.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            raise credentials_exception
        
        # Check for temp token (MFA pending)
        if payload.get("type") == "mfa_pending":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="MFA verification required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Enforce MFA verification
        if MFA_REQUIRED and not payload.get("mfa_verified", False):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="MFA verification required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        clinic_id = payload.get("clinic_id", DEFAULT_CLINIC_ID)
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise credentials_exception
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email, clinic_id, role FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found",
                )
            
            # Set tenant context for RLS
            user_clinic_id = str(row[2]) if row[2] else clinic_id
            set_clinic_context(user_clinic_id)
            
            return {
                "id": str(row[0]), 
                "email": row[1],
                "clinic_id": user_clinic_id,
                "role": row[3] or "doctor",
                "mfa_verified": payload.get("mfa_verified", False),
            }


async def get_current_user_optional_mfa(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """
    Dependency for endpoints that don't require MFA (like MFA setup).
    Still validates the token but doesn't enforce MFA verification.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            raise credentials_exception
        
        clinic_id = payload.get("clinic_id", DEFAULT_CLINIC_ID)
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise credentials_exception
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email, clinic_id FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found",
                )
            
            user_clinic_id = str(row[2]) if row[2] else clinic_id
            set_clinic_context(user_clinic_id)
            
            return {
                "id": str(row[0]), 
                "email": row[1],
                "clinic_id": user_clinic_id,
                "mfa_verified": payload.get("mfa_verified", False),
            }


def create_user(email: str, password: str) -> Dict[str, Any]:
    """
    Create a new user (admin utility function).
    
    Returns:
        Dict with user id and email.
    """
    password_hash = hash_password(password)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (email, password_hash) 
                   VALUES (%s, %s) 
                   RETURNING id, email""",
                (email, password_hash),
            )
            row = cur.fetchone()
            conn.commit()
            
            return {"id": str(row[0]), "email": row[1]}


# ==========================================================================
# Role-based access control helpers
# ==========================================================================

def require_role(*allowed_roles: str):
    """
    Dependency factory: restrict endpoint access to specific roles.
    Usage:  Depends(require_role("owner", "doctor"))
    """
    async def _check(user: Dict[str, Any] = Depends(get_current_user)):
        role = user.get("role", "doctor")
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}",
            )
        return user
    return _check


# Convenience shortcuts  (doctor IS the clinic owner in the new architecture)
require_owner = require_role("doctor")           # doctor = clinic owner
require_doctor_or_owner = require_role("doctor")  # kept for backward compat
require_any_role = require_role("doctor", "assistant")
