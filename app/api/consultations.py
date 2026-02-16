from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
import uuid
from typing import Dict, Any

from app.schemas.consultations import ConsultationCreateIn, ConsultationCreateOut, ConsultationUpdateIn
from app.services.agent_service import AgentService, get_agent_service
from medicai.storage.consultation_summary_store import get_summary, list_patient_summaries
from medicai.storage.consultation_store import (
    create_consultation as db_create_consultation,
    list_consultations as db_list_consultations,
    get_consultation as db_get_consultation,
    delete_consultation as db_delete_consultation,
    update_consultation as db_update_consultation,
    init_consultations_table,
)
from medicai.agent.consultation_prep import generate_consultation_prep
from medicai.config import config
from app.auth import get_current_user, require_doctor_or_owner
from app.audit import audit_event, CONSULTATION_CREATE, CONSULTATION_VIEW
from app.utils.ai_toggle import ensure_ai_enabled

router = APIRouter(prefix="/api/consultations", tags=["consultations"])

@router.post("", response_model=ConsultationCreateOut)
def create_consultation(
    payload: ConsultationCreateIn,
    user: Dict[str, Any] = Depends(get_current_user)
):
    consultation_id = str(uuid.uuid4())
    consultation_time = payload.consultation_time or datetime.utcnow()
    
    # Audit the consultation creation
    audit_event(user["id"], CONSULTATION_CREATE, patient_id=payload.patient_id.strip(),
                metadata={"consultation_id": consultation_id})
    
    # Store in database
    db_create_consultation(
        consultation_id=consultation_id,
        patient_id=payload.patient_id.strip(),
        name=payload.name,
        consultation_time=consultation_time,
        status="active",
    )
    
    return ConsultationCreateOut(
        consultation_id=consultation_id,
        patient_id=payload.patient_id.strip(),
        name=payload.name,
        consultation_time=consultation_time,
        created_at=datetime.utcnow(),
    )


@router.get("")
def list_consultations(
    patient_id: str = None,
    status: str = None,
    limit: int = 100,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """List all consultations with optional filters."""
    consultations = db_list_consultations(
        patient_id=patient_id,
        status=status,
        limit=limit,
    )
    return {"consultations": consultations}


@router.get("/{consultation_id}")
def get_consultation(consultation_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Get a single consultation by ID."""
    consultation = db_get_consultation(consultation_id)
    if not consultation:
        raise HTTPException(404, "Consultation not found")
    audit_event(user["id"], CONSULTATION_VIEW, patient_id=consultation.get("patient_id"),
                metadata={"consultation_id": consultation_id})
    return consultation


@router.get("/{consultation_id}/prep")
def get_consultation_prep(consultation_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Generate consultation preparation summary for a consultation's patient."""
    ensure_ai_enabled()  # Check if AI is enabled
    
    # Get consultation to find patient_id
    consultation = db_get_consultation(consultation_id)
    if not consultation:
        raise HTTPException(404, "Consultation not found")
    
    patient_id = consultation["patient_id"]
    processed_dir = str(config.DATA_PROCESSED_DIR)
    
    try:
        prep_text = generate_consultation_prep(processed_dir, patient_id)
        return {
            "consultation_id": consultation_id,
            "patient_id": patient_id,
            "prep_text": prep_text,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to generate consultation prep: {str(e)}")


@router.post("/{consultation_id}/summary")
def generate_summary(
    consultation_id: str,
    patient_id: str,
    svc: AgentService = Depends(get_agent_service),
):
    try:
        summary = svc.generate_and_save_summary(
            consultation_id=consultation_id,
            patient_id=patient_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    return {
        "consultation_id": consultation_id,
        "patient_id": patient_id,
        "summary": summary,
    }


@router.get("/{consultation_id}/summary")
def get_consultation_summary(consultation_id: str):
    summary = get_summary(consultation_id)
    if not summary:
        # Try to generate it on-the-fly for completed consultations
        consultation = db_get_consultation(consultation_id)
        if consultation and consultation.get("status") == "completed":
            try:
                from medicai.agent.consultation_summary import generate_consultation_summary
                from medicai.storage.workspace_store import get_workspace
                
                workspace = get_workspace(consultation_id)
                if workspace:
                    summary_data = generate_consultation_summary(
                        patient_id=consultation["patient_id"],
                        consultation_id=consultation_id,
                        workspace_data=workspace
                    )
                    # Fetch the newly generated summary
                    summary = get_summary(consultation_id)
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to generate summary on-the-fly: {str(e)}")
        
        if not summary:
            raise HTTPException(404, "Summary not found")
    return summary


@router.post("/{consultation_id}/summary/regenerate")
def regenerate_summary(consultation_id: str):
    """Regenerate summary for a completed consultation."""
    consultation = db_get_consultation(consultation_id)
    if not consultation:
        raise HTTPException(404, "Consultation not found")
    
    if consultation.get("status") != "completed":
        raise HTTPException(400, "Can only regenerate summary for completed consultations")
    
    try:
        from medicai.agent.consultation_summary import generate_consultation_summary
        from medicai.storage.workspace_store import get_workspace
        
        workspace = get_workspace(consultation_id)
        if not workspace:
            raise HTTPException(400, "No workspace data found for this consultation")
        
        summary_data = generate_consultation_summary(
            patient_id=consultation["patient_id"],
            consultation_id=consultation_id,
            workspace_data=workspace
        )
        
        return {
            "message": "Summary regenerated successfully",
            "consultation_id": consultation_id,
            "summary": summary_data.get("summary", "")
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to regenerate summary: {str(e)}")


@router.get("/patients/{patient_id}/consultations")
def patient_history(patient_id: str):
    return {
        "patient_id": patient_id,
        "consultations": list_patient_summaries(patient_id),
    }


@router.patch("/{consultation_id}")
def update_consultation(consultation_id: str, payload: ConsultationUpdateIn):
    """Update consultation information (partial update)."""
    # Check if consultation exists
    consultation = db_get_consultation(consultation_id)
    if not consultation:
        raise HTTPException(404, "Consultation not found")
    
    # Prepare update data (only include fields that were provided)
    update_data = payload.model_dump(exclude_unset=True)
    
    if not update_data:
        raise HTTPException(400, "No fields to update")
    
    # Update consultation in database
    updated_consultation = db_update_consultation(consultation_id, **update_data)
    
    if not updated_consultation:
        raise HTTPException(500, "Failed to update consultation")
    
    return updated_consultation


@router.delete("/{consultation_id}")
def delete_consultation(consultation_id: str, user: Dict[str, Any] = Depends(require_doctor_or_owner)):
    """Soft delete a consultation by setting status to canceled."""
    # Check if consultation exists
    consultation = db_get_consultation(consultation_id)
    if not consultation:
        raise HTTPException(404, "Consultation not found")
    
    success = db_delete_consultation(consultation_id)
    if not success:
        raise HTTPException(500, "Failed to cancel consultation")
    
    return {
        "message": f"Consultation {consultation_id} has been canceled",
        "consultation_id": consultation_id,
        "status": "canceled"
    }


@router.post("/{consultation_id}/sign")
def sign_consultation(consultation_id: str):
    """
    Sign and finalize a consultation.
    This triggers the consultation summary generation for future reference.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Check if consultation exists
    consultation = db_get_consultation(consultation_id)
    if not consultation:
        raise HTTPException(404, "Consultation not found")
    
    # Update consultation status to completed
    updated = db_update_consultation(
        consultation_id,
        status="completed",
    )
    
    if not updated:
        raise HTTPException(500, "Failed to update consultation status")
    
    # Trigger consultation summary generation for next consultation usage
    try:
        from medicai.agent.consultation_summary import generate_consultation_summary
        from medicai.storage.workspace_store import get_workspace
        
        # Get workspace data
        workspace = get_workspace(consultation_id)
        if workspace:
            # Generate and store summary
            summary_data = generate_consultation_summary(
                patient_id=consultation["patient_id"],
                consultation_id=consultation_id,
                workspace_data=workspace
            )
            logger.info(f"Generated consultation summary for {consultation_id}")
        else:
            logger.warning(f"No workspace data found for consultation {consultation_id}")
            
    except Exception as e:
        # Log error but don't fail the signing process
        logger.error(f"Failed to generate consultation summary: {str(e)}")
    
    return {
        "message": "Consultation signée avec succès",
        "consultation_id": consultation_id,
        "status": "completed",
    }
