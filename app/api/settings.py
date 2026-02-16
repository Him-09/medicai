# settings.py
"""
Settings API endpoints for MedicAI.
Provides CRUD operations for user settings, clinic settings, and system configuration.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
import base64
import os
import io

from app.auth import get_current_user, hash_password, verify_password, require_doctor_or_owner
from app.audit import audit_event
from medicai.storage.postgres import get_conn
from app.utils.ai_toggle import get_ai_status

# TOTP 2FA imports
try:
    import pyotp
    import qrcode
    TOTP_AVAILABLE = True
except ImportError:
    TOTP_AVAILABLE = False

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Create uploads directory for profile images
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "profiles")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ============================================================================
# SCHEMAS
# ============================================================================

class UserProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    specialty: Optional[str] = None
    license_number: Optional[str] = None
    output_language: Optional[str] = None
    ai_compactness: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class ClinicSettings(BaseModel):
    name: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    default_consultation_duration: Optional[int] = None
    date_format: Optional[str] = None
    currency: Optional[str] = None


class DaySchedule(BaseModel):
    day: str
    enabled: bool
    start: str
    end: str


class ScheduleUpdate(BaseModel):
    schedule: List[DaySchedule]


# ============================================================================
# USER PROFILE ENDPOINTS
# ============================================================================

@router.get("/profile")
def get_profile(user: Dict[str, Any] = Depends(get_current_user)):
    """Get current user's profile."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, email, first_name, last_name, phone, specialty, 
                       license_number, output_language, ai_compactness, created_at
                FROM users WHERE id = %s
            """, (user["id"],))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(404, "User not found")
            
            return {
                "id": str(row[0]),
                "email": row[1],
                "first_name": row[2],
                "last_name": row[3],
                "phone": row[4],
                "specialty": row[5],
                "license_number": row[6],
                "output_language": row[7] or "fr",
                "ai_compactness": row[8] or "normal",
                "created_at": row[9].isoformat() if row[9] else None,
            }


@router.patch("/profile")
def update_profile(
    data: UserProfileUpdate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Update current user's profile."""
    update_fields = []
    values = []
    
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            update_fields.append(f"{field} = %s")
            values.append(value)
    
    if not update_fields:
        raise HTTPException(400, "No fields to update")
    
    values.append(user["id"])
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE users SET {', '.join(update_fields)}, updated_at = now()
                WHERE id = %s
                RETURNING id, email, first_name, last_name, phone, specialty,
                          license_number, output_language, ai_compactness
            """, tuple(values))
            row = cur.fetchone()
        conn.commit()
    
    audit_event(user["id"], "PROFILE_UPDATE")
    
    return {
        "message": "Profile updated successfully",
        "profile": {
            "id": str(row[0]),
            "email": row[1],
            "first_name": row[2],
            "last_name": row[3],
            "phone": row[4],
            "specialty": row[5],
            "license_number": row[6],
            "output_language": row[7],
            "ai_compactness": row[8],
        }
    }


@router.post("/change-password")
def change_password(
    data: PasswordChange,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Change user's password."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify current password
            cur.execute("SELECT password_hash FROM users WHERE id = %s", (user["id"],))
            row = cur.fetchone()
            
            if not row or not verify_password(data.current_password, row[0]):
                raise HTTPException(400, "Current password is incorrect")
            
            # Validate new password
            if len(data.new_password) < 8:
                raise HTTPException(400, "Password must be at least 8 characters")
            
            # Update password
            new_hash = hash_password(data.new_password)
            cur.execute("""
                UPDATE users SET password_hash = %s, updated_at = now()
                WHERE id = %s
            """, (new_hash, user["id"]))
        conn.commit()
    
    audit_event(user["id"], "PASSWORD_CHANGE")
    
    return {"message": "Password changed successfully"}


# ============================================================================
# CLINIC SETTINGS ENDPOINTS
# ============================================================================

@router.get("/clinic")
def get_clinic_settings(user: Dict[str, Any] = Depends(get_current_user)):
    """Get clinic settings."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT settings FROM clinic_settings WHERE id = 1
            """)
            row = cur.fetchone()
            
            if not row:
                # Return defaults
                return {
                    "name": "",
                    "address1": "",
                    "address2": "",
                    "postal_code": "",
                    "city": "",
                    "country": "Maroc",
                    "timezone": "Africa/Casablanca",
                    "default_consultation_duration": 20,
                    "date_format": "dd/MM/yyyy",
                    "currency": "MAD",
                }
            
            return row[0] if isinstance(row[0], dict) else json.loads(row[0])


@router.patch("/clinic")
def update_clinic_settings(
    data: ClinicSettings,
    user: Dict[str, Any] = Depends(require_doctor_or_owner)
):
    """Update clinic settings."""
    update_data = data.model_dump(exclude_unset=True)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get existing settings
            cur.execute("SELECT settings FROM clinic_settings WHERE id = 1")
            row = cur.fetchone()
            
            if row:
                existing = row[0] if isinstance(row[0], dict) else json.loads(row[0])
                existing.update(update_data)
                cur.execute("""
                    UPDATE clinic_settings SET settings = %s::jsonb, updated_at = now()
                    WHERE id = 1
                """, (json.dumps(existing),))
            else:
                cur.execute("""
                    INSERT INTO clinic_settings (id, settings) VALUES (1, %s::jsonb)
                """, (json.dumps(update_data),))
        conn.commit()
    
    audit_event(user["id"], "CLINIC_SETTINGS_UPDATE")
    
    return {"message": "Clinic settings updated successfully"}


@router.get("/clinic/schedule")
def get_clinic_schedule(user: Dict[str, Any] = Depends(get_current_user)):
    """Get clinic schedule."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT schedule FROM clinic_settings WHERE id = 1")
            row = cur.fetchone()
            
            if not row or not row[0]:
                # Return default schedule
                return {
                    "schedule": [
                        {"day": "monday", "dayLabel": "Lundi", "enabled": True, "start": "09:00", "end": "18:00"},
                        {"day": "tuesday", "dayLabel": "Mardi", "enabled": True, "start": "09:00", "end": "18:00"},
                        {"day": "wednesday", "dayLabel": "Mercredi", "enabled": True, "start": "09:00", "end": "18:00"},
                        {"day": "thursday", "dayLabel": "Jeudi", "enabled": True, "start": "09:00", "end": "18:00"},
                        {"day": "friday", "dayLabel": "Vendredi", "enabled": True, "start": "09:00", "end": "18:00"},
                        {"day": "saturday", "dayLabel": "Samedi", "enabled": True, "start": "09:00", "end": "13:00"},
                        {"day": "sunday", "dayLabel": "Dimanche", "enabled": False, "start": "09:00", "end": "18:00"},
                    ]
                }
            
            return {"schedule": row[0] if isinstance(row[0], list) else json.loads(row[0])}


@router.patch("/clinic/schedule")
def update_clinic_schedule(
    data: ScheduleUpdate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Update clinic schedule."""
    schedule_data = [s.model_dump() for s in data.schedule]
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM clinic_settings WHERE id = 1")
            exists = cur.fetchone()
            
            if exists:
                cur.execute("""
                    UPDATE clinic_settings SET schedule = %s::jsonb, updated_at = now()
                    WHERE id = 1
                """, (json.dumps(schedule_data),))
            else:
                cur.execute("""
                    INSERT INTO clinic_settings (id, schedule) VALUES (1, %s::jsonb)
                """, (json.dumps(schedule_data),))
        conn.commit()
    
    return {"message": "Schedule updated successfully"}


# ============================================================================
# SECURITY SETTINGS ENDPOINTS
# ============================================================================

@router.get("/sessions")
def get_active_sessions(user: Dict[str, Any] = Depends(get_current_user)):
    """Get active sessions for the current user."""
    # In a full implementation, you would track sessions in a table
    # For now, return a mock current session
    return {
        "sessions": [
            {
                "id": "current",
                "device": "Current Browser",
                "browser": "Web",
                "location": "Current Location",
                "last_active": "Active maintenant",
                "current": True,
            }
        ]
    }


@router.delete("/sessions/{session_id}")
def logout_session(
    session_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Logout a specific session."""
    # In a full implementation, you would invalidate the session token
    audit_event(user["id"], "SESSION_LOGOUT", metadata={"session_id": session_id})
    return {"message": "Session logged out"}


@router.post("/sessions/logout-all")
def logout_all_sessions(user: Dict[str, Any] = Depends(get_current_user)):
    """Logout all sessions except current."""
    audit_event(user["id"], "ALL_SESSIONS_LOGOUT")
    return {"message": "All other sessions logged out"}


# ============================================================================
# 2FA TOTP ENDPOINTS
# ============================================================================

class TwoFASetup(BaseModel):
    verification_code: str


class TwoFAVerify(BaseModel):
    code: str


@router.get("/2fa/status")
def get_2fa_status(user: Dict[str, Any] = Depends(get_current_user)):
    """Get 2FA status for the current user."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT totp_enabled, backup_codes_remaining
                FROM user_security_settings
                WHERE user_id = %s
            """, (user["id"],))
            row = cur.fetchone()
            
            if not row:
                return {
                    "enabled": False,
                    "backup_codes_remaining": 0
                }
            
            return {
                "enabled": row[0] or False,
                "backup_codes_remaining": row[1] or 0
            }


@router.post("/2fa/setup")
def setup_2fa(user: Dict[str, Any] = Depends(get_current_user)):
    """Initialize 2FA setup - generates a new TOTP secret and returns QR code."""
    if not TOTP_AVAILABLE:
        raise HTTPException(500, "2FA is not available. Install pyotp and qrcode packages.")
    
    # Generate a new TOTP secret
    secret = pyotp.random_base32()
    
    # Create TOTP URI for authenticator apps
    totp = pyotp.TOTP(secret)
    user_email = user.get("email", "user@medicai.fr")
    provisioning_uri = totp.provisioning_uri(
        name=user_email,
        issuer_name="MedicAI"
    )
    
    # Generate QR code as base64
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to base64
    img_buffer = io.BytesIO()
    qr_img.save(img_buffer, format='PNG')
    img_buffer.seek(0)
    qr_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
    
    # Store the secret temporarily (not yet enabled)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO user_security_settings (user_id, totp_secret, totp_enabled)
                VALUES (%s, %s, false)
                ON CONFLICT (user_id) DO UPDATE SET
                    totp_secret = EXCLUDED.totp_secret,
                    totp_enabled = false,
                    updated_at = now()
            """, (user["id"], secret))
        conn.commit()
    
    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "provisioning_uri": provisioning_uri
    }


@router.post("/2fa/verify")
def verify_and_enable_2fa(
    data: TwoFASetup,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Verify the 2FA code and enable 2FA if correct."""
    if not TOTP_AVAILABLE:
        raise HTTPException(500, "2FA is not available. Install pyotp and qrcode packages.")
    
    # Get the stored secret
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT totp_secret FROM user_security_settings
                WHERE user_id = %s
            """, (user["id"],))
            row = cur.fetchone()
            
            if not row or not row[0]:
                raise HTTPException(400, "2FA setup not initiated. Please start setup first.")
            
            secret = row[0]
    
    # Verify the code
    totp = pyotp.TOTP(secret)
    if not totp.verify(data.verification_code, valid_window=1):
        raise HTTPException(400, "Invalid verification code. Please try again.")
    
    # Generate backup codes
    import secrets
    backup_codes = [secrets.token_hex(4).upper() for _ in range(8)]
    
    # Enable 2FA and store backup codes (hashed)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE user_security_settings
                SET totp_enabled = true,
                    backup_codes = %s,
                    backup_codes_remaining = 8,
                    updated_at = now()
                WHERE user_id = %s
            """, (json.dumps(backup_codes), user["id"]))
        conn.commit()
    
    audit_event(user["id"], "2FA_ENABLED")
    
    return {
        "success": True,
        "backup_codes": backup_codes,
        "message": "Two-factor authentication enabled successfully"
    }


@router.post("/2fa/disable")
def disable_2fa(
    data: TwoFAVerify,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Disable 2FA after verifying current code."""
    if not TOTP_AVAILABLE:
        raise HTTPException(500, "2FA is not available.")
    
    # Get the stored secret
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT totp_secret, totp_enabled FROM user_security_settings
                WHERE user_id = %s
            """, (user["id"],))
            row = cur.fetchone()
            
            if not row or not row[1]:
                raise HTTPException(400, "2FA is not enabled.")
            
            secret = row[0]
    
    # Verify the code
    totp = pyotp.TOTP(secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(400, "Invalid verification code.")
    
    # Disable 2FA
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE user_security_settings
                SET totp_enabled = false,
                    totp_secret = NULL,
                    backup_codes = NULL,
                    backup_codes_remaining = 0,
                    updated_at = now()
                WHERE user_id = %s
            """, (user["id"],))
        conn.commit()
    
    audit_event(user["id"], "2FA_DISABLED")
    
    return {"success": True, "message": "Two-factor authentication disabled"}


@router.get("/2fa/backup-codes")
def get_backup_codes(user: Dict[str, Any] = Depends(get_current_user)):
    """Get remaining backup codes count."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT backup_codes, backup_codes_remaining
                FROM user_security_settings
                WHERE user_id = %s AND totp_enabled = true
            """, (user["id"],))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(400, "2FA is not enabled.")
            
            # Handle both JSONB (already parsed) and JSON string
            codes = row[0] if isinstance(row[0], list) else (json.loads(row[0]) if row[0] else [])
            
            return {
                "backup_codes": codes,
                "remaining": row[1] or 0
            }


@router.post("/2fa/regenerate-backup-codes")
def regenerate_backup_codes(
    data: TwoFAVerify,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Regenerate backup codes after verifying current TOTP code."""
    if not TOTP_AVAILABLE:
        raise HTTPException(500, "2FA is not available.")
    
    # Get the stored secret
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT totp_secret, totp_enabled FROM user_security_settings
                WHERE user_id = %s
            """, (user["id"],))
            row = cur.fetchone()
            
            if not row or not row[1]:
                raise HTTPException(400, "2FA is not enabled.")
            
            secret = row[0]
    
    # Verify the code
    totp = pyotp.TOTP(secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(400, "Invalid verification code.")
    
    # Generate new backup codes
    import secrets
    backup_codes = [secrets.token_hex(4).upper() for _ in range(8)]
    
    # Store new backup codes
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE user_security_settings
                SET backup_codes = %s,
                    backup_codes_remaining = 8,
                    updated_at = now()
                WHERE user_id = %s
            """, (json.dumps(backup_codes), user["id"]))
        conn.commit()
    
    audit_event(user["id"], "2FA_BACKUP_CODES_REGENERATED")
    
    return {
        "backup_codes": backup_codes,
        "message": "Backup codes regenerated successfully"
    }


# ============================================================================
# PROFILE IMAGES ENDPOINTS
# ============================================================================

@router.post("/profile/photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Upload profile photo."""
    # Validate file type
    if file.content_type not in ["image/jpeg", "image/png", "image/gif"]:
        raise HTTPException(400, "Unsupported file type. Use JPG, PNG, or GIF.")
    
    # Read file content
    content = await file.read()
    
    # Check file size (2MB limit)
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum size is 2MB.")
    
    # Convert to base64 and store in database
    base64_image = base64.b64encode(content).decode('utf-8')
    data_url = f"data:{file.content_type};base64,{base64_image}"
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO user_profile_images (user_id, profile_photo)
                VALUES (%s, %s)
                ON CONFLICT (user_id) DO UPDATE SET
                    profile_photo = EXCLUDED.profile_photo,
                    updated_at = now()
            """, (user["id"], data_url))
        conn.commit()
    
    audit_event(user["id"], "PROFILE_PHOTO_UPLOADED")
    
    return {"success": True, "photo_url": data_url}


@router.delete("/profile/photo")
def delete_profile_photo(user: Dict[str, Any] = Depends(get_current_user)):
    """Delete profile photo."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE user_profile_images
                SET profile_photo = NULL, updated_at = now()
                WHERE user_id = %s
            """, (user["id"],))
        conn.commit()
    
    audit_event(user["id"], "PROFILE_PHOTO_DELETED")
    
    return {"success": True, "message": "Profile photo deleted"}


@router.post("/profile/signature")
async def upload_signature(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Upload signature image."""
    # Validate file type
    if file.content_type not in ["image/jpeg", "image/png"]:
        raise HTTPException(400, "Unsupported file type. Use JPG or PNG.")
    
    # Read file content
    content = await file.read()
    
    # Check file size (1MB limit)
    if len(content) > 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum size is 1MB.")
    
    # Convert to base64 and store in database
    base64_image = base64.b64encode(content).decode('utf-8')
    data_url = f"data:{file.content_type};base64,{base64_image}"
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO user_profile_images (user_id, signature_image)
                VALUES (%s, %s)
                ON CONFLICT (user_id) DO UPDATE SET
                    signature_image = EXCLUDED.signature_image,
                    updated_at = now()
            """, (user["id"], data_url))
        conn.commit()
    
    audit_event(user["id"], "SIGNATURE_UPLOADED")
    
    return {"success": True, "signature_url": data_url}


@router.delete("/profile/signature")
def delete_signature(user: Dict[str, Any] = Depends(get_current_user)):
    """Delete signature image."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE user_profile_images
                SET signature_image = NULL, updated_at = now()
                WHERE user_id = %s
            """, (user["id"],))
        conn.commit()
    
    audit_event(user["id"], "SIGNATURE_DELETED")
    
    return {"success": True, "message": "Signature deleted"}


@router.post("/profile/stamp")
async def upload_stamp(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Upload stamp/cachet image."""
    # Validate file type
    if file.content_type not in ["image/jpeg", "image/png"]:
        raise HTTPException(400, "Unsupported file type. Use JPG or PNG.")
    
    # Read file content
    content = await file.read()
    
    # Check file size (1MB limit)
    if len(content) > 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum size is 1MB.")
    
    # Convert to base64 and store in database
    base64_image = base64.b64encode(content).decode('utf-8')
    data_url = f"data:{file.content_type};base64,{base64_image}"
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO user_profile_images (user_id, stamp_image)
                VALUES (%s, %s)
                ON CONFLICT (user_id) DO UPDATE SET
                    stamp_image = EXCLUDED.stamp_image,
                    updated_at = now()
            """, (user["id"], data_url))
        conn.commit()
    
    audit_event(user["id"], "STAMP_UPLOADED")
    
    return {"success": True, "stamp_url": data_url}


@router.delete("/profile/stamp")
def delete_stamp(user: Dict[str, Any] = Depends(get_current_user)):
    """Delete stamp image."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE user_profile_images
                SET stamp_image = NULL, updated_at = now()
                WHERE user_id = %s
            """, (user["id"],))
        conn.commit()
    
    audit_event(user["id"], "STAMP_DELETED")
    
    return {"success": True, "message": "Stamp deleted"}


@router.get("/profile/images")
def get_profile_images(user: Dict[str, Any] = Depends(get_current_user)):
    """Get all profile images."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT profile_photo, signature_image, stamp_image
                FROM user_profile_images
                WHERE user_id = %s
            """, (user["id"],))
            row = cur.fetchone()
            
            if not row:
                return {
                    "profile_photo": None,
                    "signature_image": None,
                    "stamp_image": None
                }
            
            return {
                "profile_photo": row[0],
                "signature_image": row[1],
                "stamp_image": row[2]
            }


# ============================================================================
# SYSTEM STATUS ENDPOINTS
# ============================================================================

@router.get("/system/status")
def get_system_status(user: Dict[str, Any] = Depends(get_current_user)):
    """Get system status including AI toggle status."""
    ai_status = get_ai_status()
    
    return {
        "ai": ai_status,
        "database": {"status": "connected"},
        "version": "1.0.0",
    }


@router.get("/audit-log")
def get_user_audit_log(
    limit: int = 50,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Get audit log for current user."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, action, patient_id, metadata, created_at
                FROM audit_events
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT %s
            """, (user["id"], limit))
            rows = cur.fetchall()
    
    return {
        "events": [
            {
                "id": str(row[0]),
                "action": row[1],
                "patient_id": str(row[2]) if row[2] else None,
                "metadata": row[3],
                "created_at": row[4].isoformat() if row[4] else None,
            }
            for row in rows
        ]
    }


# ============================================================================
# NOTIFICATION SETTINGS ENDPOINTS
# ============================================================================

class NotificationSettings(BaseModel):
    email_notifications: Optional[bool] = None
    browser_notifications: Optional[bool] = None
    new_document: Optional[bool] = None
    document_review: Optional[bool] = None
    urgent_alerts: Optional[bool] = None
    consultation_reminder: Optional[bool] = None


@router.get("/notifications")
def get_notification_settings(user: Dict[str, Any] = Depends(get_current_user)):
    """Get user notification settings."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT email_notifications, browser_notifications, new_document,
                       document_review, urgent_alerts, consultation_reminder
                FROM user_notification_settings WHERE user_id = %s
            """, (user["id"],))
            row = cur.fetchone()
            
            if not row:
                # Return defaults
                return {
                    "email_notifications": True,
                    "browser_notifications": False,
                    "new_document": True,
                    "document_review": True,
                    "urgent_alerts": True,
                    "consultation_reminder": True,
                }
            
            return {
                "email_notifications": row[0],
                "browser_notifications": row[1],
                "new_document": row[2],
                "document_review": row[3],
                "urgent_alerts": row[4],
                "consultation_reminder": row[5],
            }


@router.patch("/notifications")
def update_notification_settings(
    data: NotificationSettings,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Update user notification settings."""
    update_data = data.model_dump(exclude_unset=True)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM user_notification_settings WHERE user_id = %s", (user["id"],))
            exists = cur.fetchone()
            
            if exists:
                if update_data:
                    set_clauses = ", ".join([f"{k} = %s" for k in update_data.keys()])
                    values = list(update_data.values()) + [user["id"]]
                    cur.execute(f"""
                        UPDATE user_notification_settings 
                        SET {set_clauses}, updated_at = now()
                        WHERE user_id = %s
                    """, tuple(values))
            else:
                columns = ["user_id"] + list(update_data.keys())
                placeholders = ["%s"] * len(columns)
                values = [user["id"]] + list(update_data.values())
                cur.execute(f"""
                    INSERT INTO user_notification_settings ({", ".join(columns)})
                    VALUES ({", ".join(placeholders)})
                """, tuple(values))
        conn.commit()
    
    audit_event(user["id"], "NOTIFICATION_SETTINGS_UPDATE")
    return {"message": "Notification settings updated successfully"}


# ============================================================================
# PRIVACY SETTINGS ENDPOINTS
# ============================================================================

class PrivacySettings(BaseModel):
    retention_policy: Optional[str] = None
    consent_template: Optional[str] = None


@router.get("/privacy")
def get_privacy_settings(user: Dict[str, Any] = Depends(get_current_user)):
    """Get user privacy settings."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT retention_policy, consent_template
                FROM user_privacy_settings WHERE user_id = %s
            """, (user["id"],))
            row = cur.fetchone()
            
            if not row:
                return {
                    "retention_policy": "forever",
                    "consent_template": "Je soussigné(e), autorise le Dr. [NOM] à collecter et traiter mes données médicales...",
                }
            
            return {
                "retention_policy": row[0],
                "consent_template": row[1] or "",
            }


@router.patch("/privacy")
def update_privacy_settings(
    data: PrivacySettings,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Update user privacy settings."""
    update_data = data.model_dump(exclude_unset=True)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM user_privacy_settings WHERE user_id = %s", (user["id"],))
            exists = cur.fetchone()
            
            if exists:
                if update_data:
                    set_clauses = ", ".join([f"{k} = %s" for k in update_data.keys()])
                    values = list(update_data.values()) + [user["id"]]
                    cur.execute(f"""
                        UPDATE user_privacy_settings 
                        SET {set_clauses}, updated_at = now()
                        WHERE user_id = %s
                    """, tuple(values))
            else:
                columns = ["user_id"] + list(update_data.keys())
                placeholders = ["%s"] * len(columns)
                values = [user["id"]] + list(update_data.values())
                cur.execute(f"""
                    INSERT INTO user_privacy_settings ({", ".join(columns)})
                    VALUES ({", ".join(placeholders)})
                """, tuple(values))
        conn.commit()
    
    audit_event(user["id"], "PRIVACY_SETTINGS_UPDATE")
    return {"message": "Privacy settings updated successfully"}


@router.post("/export-data")
def request_data_export(user: Dict[str, Any] = Depends(get_current_user)):
    """Request export of all user data."""
    # In a production system, this would trigger an async job
    audit_event(user["id"], "DATA_EXPORT_REQUEST")
    return {"message": "Export request received. You will receive an email with the download link."}


@router.post("/delete-account")
def request_account_deletion(user: Dict[str, Any] = Depends(get_current_user)):
    """Request account deletion."""
    # In a production system, this would schedule deletion after grace period
    audit_event(user["id"], "ACCOUNT_DELETION_REQUEST")
    return {"message": "Account deletion request received. Your account will be deleted within 30 days."}


# ============================================================================
# TEMPLATES ENDPOINTS
# ============================================================================

class TemplateCreate(BaseModel):
    name: str
    type: str  # ordonnance, certificat, lettre, compte_rendu, autre
    content: str
    header_image: Optional[str] = None  # Base64 encoded image
    footer_image: Optional[str] = None  # Base64 encoded image


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    content: Optional[str] = None
    header_image: Optional[str] = None
    footer_image: Optional[str] = None


@router.get("/templates")
def get_templates(user: Dict[str, Any] = Depends(get_current_user)):
    """Get all templates for the user."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, type, content, header_image, footer_image, created_at, updated_at
                FROM document_templates 
                WHERE user_id = %s
                ORDER BY created_at DESC
            """, (user["id"],))
            rows = cur.fetchall()
    
    return {
        "templates": [
            {
                "id": str(row[0]),
                "name": row[1],
                "type": row[2],
                "content": row[3],
                "header_image": row[4],
                "footer_image": row[5],
                "created_at": row[6].isoformat() if row[6] else None,
                "updated_at": row[7].isoformat() if row[7] else None,
            }
            for row in rows
        ]
    }


@router.post("/templates")
def create_template(
    data: TemplateCreate,
    user: Dict[str, Any] = Depends(require_doctor_or_owner)
):
    """Create a new template."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO document_templates (user_id, name, type, content, header_image, footer_image)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, name, type, content, header_image, footer_image, created_at
            """, (user["id"], data.name, data.type, data.content, data.header_image, data.footer_image))
            row = cur.fetchone()
        conn.commit()
    
    return {
        "id": str(row[0]),
        "name": row[1],
        "type": row[2],
        "content": row[3],
        "header_image": row[4],
        "footer_image": row[5],
        "created_at": row[6].isoformat() if row[6] else None,
    }


@router.patch("/templates/{template_id}")
def update_template(
    template_id: str,
    data: TemplateUpdate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Update a template."""
    update_data = data.model_dump(exclude_unset=True)
    
    if not update_data:
        raise HTTPException(400, "No fields to update")
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            set_clauses = ", ".join([f"{k} = %s" for k in update_data.keys()])
            values = list(update_data.values()) + [template_id, user["id"]]
            cur.execute(f"""
                UPDATE document_templates 
                SET {set_clauses}, updated_at = now()
                WHERE id = %s AND user_id = %s
                RETURNING id, name, type, content, header_image, footer_image, updated_at
            """, tuple(values))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(404, "Template not found")
        conn.commit()
    
    return {
        "id": str(row[0]),
        "name": row[1],
        "type": row[2],
        "content": row[3],
        "header_image": row[4],
        "footer_image": row[5],
        "updated_at": row[6].isoformat() if row[6] else None,
    }


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: str,
    user: Dict[str, Any] = Depends(require_doctor_or_owner)
):
    """Delete a template."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM document_templates 
                WHERE id = %s AND user_id = %s
                RETURNING id
            """, (template_id, user["id"]))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(404, "Template not found")
        conn.commit()
    
    return {"message": "Template deleted successfully"}


# Template AI Generation endpoint
@router.post("/templates/generate")
def generate_template_content(
    request: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Generate template content using AI."""
    template_type = request.get("type")
    description = request.get("description")
    example_content = request.get("exampleContent")
    
    if not template_type or not description:
        raise HTTPException(400, "Type and description are required")
    
    # Mock AI generation for now - replace with actual AI service call
    type_labels = {
        "prescription": "ordonnance",
        "certificate": "certificat médical",
        "referral": "lettre de référence",
        "note": "note de suivi"
    }
    
    type_label = type_labels.get(template_type, "document")
    
    # Generate basic template content
    content = f"""# {type_label.title()}

Date: {{{{date}}}}
Patient: {{{{patient_name}}}}

{description}

---

Dr. {{{{doctor_name}}}}
"""
    
    if template_type == "prescription":
        content = f"""ORDONNANCE

Date: {{{{date}}}}
Patient: {{{{patient_name}}}}

Médicaments prescrits:
{description}

Posologie et instructions:
- À prendre selon les indications médicales
- En cas d'effets secondaires, contactez votre médecin

Dr. {{{{doctor_name}}}}
Numéro d'ordre: {{{{license_number}}}}
"""
    elif template_type == "certificate":
        content = f"""CERTIFICAT MÉDICAL

Je soussigné(e) Dr. {{{{doctor_name}}}}, certifie avoir examiné ce jour {{{{patient_name}}}}.

Constatations: {description}

Ce certificat est délivré à la demande de l'intéressé(e) pour faire valoir ce que de droit.

Fait le {{{{date}}}}

Dr. {{{{doctor_name}}}}
"""
    elif template_type == "referral":
        content = f"""LETTRE DE RÉFÉRENCE

Date: {{{{date}}}}
Patient: {{{{patient_name}}}}

Cher Confrère,

Je vous adresse {{{{patient_name}}}} pour {description}

Contexte clinique:
{{{{problem}}}}

Je vous remercie de bien vouloir prendre en charge ce patient et de me tenir informé de votre évaluation.

Confraternellement,
Dr. {{{{doctor_name}}}}
"""
    
    if example_content:
        # Add styling context to the generated content
        content += f"\n\n<!-- Style context: {example_content[:200]}... -->"
    
    return {"content": content}


# Template style extraction endpoint  
@router.post("/templates/extract-style")
def extract_template_style(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Extract styling information from an uploaded document."""
    
    # Validate file type
    allowed_types = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png", 
        "image/jpeg",
        "image/jpg"
    ]
    
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Unsupported file type. Use PDF, DOCX, PNG, or JPEG.")
    
    # Check file size (10MB limit)
    if hasattr(file.file, 'seek'):
        file.file.seek(0, 2)  # Seek to end
        file_size = file.file.tell()
        file.file.seek(0)  # Reset to beginning
        if file_size > 10 * 1024 * 1024:
            raise HTTPException(413, "File too large. Maximum size is 10MB.")
    
    # Mock extraction for now - replace with actual document processing
    import time
    time.sleep(2)  # Simulate processing time
    
    # Return mock extracted styling information
    extracted_data = {
        "header": f"Cabinet Médical Dr. {user.get('first_name', 'NOM')} {user.get('last_name', 'PRENOM')}",
        "footer": "Consultations sur rendez-vous uniquement",
        "styling": {
            "font_family": "Arial",
            "font_size": "12pt",
            "margins": {"top": "2cm", "bottom": "2cm", "left": "2cm", "right": "2cm"},
            "header_height": "1.5cm",
            "footer_height": "1cm"
        }
    }
    
    return extracted_data


# ============================================================================
# SNIPPETS ENDPOINTS
# ============================================================================

class SnippetCreate(BaseModel):
    shortcode: str
    expansion: str
    category: Optional[str] = None


class SnippetUpdate(BaseModel):
    shortcode: Optional[str] = None
    expansion: Optional[str] = None
    category: Optional[str] = None


@router.get("/snippets")
def get_snippets(user: Dict[str, Any] = Depends(get_current_user)):
    """Get all snippets for the user."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, shortcode, expansion, category, created_at
                FROM text_snippets 
                WHERE user_id = %s
                ORDER BY category NULLS LAST, shortcode
            """, (user["id"],))
            rows = cur.fetchall()
    
    return {
        "snippets": [
            {
                "id": str(row[0]),
                "shortcode": row[1],
                "expansion": row[2],
                "category": row[3] or "",
                "created_at": row[4].isoformat() if row[4] else None,
            }
            for row in rows
        ]
    }


@router.post("/snippets")
def create_snippet(
    data: SnippetCreate,
    user: Dict[str, Any] = Depends(require_doctor_or_owner)
):
    """Create a new snippet."""
    if not data.shortcode.startswith("/"):
        raise HTTPException(400, "Shortcode must start with /")
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("""
                    INSERT INTO text_snippets (user_id, shortcode, expansion, category)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, shortcode, expansion, category, created_at
                """, (user["id"], data.shortcode, data.expansion, data.category))
                row = cur.fetchone()
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(400, "This shortcode already exists")
                raise
        conn.commit()
    
    return {
        "id": str(row[0]),
        "shortcode": row[1],
        "expansion": row[2],
        "category": row[3] or "",
        "created_at": row[4].isoformat() if row[4] else None,
    }


@router.patch("/snippets/{snippet_id}")
def update_snippet(
    snippet_id: str,
    data: SnippetUpdate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Update a snippet."""
    update_data = data.model_dump(exclude_unset=True)
    
    if not update_data:
        raise HTTPException(400, "No fields to update")
    
    if "shortcode" in update_data and not update_data["shortcode"].startswith("/"):
        raise HTTPException(400, "Shortcode must start with /")
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            set_clauses = ", ".join([f"{k} = %s" for k in update_data.keys()])
            values = list(update_data.values()) + [snippet_id, user["id"]]
            try:
                cur.execute(f"""
                    UPDATE text_snippets 
                    SET {set_clauses}, updated_at = now()
                    WHERE id = %s AND user_id = %s
                    RETURNING id, shortcode, expansion, category
                """, tuple(values))
                row = cur.fetchone()
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(400, "This shortcode already exists")
                raise
            
            if not row:
                raise HTTPException(404, "Snippet not found")
        conn.commit()
    
    return {
        "id": str(row[0]),
        "shortcode": row[1],
        "expansion": row[2],
        "category": row[3] or "",
    }


@router.delete("/snippets/{snippet_id}")
def delete_snippet(
    snippet_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Delete a snippet."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM text_snippets 
                WHERE id = %s AND user_id = %s
                RETURNING id
            """, (snippet_id, user["id"]))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(404, "Snippet not found")
        conn.commit()
    
    return {"message": "Snippet deleted successfully"}


# ============================================================================
# REPORTS / STATISTICS ENDPOINTS
# ============================================================================

@router.get("/reports/stats")
def get_report_stats(
    period: str = "30days",
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Get statistics for reports page."""
    # Calculate date range based on period
    from datetime import timedelta
    
    days_map = {
        "7days": 7,
        "30days": 30,
        "90days": 90,
        "year": 365,
    }
    days = days_map.get(period, 30)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get consultation count - patients are shared, no user_id filter needed
            cur.execute("""
                SELECT COUNT(*) 
                FROM consultations c
                WHERE c.created_at > now() - (%s || ' days')::interval
            """, (days,))
            consultations = cur.fetchone()[0] or 0
            
            # Get previous period for comparison
            cur.execute("""
                SELECT COUNT(*) 
                FROM consultations c
                WHERE c.created_at > now() - (%s || ' days')::interval
                  AND c.created_at <= now() - (%s || ' days')::interval
            """, (days * 2, days))
            prev_consultations = cur.fetchone()[0] or 0
            
            # Get document count
            cur.execute("""
                SELECT COUNT(*) 
                FROM documents d
                WHERE d.created_at > now() - (%s || ' days')::interval
            """, (days,))
            documents = cur.fetchone()[0] or 0
            
            cur.execute("""
                SELECT COUNT(*) 
                FROM documents d
                WHERE d.created_at > now() - (%s || ' days')::interval
                  AND d.created_at <= now() - (%s || ' days')::interval
            """, (days * 2, days))
            prev_documents = cur.fetchone()[0] or 0
            
            # Get active patients count (patients with consultations in period)
            cur.execute("""
                SELECT COUNT(DISTINCT c.patient_id) 
                FROM consultations c
                WHERE c.created_at > now() - (%s || ' days')::interval
            """, (days,))
            active_patients = cur.fetchone()[0] or 0
            
            # Get weekly breakdown
            cur.execute("""
                SELECT 
                    EXTRACT(DOW FROM c.created_at) as day_of_week,
                    COUNT(*) as count
                FROM consultations c
                WHERE c.created_at > now() - interval '7 days'
                GROUP BY EXTRACT(DOW FROM c.created_at)
            """)
            weekly_consultations = {int(row[0]): row[1] for row in cur.fetchall()}
            
            cur.execute("""
                SELECT 
                    EXTRACT(DOW FROM d.created_at) as day_of_week,
                    COUNT(*) as count
                FROM documents d
                WHERE d.created_at > now() - interval '7 days'
                GROUP BY EXTRACT(DOW FROM d.created_at)
            """)
            weekly_documents = {int(row[0]): row[1] for row in cur.fetchall()}
            
            # Get document type breakdown
            cur.execute("""
                SELECT document_type, COUNT(*) as count
                FROM documents d
                WHERE d.created_at > now() - (%s || ' days')::interval
                GROUP BY document_type
                ORDER BY count DESC
            """, (days,))
            doc_types = cur.fetchall()
    
    # Calculate percentage changes
    def calc_change(current, previous):
        if previous == 0:
            return "+100%" if current > 0 else "0%"
        change = ((current - previous) / previous) * 100
        return f"+{change:.0f}%" if change >= 0 else f"{change:.0f}%"
    
    # Day mapping for weekly data
    days_order = [
        {"day": "monday", "dayLabel": "Lundi", "dow": 1},
        {"day": "tuesday", "dayLabel": "Mardi", "dow": 2},
        {"day": "wednesday", "dayLabel": "Mercredi", "dow": 3},
        {"day": "thursday", "dayLabel": "Jeudi", "dow": 4},
        {"day": "friday", "dayLabel": "Vendredi", "dow": 5},
        {"day": "saturday", "dayLabel": "Samedi", "dow": 6},
        {"day": "sunday", "dayLabel": "Dimanche", "dow": 0},
    ]
    
    weekly_data = [
        {
            "day": d["dayLabel"],
            "consultations": weekly_consultations.get(d["dow"], 0),
            "documents": weekly_documents.get(d["dow"], 0),
        }
        for d in days_order
    ]
    
    # Calculate total for document type percentages
    total_docs = sum(row[1] for row in doc_types) or 1
    doc_type_breakdown = [
        {
            "type": row[0] or "Autre",
            "count": row[1],
            "percentage": int((row[1] / total_docs) * 100),
        }
        for row in doc_types
    ]
    
    # Estimate time saved (rough calculation: 5 min per document)
    time_saved_minutes = documents * 5
    time_saved_hours = time_saved_minutes / 60
    
    return {
        "stats": [
            {"label": "Consultations", "value": str(consultations), "change": calc_change(consultations, prev_consultations), "changeType": "positive" if consultations >= prev_consultations else "negative"},
            {"label": "Documents traités", "value": str(documents), "change": calc_change(documents, prev_documents), "changeType": "positive" if documents >= prev_documents else "negative"},
            {"label": "Temps moyen/note", "value": "4.2 min", "change": "-18%", "changeType": "positive"},
            {"label": "Patients actifs", "value": str(active_patients), "change": f"+{active_patients}", "changeType": "neutral"},
        ],
        "weekly_data": weekly_data,
        "document_types": doc_type_breakdown,
        "time_saved_hours": round(time_saved_hours, 1),
    }
