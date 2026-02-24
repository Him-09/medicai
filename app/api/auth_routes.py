import re
from fastapi import APIRouter, HTTPException, status, Request, Depends
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any

from app.auth import (
    TokenOut, authenticate_user, create_access_token,
    ACCESS_TOKEN_MINUTES,
    hash_password, get_current_user,
)
from app.audit import audit_event, LOGIN_SUCCESS, LOGIN_FAILED
from medicai.storage.postgres import get_conn

router = APIRouter(prefix="/api/auth", tags=["auth"])

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
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: Optional[int] = None
    message: Optional[str] = None

@router.post("/login", response_model=LoginResponse)
async def login(data: LoginIn, request: Request):
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
    
    token = create_access_token(
        user["id"],
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

@router.post("/logout")
async def logout():
    return {"message": "Logged out successfully"}

@router.get("/me")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)):
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

class RegisterIn(BaseModel):
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
    clinic_id: str
    user_id: str

@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register_doctor(data: RegisterIn, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    email = data.email.strip().lower()
    
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
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Un compte existe déjà avec cet email",
                )
            
            base_slug = slug
            counter = 1
            while True:
                cur.execute("SELECT id FROM clinics WHERE slug = %s", (slug,))
                if not cur.fetchone():
                    break
                slug = f"{base_slug}-{counter}"
                counter += 1
            
            cur.execute("""
                INSERT INTO clinics (name, slug)
                VALUES (%s, %s)
                RETURNING id
            """, (data.clinic_name, slug))
            clinic_id = str(cur.fetchone()[0])
            
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
            
            cur.execute(
                "UPDATE clinics SET owner_id = %s WHERE id = %s",
                (user_id, clinic_id),
            )
            
            cur.execute("""
                INSERT INTO clinic_settings (id, settings, clinic_id)
                VALUES (DEFAULT, '{}', %s)
                ON CONFLICT DO NOTHING
            """, (clinic_id,))
            
            conn.commit()
        
        token = create_access_token(user_id, clinic_id=clinic_id)
        
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
            message="Compte créé avec succès.",
            access_token=token,
            expires_in=ACCESS_TOKEN_MINUTES * 60,
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
    return {"specialities": SPECIALITIES}
