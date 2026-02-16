from __future__ import annotations

import logging
import uuid
from datetime import date, datetime
from typing import List, Dict, Any, Optional

from medicai.storage.file_store import FileStore
from medicai.schemas import LabDocument, RadiologyDocument, PrescriptionDocument, AnyDocument, LabTest

# SQL-backed versions
from medicai.agent.patient_tools_sql import (
    get_abnormal_labs_sql,
    get_lab_trend_sql,
    get_radiology_conclusions_sql,
    get_patient_snapshot_sql,
    get_current_meds_sql,
)

from medicai.storage.postgres import ping_db

logger = logging.getLogger(__name__)

store = FileStore()


def _generate_correlation_id() -> str:
    """Generate a short correlation ID for tracking fallback events."""
    return uuid.uuid4().hex[:8]


def _parse_date(date_str: Optional[str | date]) -> Optional[date]:
    """
    Accepts either a date, ISO string 'YYYY-MM-DD', or None.
    Normalizes to date or None.
    """
    if date_str is None:
        return None
    if isinstance(date_str, date):
        return date_str
    try:
        return datetime.fromisoformat(date_str).date()
    except Exception:
        return None


def _normalize_test_name(name: str) -> str:
    """Simple normalization for lab test names."""
    return name.strip().lower().replace(" ", "_")


# --------------------------------------------------------------------------- #
# 1. Get all lab docs for a patient (optionally filtered by date)
# --------------------------------------------------------------------------- #

def get_patient_labs(
    patient_id: str,
    since: Optional[str] = None,
) -> List[LabDocument]:
    """
    Load all lab documents for a patient, optionally only those on/after `since`.

    Arguments:
        patient_id: patient identifier (must match what's in your JSON).
        since: optional date string "YYYY-MM-DD". If provided, only labs with
               metadata.date_of_service >= since are returned.

    Returns:
        List of LabDocument instances.
    """
    docs: List[AnyDocument] = store.load_by_patient(patient_id)
    labs: List[LabDocument] = [
        d for d in docs if isinstance(d, LabDocument)
    ]

    since_date = _parse_date(since)
    if since_date is None:
        return labs

    filtered: List[LabDocument] = []
    for lab in labs:
        doc_date = lab.metadata.date_of_service
        if doc_date is None or doc_date >= since_date:
            filtered.append(lab)

    return filtered


# --------------------------------------------------------------------------- #
# 2. Get abnormal lab results (per test, per date)
# --------------------------------------------------------------------------- #

def get_abnormal_labs(
    patient_id: str,
    since: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    SQL-first, FileStore fallback with logged warnings.
    """
    correlation_id = _generate_correlation_id()
    
    if ping_db():
        try:
            rows = get_abnormal_labs_sql(patient_id, since=since)
            if rows:
                return rows
        except Exception as e:
            logger.warning(
                f"[{correlation_id}] DB query failed for get_abnormal_labs(patient_id={patient_id}), "
                f"falling back to FileStore. Error: {e}"
            )

    # ---- fallback: FileStore logic (existing code below) ----
    logger.info(f"[{correlation_id}] Using FileStore fallback for get_abnormal_labs(patient_id={patient_id})")
    labs = get_patient_labs(patient_id, since=since)
    abnormalities: List[Dict[str, Any]] = []

    for lab in labs:
        doc_date = lab.metadata.date_of_service
        for test in lab.structured.tests:
            if test.flag and test.flag != "normal":
                abnormalities.append(
                    {
                        "patient_id": lab.patient_id,
                        "doc_id": lab.doc_id,
                        "date_of_service": doc_date.isoformat() if doc_date else None,
                        "panel_name": lab.structured.panel_name,
                        "test_name": test.name,
                        "value": test.value,
                        "unit": test.unit,
                        "ref_low": test.ref_low,
                        "ref_high": test.ref_high,
                        "flag": test.flag,
                        "source_text": test.source_text,
                    }
                )

    abnormalities.sort(
        key=lambda x: _parse_date(x["date_of_service"]) or date.min,
        reverse=True,
    )
    return abnormalities



# --------------------------------------------------------------------------- #
# 3. Get time series trend for a single lab test
# --------------------------------------------------------------------------- #

def get_lab_trend(
    patient_id: str,
    test_name: str,
    since: Optional[str] = None,
) -> Dict[str, Any]:
    correlation_id = _generate_correlation_id()
    
    if ping_db():
        try:
            result = get_lab_trend_sql(patient_id, test_name, since=since)
            if result.get("points"):
                return result
        except Exception as e:
            logger.warning(
                f"[{correlation_id}] DB query failed for get_lab_trend(patient_id={patient_id}, test={test_name}), "
                f"falling back to FileStore. Error: {e}"
            )

    # ---- fallback: existing FileStore logic ----
    logger.info(f"[{correlation_id}] Using FileStore fallback for get_lab_trend(patient_id={patient_id}, test={test_name})")
    norm_target = _normalize_test_name(test_name)
    labs = get_patient_labs(patient_id, since=since)

    points: List[Dict[str, Any]] = []

    for lab in labs:
        doc_date = lab.metadata.date_of_service
        for test in lab.structured.tests:
            if _normalize_test_name(test.name) == norm_target:
                points.append(
                    {
                        "date_of_service": doc_date.isoformat() if doc_date else None,
                        "value": test.value,
                        "unit": test.unit,
                        "ref_low": test.ref_low,
                        "ref_high": test.ref_high,
                        "flag": test.flag,
                        "doc_id": lab.doc_id,
                        "panel_name": lab.structured.panel_name,
                    }
                )

    points.sort(key=lambda x: _parse_date(x["date_of_service"]) or date.min)

    return {
        "patient_id": patient_id,
        "test_name": test_name,
        "points": points,
    }



# --------------------------------------------------------------------------- #
# 4. Summarize radiology reports (list of conclusions)
# --------------------------------------------------------------------------- #

def get_radiology_conclusions(
    patient_id: str,
    since: Optional[str] = None,
) -> List[Dict[str, Any]]:
    correlation_id = _generate_correlation_id()
    
    if ping_db():
        try:
            rows = get_radiology_conclusions_sql(patient_id, since=since)
            if rows:
                return rows
        except Exception as e:
            logger.warning(
                f"[{correlation_id}] DB query failed for get_radiology_conclusions(patient_id={patient_id}), "
                f"falling back to FileStore. Error: {e}"
            )

    # ---- fallback: existing FileStore logic ----
    logger.info(f"[{correlation_id}] Using FileStore fallback for get_radiology_conclusions(patient_id={patient_id})")
    docs: List[AnyDocument] = store.load_by_patient(patient_id)
    rads: List[RadiologyDocument] = [
        d for d in docs if isinstance(d, RadiologyDocument)
    ]

    since_date = _parse_date(since)
    results: List[Dict[str, Any]] = []

    for rad in rads:
        doc_date = rad.metadata.date_of_service
        if since_date is not None and doc_date is not None and doc_date < since_date:
            continue

        results.append(
            {
                "patient_id": rad.patient_id,
                "doc_id": rad.doc_id,
                "date_of_service": doc_date.isoformat() if doc_date else None,
                "type_examen": rad.metadata.type_examen,
                "contexte_clinique": rad.structured.contexte_clinique,
                "resultats": rad.structured.resultats,
                "conclusion": rad.structured.conclusion,
                "text": rad.text,
            }
        )

    results.sort(
        key=lambda x: _parse_date(x["date_of_service"]) or date.min,
        reverse=True,
    )
    return results



# --------------------------------------------------------------------------- #
# 5. High-level patient snapshot (latest labs + radiology)
# --------------------------------------------------------------------------- #

def get_patient_snapshot(patient_id: str) -> Dict[str, Any]:
    # SQL first
    correlation_id = _generate_correlation_id()
    
    if ping_db():
        try:
            snap = get_patient_snapshot_sql(patient_id)
            # if SQL has at least one of lab/rad, trust it
            if snap.get("latest_lab") or snap.get("latest_radiology"):
                return snap
        except Exception as e:
            logger.warning(
                f"[{correlation_id}] DB query failed for get_patient_snapshot(patient_id={patient_id}), "
                f"falling back to FileStore. Error: {e}"
            )

    # ---- fallback: existing FileStore logic ----
    logger.info(f"[{correlation_id}] Using FileStore fallback for get_patient_snapshot(patient_id={patient_id})")
    docs: List[AnyDocument] = store.load_by_patient(patient_id)

    labs: List[LabDocument] = [d for d in docs if isinstance(d, LabDocument)]
    rads: List[RadiologyDocument] = [d for d in docs if isinstance(d, RadiologyDocument)]

    def _latest_by_date(items):
        items_with_date = [i for i in items if i.metadata.date_of_service is not None]
        if not items_with_date:
            return None
        return sorted(items_with_date, key=lambda d: d.metadata.date_of_service, reverse=True)[0]

    latest_lab = _latest_by_date(labs)
    latest_rad = _latest_by_date(rads)

    snapshot: Dict[str, Any] = {
        "patient_id": patient_id,
        "latest_lab": None,
        "latest_radiology": None,
    }

    if latest_lab:
        snapshot["latest_lab"] = {
            "doc_id": latest_lab.doc_id,
            "date_of_service": latest_lab.metadata.date_of_service.isoformat() if latest_lab.metadata.date_of_service else None,
            "panel_name": latest_lab.structured.panel_name,
            "tests": [
                {
                    "name": t.name,
                    "value": t.value,
                    "unit": t.unit,
                    "ref_low": t.ref_low,
                    "ref_high": t.ref_high,
                    "flag": t.flag,
                }
                for t in latest_lab.structured.tests
            ],
        }

    if latest_rad:
        snapshot["latest_radiology"] = {
            "doc_id": latest_rad.doc_id,
            "date_of_service": latest_rad.metadata.date_of_service.isoformat() if latest_rad.metadata.date_of_service else None,
            "type_examen": latest_rad.metadata.type_examen,
            "conclusion": latest_rad.structured.conclusion,
        }

    return snapshot


# --------------------------------------------------------------------------- #
# 5. Get current medications (prescriptions)
# --------------------------------------------------------------------------- #

def get_current_meds(
    patient_id: str,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Get current medications for a patient.
    SQL-first with FileStore fallback (with logging).
    
    Arguments:
        patient_id: patient identifier
        limit: maximum number of items to return (default 50)
    
    Returns:
        List of medication dictionaries with prescription item fields
    """
    correlation_id = _generate_correlation_id()
    
    if ping_db():
        try:
            rows = get_current_meds_sql(patient_id, limit=limit)
            if rows:
                return rows
        except Exception as e:
            logger.warning(
                f"[{correlation_id}] DB query failed for get_current_meds(patient_id={patient_id}), "
                f"falling back to FileStore. Error: {e}"
            )

    # ---- fallback: FileStore logic ----
    logger.info(f"[{correlation_id}] Using FileStore fallback for get_current_meds(patient_id={patient_id})")
    docs: List[AnyDocument] = store.load_by_patient(patient_id)
    prescriptions: List[PrescriptionDocument] = [
        d for d in docs if isinstance(d, PrescriptionDocument)
    ]

    # Flatten items from all prescriptions
    med_items: List[Dict[str, Any]] = []
    for rx in prescriptions:
        doc_date = rx.metadata.date_of_service
        prescriber = rx.metadata.prescriber_full_name
        prescriber_specialty = rx.metadata.prescriber_specialty
        
        for item in rx.structured.items:
            med_items.append(
                {
                    "doc_id": rx.doc_id,
                    "patient_id": rx.patient_id,
                    "date_of_service": doc_date.isoformat() if doc_date else None,
                    "prescriber_name": prescriber,
                    "prescriber_specialty": prescriber_specialty,
                    "drug_name": item.drug_name,
                    "strength_or_concentration": item.strength_or_concentration,
                    "form": item.form,
                    "route": item.route,
                    "dose": item.dose,
                    "frequency": item.frequency,
                    "duration": item.duration,
                    "quantity": item.quantity,
                    "instructions": item.instructions,
                    "as_written": item.as_written,
                    "confidence": item.confidence,
                }
            )

    # Sort by date descending
    med_items.sort(
        key=lambda x: _parse_date(x["date_of_service"]) or date.min,
        reverse=True,
    )
    
    return med_items[:limit]
