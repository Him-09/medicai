"""Analytics endpoints for patient data"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, Dict, Any

from app.schemas.actions import AbnormalLabsOut, LabTrendOut, RadiologyConclusionsOut
from medicai.agent.patient_tools_sql import (
    get_abnormal_labs_sql,
    get_lab_trend_sql,
    get_radiology_conclusions_sql,
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/patients", tags=["analytics"])


@router.get("/{patient_id}/labs:abnormal", response_model=AbnormalLabsOut)
def get_abnormal_labs(
    patient_id: str,
    since: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Get abnormal lab results for a patient"""
    patient_id = patient_id.strip()
    if not patient_id:
        raise HTTPException(400, "patient_id is required")
    
    rows = get_abnormal_labs_sql(patient_id, since)
    return AbnormalLabsOut(patient_id=patient_id, rows=rows)


@router.get("/{patient_id}/labs:trend", response_model=LabTrendOut)
def get_lab_trend(
    patient_id: str,
    test_name: str,
    since: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Get trend data for a specific lab test"""
    patient_id = patient_id.strip()
    test_name = test_name.strip()
    
    if not patient_id:
        raise HTTPException(400, "patient_id is required")
    if not test_name:
        raise HTTPException(400, "test_name is required")
    
    result = get_lab_trend_sql(patient_id, test_name, since)
    return LabTrendOut(**result)


@router.get("/{patient_id}/radiology:conclusions", response_model=RadiologyConclusionsOut)
def get_radiology_conclusions(
    patient_id: str,
    since: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Get radiology report conclusions for a patient"""
    patient_id = patient_id.strip()
    if not patient_id:
        raise HTTPException(400, "patient_id is required")
    
    rows = get_radiology_conclusions_sql(patient_id, since)
    return RadiologyConclusionsOut(patient_id=patient_id, rows=rows)
