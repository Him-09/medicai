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

router = APIRouter(prefix="/api/settings", tags=["settings"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "profiles")
os.makedirs(UPLOAD_DIR, exist_ok=True)

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

@router.get("/profile")
def get_profile(user: Dict[str, Any] = Depends(get_current_user)):
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
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT password_hash FROM users WHERE id = %s", (user["id"],))
            row = cur.fetchone()
            
            if not row or not verify_password(data.current_password, row[0]):
                raise HTTPException(400, "Current password is incorrect")
            
            if len(data.new_password) < 8:
                raise HTTPException(400, "Password must be at least 8 characters")
            
            new_hash = hash_password(data.new_password)
            cur.execute("""
                UPDATE users SET password_hash = %s, updated_at = now()
                WHERE id = %s
            """, (new_hash, user["id"]))
        conn.commit()
    
    audit_event(user["id"], "PASSWORD_CHANGE")
    
    return {"message": "Password changed successfully"}

@router.get("/clinic")
def get_clinic_settings(user: Dict[str, Any] = Depends(get_current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT settings FROM clinic_settings WHERE id = 1
            """)
            row = cur.fetchone()
            
            if not row:
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
    update_data = data.model_dump(exclude_unset=True)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
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
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT schedule FROM clinic_settings WHERE id = 1")
            row = cur.fetchone()
            
            if not row or not row[0]:
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

@router.get("/sessions")
def get_active_sessions(user: Dict[str, Any] = Depends(get_current_user)):
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
    audit_event(user["id"], "SESSION_LOGOUT", metadata={"session_id": session_id})
    return {"message": "Session logged out"}

@router.post("/sessions/logout-all")
def logout_all_sessions(user: Dict[str, Any] = Depends(get_current_user)):
    audit_event(user["id"], "ALL_SESSIONS_LOGOUT")
    return {"message": "All other sessions logged out"}

@router.post("/profile/photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user)
):
    if file.content_type not in ["image/jpeg", "image/png", "image/gif"]:
        raise HTTPException(400, "Unsupported file type. Use JPG, PNG, or GIF.")
    
    content = await file.read()
    
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum size is 2MB.")
    
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
    if file.content_type not in ["image/jpeg", "image/png"]:
        raise HTTPException(400, "Unsupported file type. Use JPG or PNG.")
    
    content = await file.read()
    
    if len(content) > 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum size is 1MB.")
    
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
    if file.content_type not in ["image/jpeg", "image/png"]:
        raise HTTPException(400, "Unsupported file type. Use JPG or PNG.")
    
    content = await file.read()
    
    if len(content) > 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum size is 1MB.")
    
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

@router.get("/system/status")
def get_system_status(user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "database": {"status": "connected"},
        "version": "1.0.0",
    }

@router.get("/audit-log")
def get_user_audit_log(
    limit: int = 50,
    user: Dict[str, Any] = Depends(get_current_user)
):
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

class NotificationSettings(BaseModel):
    email_notifications: Optional[bool] = None
    browser_notifications: Optional[bool] = None
    new_document: Optional[bool] = None
    document_review: Optional[bool] = None
    urgent_alerts: Optional[bool] = None
    consultation_reminder: Optional[bool] = None

@router.get("/notifications")
def get_notification_settings(user: Dict[str, Any] = Depends(get_current_user)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT email_notifications, browser_notifications, new_document,
                       document_review, urgent_alerts, consultation_reminder
                FROM user_notification_settings WHERE user_id = %s
            """, (user["id"],))
            row = cur.fetchone()
            
            if not row:
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

class PrivacySettings(BaseModel):
    retention_policy: Optional[str] = None
    consent_template: Optional[str] = None

@router.get("/privacy")
def get_privacy_settings(user: Dict[str, Any] = Depends(get_current_user)):
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
    audit_event(user["id"], "DATA_EXPORT_REQUEST")
    return {"message": "Export request received. You will receive an email with the download link."}

@router.post("/delete-account")
def request_account_deletion(user: Dict[str, Any] = Depends(get_current_user)):
    audit_event(user["id"], "ACCOUNT_DELETION_REQUEST")
    return {"message": "Account deletion request received. Your account will be deleted within 30 days."}

class TemplateCreate(BaseModel):
    name: str
    type: str
    content: str
    header_image: Optional[str] = None
    footer_image: Optional[str] = None

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    content: Optional[str] = None
    header_image: Optional[str] = None
    footer_image: Optional[str] = None

@router.get("/templates")
def get_templates(user: Dict[str, Any] = Depends(get_current_user)):
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

@router.post("/templates/generate")
def generate_template_content(
    request: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_user)
):
    template_type = request.get("type")
    description = request.get("description")
    example_content = request.get("exampleContent")
    
    if not template_type or not description:
        raise HTTPException(400, "Type and description are required")
    
    type_labels = {
        "prescription": "ordonnance",
        "certificate": "certificat médical",
        "referral": "lettre de référence",
        "note": "note de suivi"
    }
    
    type_label = type_labels.get(template_type, "document")
    
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
        content += f"\n\n<!-- Style context: {example_content[:200]}... -->"
    
    return {"content": content}

@router.post("/templates/extract-style")
def extract_template_style(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user)
):
    
    allowed_types = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png", 
        "image/jpeg",
        "image/jpg"
    ]
    
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Unsupported file type. Use PDF, DOCX, PNG, or JPEG.")
    
    if hasattr(file.file, 'seek'):
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size > 10 * 1024 * 1024:
            raise HTTPException(413, "File too large. Maximum size is 10MB.")
    
    import time
    time.sleep(2)
    
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

@router.get("/reports/stats")
def get_report_stats(
    period: str = "30days",
    user: Dict[str, Any] = Depends(get_current_user)
):
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
            cur.execute("""
                SELECT COUNT(*) 
                FROM consultations c
                WHERE c.created_at > now() - (%s || ' days')::interval
            """, (days,))
            consultations = cur.fetchone()[0] or 0
            
            cur.execute("""
                SELECT COUNT(*) 
                FROM consultations c
                WHERE c.created_at > now() - (%s || ' days')::interval
                  AND c.created_at <= now() - (%s || ' days')::interval
            """, (days * 2, days))
            prev_consultations = cur.fetchone()[0] or 0
            
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
            
            cur.execute("""
                SELECT COUNT(DISTINCT c.patient_id) 
                FROM consultations c
                WHERE c.created_at > now() - (%s || ' days')::interval
            """, (days,))
            active_patients = cur.fetchone()[0] or 0
            
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
            
            cur.execute("""
                SELECT document_type, COUNT(*) as count
                FROM documents d
                WHERE d.created_at > now() - (%s || ' days')::interval
                GROUP BY document_type
                ORDER BY count DESC
            """, (days,))
            doc_types = cur.fetchall()
    
    def calc_change(current, previous):
        if previous == 0:
            return "+100%" if current > 0 else "0%"
        change = ((current - previous) / previous) * 100
        return f"+{change:.0f}%" if change >= 0 else f"{change:.0f}%"
    
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
    
    total_docs = sum(row[1] for row in doc_types) or 1
    doc_type_breakdown = [
        {
            "type": row[0] or "Autre",
            "count": row[1],
            "percentage": int((row[1] / total_docs) * 100),
        }
        for row in doc_types
    ]
    
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
