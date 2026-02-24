from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
import logging

from app.auth import get_current_user
from app.schemas.workspace import (
    WorkspaceOut, SaveWorkspaceIn,
)
from medicai.storage.workspace_store import save_workspace, get_workspace, init_workspace_table
from medicai.storage.consultation_store import get_consultation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/consultations", tags=["workspace"])

@router.get("/{consultation_id}/workspace")
def get_consultation_workspace(consultation_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    workspace = get_workspace(consultation_id)
    if not workspace:
        raise HTTPException(404, "Workspace not found")
    
    return workspace

@router.patch("/{consultation_id}/workspace")
def update_workspace(consultation_id: str, payload: SaveWorkspaceIn, user: Dict[str, Any] = Depends(get_current_user)):
    try:
        consultation = get_consultation(consultation_id)
        if not consultation:
            raise HTTPException(404, f"Consultation {consultation_id} not found")
        
        patient_id = consultation["patient_id"]
        
        saved = save_workspace(
            consultation_id=consultation_id,
            patient_id=patient_id,
            clinic_id=user["clinic_id"],
            visit_focus=payload.visit_focus,
            agenda=payload.agenda,
            hpi=payload.hpi,
            problems=payload.problems,
            quick_notes=payload.quick_notes,
            orders=payload.orders,
        )
        return saved
    except Exception as e:
        logger.error(f"Failed to save workspace: {str(e)}")
        raise HTTPException(500, f"Failed to save workspace: {str(e)}")

@router.post("/{consultation_id}/workspace")
def create_workspace(consultation_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    try:
        consultation = get_consultation(consultation_id)
        if not consultation:
            raise HTTPException(404, f"Consultation {consultation_id} not found")
        
        patient_id = consultation["patient_id"]
        
        existing = get_workspace(consultation_id)
        if existing:
            return existing
        
        saved = save_workspace(
            consultation_id=consultation_id,
            patient_id=patient_id,
            clinic_id=user["clinic_id"],
            visit_focus="",
            agenda=[],
            hpi={},
            problems=[],
        )
        
        return saved
    except Exception as e:
        logger.error(f"Failed to create workspace: {str(e)}")
        raise HTTPException(500, f"Failed to create workspace: {str(e)}")
