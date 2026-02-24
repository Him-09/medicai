from fastapi import APIRouter, HTTPException, Query, Depends
import uuid
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

from app.schemas.patients import PatientSnapshotOut, PrepOut, PatientChangesOut, NewDocument, AbnormalLab, NewImaging
from app.auth import get_current_user, require_doctor_or_owner
from app.audit import audit_event, PATIENT_VIEW, PATIENT_CREATE, PATIENT_UPDATE, PATIENT_DELETE
from app.schemas.patients_create import PatientCreateIn, PatientCreateOut, PatientUpdateIn

from medicai.agent.patient_tools import get_patient_snapshot
from medicai.agent.consultation_prep import generate_consultation_prep
from medicai.config import config
from medicai.storage.patient_store import (
    init_patients_table,
    create_patient as db_create_patient,
    get_patient as db_get_patient,
    get_all_patients as db_get_all_patients,
    update_patient as db_update_patient,
)
from medicai.storage.postgres import get_conn

router = APIRouter(prefix="/api/patients", tags=["patients"])

def enrich_patient_data(patient: dict, conn=None) -> dict:
    def _enrich(cur):
        cur.execute(
            "SELECT COUNT(*) FROM documents WHERE patient_id = %s",
            (patient["patient_id"],)
        )
        doc_count = cur.fetchone()[0]
        
        cur.execute(
            "SELECT COUNT(*) FROM documents WHERE patient_id = %s AND review_status = 'pending'",
            (patient["patient_id"],)
        )
        pending_count = cur.fetchone()[0]
        
        cur.execute(
            "SELECT MAX(consultation_time) FROM consultations WHERE patient_id = %s",
            (patient["patient_id"],)
        )
        last_consult = cur.fetchone()[0]
        
        return {
            **patient,
            "documents_count": doc_count,
            "pending_documents_count": pending_count,
            "last_consultation": last_consult.isoformat() if last_consult else None,
        }
    
    if conn:
        with conn.cursor() as cur:
            return _enrich(cur)
    else:
        with get_conn() as conn:
            with conn.cursor() as cur:
                return _enrich(cur)

def get_all_patients_enriched(status: Optional[str] = None) -> list:
    with get_conn() as conn:
        with conn.cursor() as cur:
            status_filter = ""
            params = []
            if status:
                status_filter = "WHERE p.status = %s"
                params.append(status)
            
            cur.execute(f"""
                SELECT 
                    p.patient_id,
                    p.name,
                    p.dob,
                    p.sex,
                    p.email,
                    p.phone,
                    p.address,
                    p.medical_history,
                    p.allergies,
                    p.active_problems,
                    p.status,
                    p.created_at,
                    p.updated_at,
                    COALESCE(d.doc_count, 0) as documents_count,
                    COALESCE(d.pending_count, 0) as pending_documents_count,
                    c.last_consultation
                FROM patients p
                LEFT JOIN (
                    SELECT 
                        patient_id,
                        COUNT(*) as doc_count,
                        COUNT(*) FILTER (WHERE review_status = 'pending') as pending_count
                    FROM documents
                    GROUP BY patient_id
                ) d ON p.patient_id = d.patient_id
                LEFT JOIN (
                    SELECT 
                        patient_id,
                        MAX(consultation_time) as last_consultation
                    FROM consultations
                    GROUP BY patient_id
                ) c ON p.patient_id = c.patient_id
                {status_filter}
                ORDER BY p.name
            """, params)
            
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            
            patients = []
            for row in rows:
                patient = dict(zip(columns, row))
                if patient.get("last_consultation"):
                    patient["last_consultation"] = patient["last_consultation"].isoformat()
                patients.append(patient)
            
            return patients

@router.get("")
def get_all_patients(
    status: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_current_user)
):
    patients = get_all_patients_enriched(status=status)
    return {"patients": patients}

@router.get("/{patient_id}")
def get_patient(patient_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    patient = db_get_patient(patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")
    audit_event(user["id"], PATIENT_VIEW, patient_id=patient_id)
    return enrich_patient_data(patient)

@router.post("", response_model=PatientCreateOut)
def create_patient(payload: PatientCreateIn, user: Dict[str, Any] = Depends(require_doctor_or_owner)):
    patient_id = f"patient{uuid.uuid4().hex[:8]}"
    audit_event(user["id"], PATIENT_CREATE, metadata={"patient_name": payload.name})
    
    patient_dir = config.DATA_PROCESSED_DIR / patient_id
    patient_dir.mkdir(parents=True, exist_ok=True)
    
    db_create_patient(
        patient_id=patient_id,
        name=payload.name,
        dob=payload.dob,
        sex=payload.sex,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        medical_history=payload.medical_history,
        allergies=payload.allergies,
        active_problems=payload.active_problems,
        status="active",
    )
    
    return PatientCreateOut(
        patient_id=patient_id,
        name=payload.name,
        dob=payload.dob,
        sex=payload.sex,
        email=payload.email,
        phone=payload.phone,
        status="active",
        message="Patient created successfully"
    )

@router.patch("/{patient_id}")
def update_patient(
    patient_id: str,
    payload: PatientUpdateIn,
    user: Dict[str, Any] = Depends(get_current_user)
):
    patient = db_get_patient(patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")
    audit_event(user["id"], PATIENT_UPDATE, patient_id=patient_id)
    
    update_data = payload.model_dump(exclude_unset=True)
    
    if not update_data:
        raise HTTPException(400, "No fields to update")
    
    if update_data.get("status") == "archived":
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT consultation_id, consultation_time FROM consultations WHERE patient_id = %s AND status = 'active'",
                    (patient_id,)
                )
                active_consultations = cur.fetchall()
        
        if active_consultations:
            consultation_ids = [c[0] for c in active_consultations]
            raise HTTPException(
                400, 
                detail={
                    "message": "Cannot archive patient with active consultations",
                    "active_consultations": consultation_ids,
                }
            )
    
    updated_patient = db_update_patient(patient_id, **update_data)
    
    if not updated_patient:
        raise HTTPException(500, "Failed to update patient")
    
    return enrich_patient_data(updated_patient)

@router.delete("/{patient_id}")
def delete_patient(patient_id: str, user: Dict[str, Any] = Depends(require_doctor_or_owner)):
    patient = db_get_patient(patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")
    audit_event(user["id"], PATIENT_DELETE, patient_id=patient_id)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT consultation_id, consultation_time FROM consultations WHERE patient_id = %s AND status = 'active'",
                (patient_id,)
            )
            active_consultations = cur.fetchall()
    
    if active_consultations:
        consultation_ids = [c[0] for c in active_consultations]
        raise HTTPException(
            400, 
            detail={
                "message": "Cannot archive patient with active consultations",
                "active_consultations": consultation_ids,
            }
        )
    
    updated_patient = db_update_patient(patient_id, status="archived")
    
    if not updated_patient:
        raise HTTPException(500, "Failed to archive patient")
    
    return {
        "message": f"Patient {patient_id} has been archived",
        "patient_id": patient_id,
        "status": "archived",
        "archived_at": updated_patient.get("archived_at")
    }

@router.get("/{patient_id}/snapshot", response_model=PatientSnapshotOut)
def snapshot(patient_id: str):
    patient_id = patient_id.strip()
    if not patient_id:
        raise HTTPException(400, "patient_id is required")

    snap = get_patient_snapshot(patient_id)
    return PatientSnapshotOut(**snap)

@router.post("/{patient_id}/prep", response_model=PrepOut)
def prep(patient_id: str):
    patient_id = patient_id.strip()
    if not patient_id:
        raise HTTPException(400, "patient_id is required")

    prep_text = generate_consultation_prep(
        processed_dir=str(config.DATA_PROCESSED_DIR),
        patient_id=patient_id,
    )
    return PrepOut(patient_id=patient_id, prep_text=prep_text)

@router.get("/{patient_id}/changes", response_model=PatientChangesOut)
def get_patient_changes(
    patient_id: str,
    since: str = Query("last_visit", description="Reference point: 'last_visit' or ISO datetime"),
    current_consultation_id: Optional[str] = Query(None, description="Current consultation ID to exclude")
):
    patient_id = patient_id.strip()
    if not patient_id:
        raise HTTPException(400, "patient_id is required")
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            since_timestamp = None
            
            if since == "last_visit":
                if current_consultation_id:
                    cur.execute("""
                        SELECT MAX(consultation_time)
                        FROM consultations
                        WHERE patient_id = %s 
                        AND consultation_id != %s
                        AND consultation_time IS NOT NULL
                    """, (patient_id, current_consultation_id))
                else:
                    cur.execute("""
                        SELECT MAX(consultation_time)
                        FROM consultations
                        WHERE patient_id = %s
                        AND consultation_time IS NOT NULL
                    """, (patient_id,))
                
                result = cur.fetchone()
                since_timestamp = result[0] if result else None
            else:
                try:
                    since_timestamp = datetime.fromisoformat(since.replace('Z', '+00:00'))
                except ValueError:
                    raise HTTPException(400, "Invalid datetime format. Use ISO format or 'last_visit'")
            
            if not since_timestamp:
                return PatientChangesOut(
                    since=None,
                    new_documents=[],
                    new_abnormals=[],
                    worsening_trends=[],
                    new_imaging=[]
                )
            
            since_str = since_timestamp.isoformat()
            
            cur.execute("""
                SELECT doc_id, document_type, date_of_service, processed_at
                FROM documents
                WHERE patient_id = %s
                AND processed_at > %s
                ORDER BY processed_at DESC
            """, (patient_id, since_timestamp))
            
            new_documents = [
                NewDocument(
                    doc_id=row[0],
                    document_type=row[1],
                    date_of_service=row[2].isoformat() if row[2] else None,
                    processed_at=row[3].isoformat() if row[3] else ""
                )
                for row in cur.fetchall()
            ]
            
            cur.execute("""
                SELECT test_name, value, unit, flag, date_of_service
                FROM lab_results
                WHERE patient_id = %s
                AND date_of_service > %s
                AND flag != 'normal'
                ORDER BY test_name, date_of_service
            """, (patient_id, since_timestamp))
            
            recent_abnormals = cur.fetchall()
            
            new_abnormals = []
            worsening_trends = []
            
            for test_name, value, unit, flag, date_of_service in recent_abnormals:
                cur.execute("""
                    SELECT value, flag, date_of_service
                    FROM lab_results
                    WHERE patient_id = %s
                    AND test_name = %s
                    AND date_of_service <= %s
                    ORDER BY date_of_service DESC
                    LIMIT 1
                """, (patient_id, test_name, since_timestamp))
                
                previous = cur.fetchone()
                
                lab_item = AbnormalLab(
                    test_name=test_name,
                    value=value,
                    unit=unit,
                    flag=flag,
                    date_of_service=date_of_service.isoformat(),
                    trend="",
                    previous_value=None
                )
                
                if not previous:
                    lab_item.trend = "new_abnormal"
                    new_abnormals.append(lab_item)
                elif previous[1] == 'normal':
                    lab_item.trend = "new_abnormal"
                    lab_item.previous_value = previous[0]
                    new_abnormals.append(lab_item)
                else:
                    lab_item.trend = "worsening"
                    lab_item.previous_value = previous[0]
                    worsening_trends.append(lab_item)
            
            cur.execute("""
                SELECT doc_id, exam_type, date_of_service, conclusion
                FROM radiology_reports
                WHERE patient_id = %s
                AND date_of_service > %s
                ORDER BY date_of_service DESC
            """, (patient_id, since_timestamp))
            
            new_imaging = [
                NewImaging(
                    report_id=row[0],
                    type_examen=row[1] or "Unknown",
                    date_of_service=row[2].isoformat(),
                    conclusion=row[3][:200] + "..." if row[3] and len(row[3]) > 200 else row[3]
                )
                for row in cur.fetchall()
            ]
            
            return PatientChangesOut(
                since=since_str,
                new_documents=new_documents,
                new_abnormals=new_abnormals,
                worsening_trends=worsening_trends,
                new_imaging=new_imaging
            )
