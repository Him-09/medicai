# auth_routes.py
"""
Authentication API routes for MedicAI.
Provides login, registration, and mandatory MFA support.
"""
import re
from fastapi import APIRouter, HTTPException, status, Request, Depends
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Union, List, Dict, Any

from app.auth import (
    TokenOut, MFARequiredResponse, authenticate_user, create_access_token,
    create_temp_token, decode_temp_token, ACCESS_TOKEN_MINUTES, MFA_REQUIRED,
    hash_password, get_current_user,
)
from app.security.mfa import verify_totp, verify_backup_code, get_mfa_status
from app.audit import audit_event, LOGIN_SUCCESS, LOGIN_FAILED
from medicai.storage.postgres import get_conn

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Predefined specialities (French medical) ─────────────────────────────
SPECIALITIES: List[str] = [
    "Médecine générale",
    "Cardiologie",
    "Dermatologie",
    "Endocrinologie",
    "Gastro-entérologie",
    "Gynécologie-Obstétrique",
    "Hématologie",
    "Médecine interne",
    "Néphrologie",
    "Neurologie",
    "Oncologie",
    "Ophtalmologie",
    "ORL",
    "Pédiatrie",
    "Pneumologie",
    "Psychiatrie",
    "Radiologie",
    "Rhumatologie",
    "Chirurgie générale",
    "Chirurgie orthopédique",
    "Urologie",
    "Médecine d'urgence",
    "Anesthésie-Réanimation",
    "Médecine physique et réadaptation",
    "Autre",
]


class LoginIn(BaseModel):
    """Login request payload."""
    email: EmailStr
    password: str


class MFAVerifyIn(BaseModel):
    """MFA verification request."""
    temp_token: str
    code: str
    method: str = "totp"  # "totp" or "backup_code"


class LoginResponse(BaseModel):
    """Unified login response - either token or MFA required."""
    # Success case
    access_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: Optional[int] = None
    # MFA required case
    requires_mfa: bool = False
    temp_token: Optional[str] = None
    mfa_methods: Optional[list] = None
    # MFA setup required case
    mfa_setup_required: bool = False
    message: Optional[str] = None


@router.post("/login", response_model=LoginResponse)
async def login(data: LoginIn, request: Request):
    """
    Authenticate user and return JWT access token or MFA challenge.
    
    Flow:
    1. Validate email/password
    2. If MFA enabled: return temp_token for MFA verification
    3. If MFA not enabled but required: return token with mfa_setup_required flag
    4. If MFA not required: return full access token
    
    Returns:
        LoginResponse with either access_token or requires_mfa=True
        
    Raises:
        HTTPException 401: Invalid credentials
        HTTPException 403: Account temporarily locked
    """
    # Get client IP for audit logging
    client_ip = request.client.host if request.client else "unknown"
    
    user, state = await authenticate_user(data.email, data.password)
    
    if state == "LOCKED":
        audit_event(
            user_id=user["id"] if user else "unknown",
            action=LOGIN_FAILED,
            metadata={"reason": "account_locked", "email": data.email, "ip": client_ip}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account temporarily locked due to too many failed attempts. Try again later."
        )
    
    if not user:
        audit_event(
            user_id="unknown",
            action=LOGIN_FAILED,
            metadata={"reason": "invalid_credentials", "email": data.email, "ip": client_ip}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # MFA required and enabled - require verification
    if state == "MFA_REQUIRED":
        temp_token = create_temp_token(user["id"], user.get("clinic_id"))
        return LoginResponse(
            requires_mfa=True,
            temp_token=temp_token,
            mfa_methods=["totp", "backup_code"],
            message="Please verify your identity with 2FA"
        )
    
    # MFA required but not set up yet - allow login but flag setup required
    if state == "MFA_SETUP_REQUIRED":
        token = create_access_token(
            user["id"], 
            mfa_verified=False,  # Not fully verified until MFA is set up
            clinic_id=user.get("clinic_id")
        )
        audit_event(
            user_id=user["id"],
            action=LOGIN_SUCCESS,
            metadata={"ip": client_ip, "mfa_setup_required": True}
        )
        return LoginResponse(
            access_token=token,
            expires_in=ACCESS_TOKEN_MINUTES * 60,
            mfa_setup_required=True,
            message="Please set up 2FA to secure your account"
        )
    
    # No MFA required or MFA not enabled - issue full token
    token = create_access_token(
        user["id"],
        mfa_verified=True,
        clinic_id=user.get("clinic_id")
    )
    
    audit_event(
        user_id=user["id"],
        action=LOGIN_SUCCESS,
        metadata={"ip": client_ip}
    )
    
    return LoginResponse(
        access_token=token,
        expires_in=ACCESS_TOKEN_MINUTES * 60
    )


@router.post("/verify-mfa", response_model=TokenOut)
async def verify_mfa(data: MFAVerifyIn, request: Request):
    """
    Verify MFA code and return full access token.
    
    Args:
        data: MFA verification request with temp_token and code
        
    Returns:
        TokenOut with full access token
        
    Raises:
        HTTPException 401: Invalid or expired temp token
        HTTPException 400: Invalid MFA code
    """
    client_ip = request.client.host if request.client else "unknown"
    
    # Decode temp token
    payload = decode_temp_token(data.temp_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification token. Please login again.",
        )
    
    user_id = payload.get("sub")
    clinic_id = payload.get("clinic_id")
    
    # Verify the MFA code
    if data.method == "backup_code":
        success, message = verify_backup_code(user_id, data.code)
    else:  # totp
        success, message = verify_totp(user_id, data.code)
    
    if not success:
        audit_event(
            user_id=user_id,
            action=LOGIN_FAILED,
            metadata={"reason": "invalid_mfa_code", "method": data.method, "ip": client_ip}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    # MFA verified - issue full access token
    token = create_access_token(user_id, mfa_verified=True, clinic_id=clinic_id)
    
    audit_event(
        user_id=user_id,
        action=LOGIN_SUCCESS,
        metadata={"ip": client_ip, "mfa_method": data.method}
    )
    
    return TokenOut(
        access_token=token,
        expires_in=ACCESS_TOKEN_MINUTES * 60
    )


@router.get("/mfa-status")
async def mfa_status_check(request: Request):
    """
    Check if MFA is required for this installation.
    Public endpoint for login UI to know whether to show MFA options.
    """
    return {
        "mfa_required": MFA_REQUIRED,
        "mfa_methods": ["totp", "backup_code"] if MFA_REQUIRED else [],
    }


@router.post("/logout")
async def logout():
    """
    Logout endpoint (stateless JWT - client should discard token).
    
    Note: With stateless JWT, logout is handled client-side by discarding the token.
    For session-based tokens, this would revoke the session.
    """
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Return the current authenticated user's profile.
    Used by the frontend for welcome messages, display name, etc.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT email, first_name, last_name, role, specialty
                   FROM users WHERE id = %s""",
                (user["id"],),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "User not found")
            return {
                "id": user["id"],
                "email": row[0],
                "first_name": row[1],
                "last_name": row[2],
                "role": row[3],
                "specialty": row[4],
                "clinic_id": user["clinic_id"],
            }


# ── Doctor Registration ───────────────────────────────────────────────────

class RegisterIn(BaseModel):
    """Doctor registration payload. Creates a new clinic workspace."""
    email: EmailStr
    password: str = Field(..., min_length=8)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    specialty: str = Field(..., min_length=1, max_length=200)
    clinic_name: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = None
    license_number: Optional[str] = None


class RegisterResponse(BaseModel):
    message: str
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    mfa_setup_required: bool = True
    clinic_id: str
    user_id: str


@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register_doctor(data: RegisterIn, request: Request):
    """
    Register a new doctor and create their clinic workspace.
    
    Flow:
    1. Validate email is unique
    2. Create a new clinic
    3. Create the doctor user linked to that clinic (role='doctor')
    4. Return access token (MFA setup will be required on first login)
    """
    client_ip = request.client.host if request.client else "unknown"
    email = data.email.strip().lower()
    
    # Generate a URL-safe slug from clinic name
    slug = re.sub(r'[^a-z0-9]+', '-', data.clinic_name.lower()).strip('-')
    
    try:
        import psycopg
        conn = psycopg.connect(
            "postgresql://postgres:postgres@127.0.0.1:5432/medicai",
            connect_timeout=5,
        )
    except Exception:
        from medicai.storage.postgres import get_conn
        conn = get_conn().__enter__()
    
    try:
        with conn.cursor() as cur:
            # Check if email already exists
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Un compte existe déjà avec cet email",
                )
            
            # Check slug uniqueness, append number if needed
            base_slug = slug
            counter = 1
            while True:
                cur.execute("SELECT id FROM clinics WHERE slug = %s", (slug,))
                if not cur.fetchone():
                    break
                slug = f"{base_slug}-{counter}"
                counter += 1
            
            # Create the clinic
            cur.execute("""
                INSERT INTO clinics (name, slug)
                VALUES (%s, %s)
                RETURNING id
            """, (data.clinic_name, slug))
            clinic_id = str(cur.fetchone()[0])
            
            # Create the doctor user
            password_hash = hash_password(data.password)
            cur.execute("""
                INSERT INTO users (
                    email, password_hash, role, clinic_id,
                    first_name, last_name, specialty, phone, license_number
                )
                VALUES (%s, %s, 'doctor', %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                email, password_hash, clinic_id,
                data.first_name.strip(), data.last_name.strip(),
                data.specialty, data.phone, data.license_number,
            ))
            user_id = str(cur.fetchone()[0])
            
            # Link clinic to its owner
            cur.execute(
                "UPDATE clinics SET owner_id = %s WHERE id = %s",
                (user_id, clinic_id),
            )
            
            # Create default clinic_settings row
            cur.execute("""
                INSERT INTO clinic_settings (id, settings, clinic_id)
                VALUES (DEFAULT, '{}', %s)
                ON CONFLICT DO NOTHING
            """, (clinic_id,))
            
            conn.commit()
        
        # Issue access token (MFA not yet set up)
        token = create_access_token(user_id, mfa_verified=False, clinic_id=clinic_id)
        
        audit_event(
            user_id=user_id,
            action="REGISTER",
            metadata={
                "ip": client_ip,
                "clinic_id": clinic_id,
                "specialty": data.specialty,
            },
        )
        
        return RegisterResponse(
            message="Compte créé avec succès. Veuillez configurer l'authentification à deux facteurs.",
            access_token=token,
            expires_in=ACCESS_TOKEN_MINUTES * 60,
            mfa_setup_required=True,
            clinic_id=clinic_id,
            user_id=user_id,
        )
    
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la création du compte: {str(e)}",
        )
    finally:
        conn.close()


@router.get("/specialities")
async def list_specialities():
    """Return the list of predefined medical specialities."""
    return {"specialities": SPECIALITIES}
