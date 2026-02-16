"""
API endpoints for maintenance tasks.
"""
from fastapi import APIRouter, HTTPException, Depends
from app.auth import require_owner
from medicai.storage.maintenance import (
    auto_complete_old_consultations,
    auto_archive_inactive_patients,
    run_all_maintenance_tasks,
)

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.post("/complete-old-consultations")
def complete_old_consultations(user=Depends(require_owner)):
    """Manually trigger auto-completion of consultations older than 6 hours."""
    try:
        count = auto_complete_old_consultations()
        return {
            "message": f"Auto-completed {count} old consultation(s)",
            "consultations_completed": count,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to complete consultations: {str(e)}")


@router.post("/archive-inactive-patients")
def archive_inactive_patients(days: int = 180, user=Depends(require_owner)):
    """
    Manually trigger auto-archiving of patients inactive for specified days.
    
    Args:
        days: Number of days of inactivity (default: 180)
    """
    try:
        count = auto_archive_inactive_patients(days)
        return {
            "message": f"Archived {count} inactive patient(s)",
            "patients_archived": count,
            "inactivity_threshold_days": days,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to archive patients: {str(e)}")


@router.post("/run-all")
def run_all_maintenance(inactive_days: int = 180, user=Depends(require_owner)):
    """
    Run all maintenance tasks at once.
    
    Args:
        inactive_days: Number of days of inactivity before archiving patients
    """
    try:
        results = run_all_maintenance_tasks(inactive_days)
        return {
            "message": "Maintenance tasks completed",
            **results,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to run maintenance tasks: {str(e)}")


@router.get("/status")
def maintenance_status():
    """Get information about maintenance tasks."""
    return {
        "available_tasks": [
            {
                "name": "complete_old_consultations",
                "description": "Auto-complete consultations older than 6 hours",
                "endpoint": "/api/maintenance/complete-old-consultations",
            },
            {
                "name": "archive_inactive_patients",
                "description": "Archive patients with no consultations in X days",
                "endpoint": "/api/maintenance/archive-inactive-patients?days=180",
            },
            {
                "name": "run_all",
                "description": "Run all maintenance tasks",
                "endpoint": "/api/maintenance/run-all?inactive_days=180",
            },
        ],
        "automatic_triggers": [
            "Patients are automatically unarchived when a new consultation is created for them",
        ],
    }
