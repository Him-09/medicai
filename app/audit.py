from typing import Any, Dict, Optional
import json
import logging

from medicai.storage.postgres import get_conn

logger = logging.getLogger(__name__)

PATIENT_VIEW = "PATIENT_VIEW"
PATIENT_CREATE = "PATIENT_CREATE"
PATIENT_UPDATE = "PATIENT_UPDATE"
PATIENT_DELETE = "PATIENT_DELETE"
DOC_UPLOAD = "DOC_UPLOAD"
DOC_VIEW = "DOC_VIEW"
DOC_DELETE = "DOC_DELETE"
EXPORT = "EXPORT"
LOGIN_SUCCESS = "LOGIN_SUCCESS"
LOGIN_FAILED = "LOGIN_FAILED"
CONSULTATION_CREATE = "CONSULTATION_CREATE"
CONSULTATION_VIEW = "CONSULTATION_VIEW"

def audit_event(
    user_id: str,
    action: str,
    patient_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> None:
    try:
        if user_id in (None, "unknown", ""):
            user_id = None
        if patient_id in (None, "unknown", ""):
            patient_id = None

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_events (user_id, patient_id, action, metadata)
                    VALUES (%s, %s, %s, %s::jsonb)
                    """,
                    (
                        user_id,
                        patient_id,
                        action,
                        json.dumps(metadata or {}),
                    ),
                )
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to log audit event: {action} - {e}")

def get_audit_log(
    user_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100
) -> list:
    conditions = []
    params = []
    
    if user_id:
        conditions.append("user_id = %s")
        params.append(user_id)
    if patient_id:
        conditions.append("patient_id = %s")
        params.append(patient_id)
    if action:
        conditions.append("action = %s")
        params.append(action)
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    params.append(limit)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, user_id, patient_id, action, metadata, created_at
                FROM audit_events
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT %s
                """,
                tuple(params),
            )
            rows = cur.fetchall()
            
            return [
                {
                    "id": str(row[0]),
                    "user_id": str(row[1]),
                    "patient_id": str(row[2]) if row[2] else None,
                    "action": row[3],
                    "metadata": row[4],
                    "created_at": row[5].isoformat() if row[5] else None,
                }
                for row in rows
            ]
