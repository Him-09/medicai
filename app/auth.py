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

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or JWT_SECRET == "CHANGE_ME_USE_ENV" or len(JWT_SECRET) < 32:
    raise RuntimeError(
        "JWT_SECRET must be set and at least 32 chars. "
        "Example: export JWT_SECRET='a-long-random-secret...'"
    )

JWT_ALG = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "30"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None

class UserOut(BaseModel):
    id: str
    email: str
    clinic_id: Optional[str] = None

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, clinic_id: Optional[str] = None, **kwargs) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "clinic_id": clinic_id or DEFAULT_CLINIC_ID,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_TOKEN_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def _is_locked(locked_until: Optional[datetime]) -> bool:
    if not locked_until:
        return False
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    return locked_until > datetime.now(timezone.utc)

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 10

async def authenticate_user(email: str, password: str) -> Tuple[Optional[Dict[str, Any]], str]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT u.id, u.email, u.password_hash, u.failed_attempts, u.locked_until, u.clinic_id
                   FROM users u
                   WHERE u.email = %s""",
                (email,),
            )
            row = cur.fetchone()
            
            if not row:
                return None, "INVALID"
            
            user_id, user_email, password_hash, failed_attempts, locked_until, clinic_id = row
            
            if _is_locked(locked_until):
                return None, "LOCKED"
            
            if not verify_password(password, password_hash):
                failed = (failed_attempts or 0) + 1
                new_locked_until = None
                
                if failed >= MAX_FAILED_ATTEMPTS:
                    new_locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
                    failed = 0
                
                cur.execute(
                    "UPDATE users SET failed_attempts = %s, locked_until = %s WHERE id = %s",
                    (failed, new_locked_until, user_id),
                )
                conn.commit()
                return None, "INVALID"
            
            cur.execute(
                "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = %s",
                (user_id,),
            )
            conn.commit()
            
            user_data = {
                "id": str(user_id), 
                "email": user_email,
                "clinic_id": str(clinic_id) if clinic_id else DEFAULT_CLINIC_ID,
            }
            
            return user_data, "OK"

async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
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
            cur.execute("SELECT id, email, clinic_id, role FROM users WHERE id = %s", (user_id,))
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
                "role": row[3] or "doctor",
            }

def create_user(email: str, password: str) -> Dict[str, Any]:
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

def require_role(*allowed_roles: str):
    async def _check(user: Dict[str, Any] = Depends(get_current_user)):
        role = user.get("role", "doctor")
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}",
            )
        return user
    return _check

require_owner = require_role("doctor")
require_doctor_or_owner = require_role("doctor")
require_any_role = require_role("doctor", "assistant")
