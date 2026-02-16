"""
Workspace API endpoints - structured consultation workspace.
Implements "Seed → Enrich" model: workspace seeds objective data,
enrichment endpoints provide clinical content on-demand.
"""
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
import logging

from app.auth import get_current_user
from app.schemas.workspace import (
    WorkspaceOut, GenerateWorkspaceIn, SaveWorkspaceIn,
    EnrichProblemIn, EnrichProblemOut, EnrichHPIIn, EnrichHPIOut
)
from medicai.agent.workspace_generator import generate_workspace_data
from medicai.agent.problem_enrichment import (
    enrich_problem_full, enrich_problem_partial, enrich_hpi,
    EnrichmentMode
)
from medicai.storage.workspace_store import save_workspace, get_workspace, init_workspace_table
from medicai.storage.consultation_store import get_consultation
from medicai.config import Config
from app.utils.cache import invalidate_consultation_caches

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/consultations", tags=["workspace"])


@router.post("/{consultation_id}/workspace/generate", response_model=WorkspaceOut)
def generate_workspace(consultation_id: str, force: bool = False, mode: str = "merge", user: Dict[str, Any] = Depends(get_current_user)):
    """
    Generate structured workspace for consultation.
    Returns HPI and A&P sections prefilled from patient documents.
    Set force=True to regenerate even if workspace exists.
    Mode: 'merge' fills empty fields only, 'overwrite' replaces everything.
    """
    try:
        # Get consultation to fetch patient_id
        consultation = get_consultation(consultation_id)
        if not consultation:
            raise HTTPException(404, f"Consultation {consultation_id} not found")
        
        patient_id = consultation["patient_id"]
        
        # Check if workspace already exists (skip if force=True)
        if not force:
            existing = get_workspace(consultation_id)
            if existing:
                return WorkspaceOut(
                    consultation_id=existing["consultation_id"],
                    patient_id=existing["patient_id"],
                    visit_focus=existing.get("visit_focus", ""),
                    agenda=existing.get("agenda", []),
                    hpi=existing.get("hpi", {}),
                    problems=existing.get("problems", []),
                    generated_at=existing.get("created_at", datetime.now().isoformat()),
                    created_at=existing.get("created_at"),
                    updated_at=existing.get("updated_at"),
                )
        
        # Generate new workspace (DB-indexed, no processed_dir needed)
        workspace_data = generate_workspace_data(
            patient_id=patient_id,
            consultation_id=consultation_id  # Pass consultation_id for changes tracking
        )
        
        # Save to database
        saved = save_workspace(
            consultation_id=consultation_id,
            patient_id=patient_id,
            clinic_id=user["clinic_id"],
            visit_focus=workspace_data.get("visit_focus", ""),
            agenda=workspace_data.get("agenda", []),
            hpi=workspace_data.get("hpi", {}),
            problems=workspace_data.get("problems", []),
        )
        
        # Invalidate autocomplete caches when workspace changes
        invalidate_consultation_caches(consultation_id)
        logger.info(f"Workspace generated for {consultation_id}, caches invalidated")
        
        return WorkspaceOut(
            consultation_id=consultation_id,
            patient_id=patient_id,
            visit_focus=workspace_data.get("visit_focus", ""),
            agenda=workspace_data.get("agenda", []),
            hpi=workspace_data.get("hpi", {}),
            problems=workspace_data.get("problems", []),
            generated_at=datetime.now().isoformat(),
            created_at=saved.get("created_at"),
            updated_at=saved.get("updated_at"),
        )
    except Exception as e:
        logger.error(f"Failed to generate workspace: {str(e)}")
        raise HTTPException(500, f"Failed to generate workspace: {str(e)}")


@router.get("/{consultation_id}/workspace")
def get_consultation_workspace(consultation_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Get saved workspace for consultation."""
    workspace = get_workspace(consultation_id)
    if not workspace:
        raise HTTPException(404, "Workspace not found")
    
    return workspace


@router.patch("/{consultation_id}/workspace")
def update_workspace(consultation_id: str, payload: SaveWorkspaceIn, user: Dict[str, Any] = Depends(get_current_user)):
    """Update workspace state for consultation."""
    try:
        # Get consultation to fetch patient_id
        consultation = get_consultation(consultation_id)
        if not consultation:
            raise HTTPException(404, f"Consultation {consultation_id} not found")
        
        patient_id = consultation["patient_id"]
        
        saved = save_workspace(
            consultation_id=consultation_id,
            patient_id=patient_id,  # Use patient_id from consultation, not payload
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


# ============================================================================
# ENRICHMENT ENDPOINTS - "Seed → Enrich" model
# Doctor-driven, on-demand clinical content generation
# ============================================================================

@router.post("/{consultation_id}/workspace/enrich-problem", response_model=EnrichProblemOut)
def enrich_problem_endpoint(consultation_id: str, payload: EnrichProblemIn):
    """
    Enrich a problem with clinical content (symptoms, red flags, assessment, plan, orders).
    
    Called when doctor clicks "Fill" button on a problem.
    Returns problem-specific clinical content based on the problem title and evidence.
    
    This is the "Enrich" step in the "Seed → Enrich" model:
    - Seed: Workspace generator creates problems with only title + evidence
    - Enrich: Doctor triggers this endpoint to fill clinical content
    
    Mode options:
    - "auto" (default): KB-first, LLM-fallback for unknown problems
    - "kb": Knowledge base only (safe, predictable)
    - "llm": LLM only (broad coverage, requires review)
    """
    try:
        # Parse enrichment mode
        mode = EnrichmentMode(payload.mode) if payload.mode else EnrichmentMode.AUTO
        
        # Build problem dict for enrichment
        problem = {
            "id": payload.problem_id,
            "title": payload.problem_title,
            "evidence": payload.evidence,
            "urgency": payload.urgency,
        }
        
        # Full or partial enrichment based on fields requested
        if payload.fields:
            enriched = enrich_problem_partial(problem, payload.fields, mode)
        else:
            enriched = enrich_problem_full(problem, mode)
        
        return EnrichProblemOut(
            problem_id=payload.problem_id,
            symptoms=enriched.get("symptoms"),
            red_flags=enriched.get("red_flags"),
            assessment=enriched.get("assessment"),
            plan=enriched.get("plan"),
            suggested_orders=enriched.get("suggested_orders"),
            origin=enriched.get("origin"),
            requires_review=enriched.get("requires_review", False),
        )
    except Exception as e:
        logger.error(f"Failed to enrich problem: {str(e)}")
        raise HTTPException(500, f"Failed to enrich problem: {str(e)}")


@router.post("/{consultation_id}/workspace/enrich-hpi", response_model=EnrichHPIOut)
def enrich_hpi_endpoint(consultation_id: str, payload: EnrichHPIIn):
    """
    Enrich HPI section with syndrome-specific symptoms and red flags.
    
    Called when doctor wants to add symptom prompts or red flag checklist to HPI.
    Uses hybrid KB-first, LLM-fallback approach.
    """
    try:
        # Parse enrichment mode
        mode = EnrichmentMode(payload.mode) if payload.mode else EnrichmentMode.AUTO
        
        fields = payload.fields or ["symptoms", "red_flags"]
        
        result = enrich_hpi(
            syndrome=payload.syndrome,
            fields=fields,
            mode=mode
        )
        
        return EnrichHPIOut(
            symptoms=result.get("symptoms"),
            red_flags=result.get("red_flags"),
            origin=result.get("origin"),
            requires_review=result.get("requires_review", False),
        )
    except Exception as e:
        logger.error(f"Failed to enrich HPI: {str(e)}")
        raise HTTPException(500, f"Failed to enrich HPI: {str(e)}")

