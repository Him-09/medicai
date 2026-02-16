"""Agent tools definitions for direct LangChain usage with provenance-safe outputs.

This module defines ``@tool``-decorated functions compatible with
LangGraph agents. All outputs include source provenance (doc_id, date_of_service).
"""

import logging
from typing import Any, Dict, List, Optional

from langchain.tools import tool

from medicai.agent.patient_tools import (
    get_abnormal_labs,
    get_lab_trend,
    get_radiology_conclusions,
    get_patient_snapshot,
    get_current_meds,
)
from medicai.agent.consultation_prep_sql import generate_consultation_prep_sql
from medicai.rag.pgvector_retriever import rag_search
from medicai.storage.consultation_summary_store import list_patient_summaries
from medicai.storage.file_store import FileStore
from medicai.config import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Critical value thresholds (curated per-test, evidence-based)
# Values outside these ranges warrant immediate clinical attention
# ---------------------------------------------------------------------------

CRITICAL_THRESHOLDS: Dict[str, Dict[str, Optional[float]]] = {
    # Test name (lowercase) -> {"critical_low": val, "critical_high": val}
    # Source: Common lab critical value protocols
    "potassium": {"critical_low": 2.5, "critical_high": 6.5},
    "sodium": {"critical_low": 120, "critical_high": 160},
    "glucose": {"critical_low": 40, "critical_high": 500},
    "hemoglobin": {"critical_low": 7.0, "critical_high": 20.0},
    "hematocrit": {"critical_low": 20, "critical_high": 60},
    "platelets": {"critical_low": 50, "critical_high": 1000},
    "white blood cells": {"critical_low": 2.0, "critical_high": 30.0},
    "wbc": {"critical_low": 2.0, "critical_high": 30.0},
    "creatinine": {"critical_low": None, "critical_high": 10.0},
    "calcium": {"critical_low": 6.5, "critical_high": 13.0},
    "magnesium": {"critical_low": 1.0, "critical_high": 4.0},
    "phosphorus": {"critical_low": 1.0, "critical_high": None},
    "inr": {"critical_low": None, "critical_high": 5.0},
    "ptt": {"critical_low": None, "critical_high": 100},
    "troponin": {"critical_low": None, "critical_high": 0.1},  # Any elevation significant
    "lactate": {"critical_low": None, "critical_high": 4.0},
    "ph": {"critical_low": 7.2, "critical_high": 7.6},
    "pco2": {"critical_low": 20, "critical_high": 70},
    "po2": {"critical_low": 40, "critical_high": None},
    "bicarbonate": {"critical_low": 10, "critical_high": 40},
    "bilirubin": {"critical_low": None, "critical_high": 15.0},
    "ammonia": {"critical_low": None, "critical_high": 100},
}


def _normalize_test_name(name: str) -> str:
    """Normalize test name for threshold lookup."""
    return name.strip().lower().replace("_", " ")


def check_critical_value(test_name: str, value: Optional[float]) -> Dict[str, Any]:
    """
    Check if a lab value is critically abnormal using evidence-based thresholds.
    
    Returns:
        Dict with is_critical, alert_type (CRITICAL_LOW/CRITICAL_HIGH/NORMAL), and threshold info
    """
    if value is None:
        return {"is_critical": False, "alert_type": "UNKNOWN", "reason": "no_value"}
    
    norm_name = _normalize_test_name(test_name)
    thresholds = CRITICAL_THRESHOLDS.get(norm_name)
    
    if not thresholds:
        # No curated threshold for this test - rely on lab-provided flag only
        return {"is_critical": False, "alert_type": "NOT_TRACKED", "reason": "no_threshold_defined"}
    
    crit_low = thresholds.get("critical_low")
    crit_high = thresholds.get("critical_high")
    
    if crit_low is not None and value < crit_low:
        return {
            "is_critical": True,
            "alert_type": "CRITICAL_LOW",
            "threshold": crit_low,
            "reason": f"Value {value} below critical threshold {crit_low}"
        }
    
    if crit_high is not None and value > crit_high:
        return {
            "is_critical": True,
            "alert_type": "CRITICAL_HIGH",
            "threshold": crit_high,
            "reason": f"Value {value} above critical threshold {crit_high}"
        }
    
    return {"is_critical": False, "alert_type": "NORMAL", "reason": "within_safe_range"}


@tool("get_abnormal_labs")
def get_abnormal_labs_tool(patient_id: str) -> Any:
    """Retrieve all abnormal lab results for a patient with source provenance.
    
    Returns results sorted by date (most recent first), with:
    - Lab-reported flag (low/high) from the original report
    - Critical value alerts for specific tests (potassium, sodium, glucose, etc.)
    - Source provenance: doc_id, date_of_service for every result
    
    NOTE: Critical alerts use evidence-based thresholds for key tests only.
    Always verify abnormalities against the original document.
    """
    raw_results = get_abnormal_labs(patient_id)
    
    # Enhance with critical value checking (not percentage-based)
    enhanced_results = []
    critical_count = 0
    
    for result in raw_results:
        test_name = result.get('test_name', '')
        value = result.get('value')
        
        # Check against curated critical thresholds
        critical_check = check_critical_value(test_name, value)
        result['critical_alert'] = critical_check
        
        if critical_check.get('is_critical'):
            critical_count += 1
        
        # Ensure provenance fields are present
        result['source'] = {
            'doc_id': result.get('doc_id'),
            'date_of_service': result.get('date_of_service'),
            'panel_name': result.get('panel_name'),
        }
        
        enhanced_results.append(result)
    
    # Sort by date descending (most recent first), then by critical status
    enhanced_results.sort(key=lambda x: (
        0 if x.get('critical_alert', {}).get('is_critical') else 1,
        x.get('date_of_service') or '0000-00-00'
    ), reverse=True)
    
    # Summary uses lab-reported flags only (not computed)
    summary = {
        "total_abnormal": len(enhanced_results),
        "critical_alerts": critical_count,
        "high_flag_count": sum(1 for r in enhanced_results if r.get('flag') == 'high'),
        "low_flag_count": sum(1 for r in enhanced_results if r.get('flag') == 'low'),
        "note": "Critical alerts based on curated thresholds for key tests. Lab flags (high/low) from original reports."
    }
    
    return {
        "summary": summary,
        "results": enhanced_results[:50]  # Limit to top 50 for token management
    }


@tool("get_lab_trend")
def get_lab_trend_tool(patient_id: str, test_name: str) -> Any:
    """Retrieve time series data for a specific lab test with source provenance.
    
    Returns chronological data points with:
    - Each point includes: value, date_of_service, doc_id, flag
    - Trend analysis: direction, percentage change
    - All sources cited for verification

    Args:
        patient_id: The patient identifier
        test_name: The name of the lab test to analyze
    """
    trend_data = get_lab_trend(patient_id=patient_id, test_name=test_name)
    points = trend_data.get("points", [])
    
    # Ensure each point has source provenance
    for point in points:
        point['source'] = {
            'doc_id': point.get('doc_id'),
            'date_of_service': point.get('date_of_service'),
            'panel_name': point.get('panel_name'),
        }
    
    if len(points) < 2:
        trend_analysis = {
            "direction": "INSUFFICIENT_DATA",
            "description": "Need at least 2 data points for trend analysis",
            "data_completeness": "INCOMPLETE"
        }
    else:
        sorted_points = sorted(points, key=lambda x: x.get('date_of_service', '') or '')
        first_val = sorted_points[0].get('value')
        last_val = sorted_points[-1].get('value')
        
        if first_val is not None and last_val is not None and first_val != 0:
            pct_change = ((last_val - first_val) / abs(first_val) * 100)
            
            if abs(pct_change) < 5:
                direction = "STABLE"
            elif pct_change > 20:
                direction = "SIGNIFICANTLY_INCREASING"
            elif pct_change > 5:
                direction = "INCREASING"
            elif pct_change < -20:
                direction = "SIGNIFICANTLY_DECREASING"
            elif pct_change < -5:
                direction = "DECREASING"
            else:
                direction = "STABLE"
            
            trend_analysis = {
                "direction": direction,
                "pct_change": round(pct_change, 1),
                "first_value": first_val,
                "first_date": sorted_points[0].get('date_of_service'),
                "first_doc_id": sorted_points[0].get('doc_id'),
                "last_value": last_val,
                "last_date": sorted_points[-1].get('date_of_service'),
                "last_doc_id": sorted_points[-1].get('doc_id'),
                "num_points": len(sorted_points),
                "data_completeness": "COMPLETE"
            }
        else:
            trend_analysis = {
                "direction": "INCOMPLETE_DATA",
                "description": "Missing or zero values in time series",
                "data_completeness": "INCOMPLETE"
            }
    
    trend_data["trend_analysis"] = trend_analysis
    return trend_data


@tool("get_radiology_conclusions")
def get_radiology_conclusions_tool(patient_id: str) -> Any:
    """Retrieve radiology report conclusions with full source provenance.
    
    Returns reports sorted by date (latest first), each with:
    - doc_id, date_of_service, exam_type
    - conclusion and key findings
    - Full traceability for citation
    """
    radiology_data = get_radiology_conclusions(patient_id)
    
    if isinstance(radiology_data, list) and len(radiology_data) > 0:
        sorted_data = sorted(
            radiology_data,
            key=lambda x: x.get('date_of_service') or '0000-00-00',
            reverse=True
        )
        
        # Ensure each report has standardized source fields
        for report in sorted_data:
            report['source'] = {
                'doc_id': report.get('doc_id'),
                'date_of_service': report.get('date_of_service'),
                'exam_type': report.get('type_examen') or report.get('exam_type'),
            }
        
        analysis = {
            "total_reports": len(sorted_data),
            "latest_date": sorted_data[0].get('date_of_service') if sorted_data else None,
            "latest_doc_id": sorted_data[0].get('doc_id') if sorted_data else None,
            "oldest_date": sorted_data[-1].get('date_of_service') if sorted_data else None,
            "exam_types": list(set(r.get('source', {}).get('exam_type') or 'Unknown' for r in sorted_data))
        }
        
        return {
            "analysis": analysis,
            "reports": sorted_data
        }
    
    return {"analysis": {"total_reports": 0}, "reports": []}


@tool("get_patient_snapshot")
def get_patient_snapshot_tool(patient_id: str) -> Any:
    """Get a high-level overview of patient's latest lab and radiology data.
    
    Returns:
    - Latest lab panel with all test results and doc_id
    - Latest radiology report conclusion and doc_id
    - Data completeness assessment
    """
    snapshot = get_patient_snapshot(patient_id)
    
    if isinstance(snapshot, dict):
        latest_lab = snapshot.get('latest_lab')
        latest_rad = snapshot.get('latest_radiology')
        
        metadata = {
            "has_lab_data": latest_lab is not None,
            "has_imaging_data": latest_rad is not None,
            "data_completeness": "COMPLETE" if (latest_lab and latest_rad) else "PARTIAL" if (latest_lab or latest_rad) else "MINIMAL",
            "lab_source": {
                "doc_id": latest_lab.get('doc_id') if latest_lab else None,
                "date": latest_lab.get('date_of_service') if latest_lab else None,
            } if latest_lab else None,
            "radiology_source": {
                "doc_id": latest_rad.get('doc_id') if latest_rad else None,
                "date": latest_rad.get('date_of_service') if latest_rad else None,
            } if latest_rad else None,
        }
        
        snapshot["metadata"] = metadata
    
    return snapshot


@tool("consultation_prep")
def consultation_prep_tool(patient_id: str) -> str:
    """Generate a structured consultation preparation summary (DB-first).
    
    Retrieves data from PostgreSQL database for multi-instance compatibility.
    Falls back to file-based storage if DB unavailable.
    """
    from medicai.storage.postgres import ping_db
    from medicai.agent.consultation_prep import generate_consultation_prep
    
    # Try DB-first approach
    if ping_db():
        try:
            result = generate_consultation_prep_sql(patient_id)
            if result:
                return result
        except Exception as e:
            logger.warning(f"DB consultation prep failed for {patient_id}, falling back to files: {e}")
    
    # Fallback to file-based
    return generate_consultation_prep(str(config.DATA_PROCESSED_DIR), patient_id)


@tool("patient_rag_search")
def patient_rag_search_tool(patient_id: str, query: str, k: int = 5) -> Any:
    """Semantic search across patient documents with source provenance."""
    results = rag_search(patient_id=patient_id, query=query, k=k)

    # Normalize + enforce provenance consistently
    if isinstance(results, list):
        normalized = []
        for r in results:
            if not isinstance(r, dict):
                continue
            meta = r.get("metadata") or {}
            normalized.append({
                "text": r.get("text", ""),
                "metadata": meta,
                "source": {
                    "doc_id": meta.get("doc_id"),
                    "date_of_service": meta.get("date_of_service"),
                    "document_type": meta.get("document_type"),
                    "similarity": meta.get("similarity"),
                }
            })
        return normalized

    return results



@tool("get_previous_consultations")
def get_previous_consultations_tool(patient_id: str) -> Any:
    """Retrieve summaries of previous consultations with source provenance.
    
    Returns structured data (not just formatted text) for citation:
    - consultation_id, date, summary for each consultation
    - Helps provide continuity of care
    """
    summaries = list_patient_summaries(patient_id)
    
    if not summaries:
        return {
            "total_consultations": 0,
            "consultations": [],
            "message": f"No previous consultations found for patient {patient_id}."
        }
    
    # Return structured data with provenance
    consultations = []
    for s in summaries:
        created_at = s.get("created_at")
        date_str = created_at.strftime("%Y-%m-%d %H:%M") if hasattr(created_at, 'strftime') else str(created_at)
        
        consultations.append({
            "source": {
                "consultation_id": s.get('consultation_id'),
                "date": date_str,
            },
            "summary": s.get('summary'),
        })
    
    return {
        "total_consultations": len(consultations),
        "consultations": consultations
    }


@tool("get_document_by_id")
def get_document_by_id_tool(doc_id: str) -> Any:
    """Retrieve a specific document by its ID for verification.
    
    Use this tool when you need to:
    - Verify a specific finding mentioned by doc_id
    - Get full context of a document
    - Show the source to support a claim
    
    Args:
        doc_id: The unique document identifier
        
    Returns:
        Full document content with metadata for citation
    """
    store = FileStore()
    document = store.load(doc_id)
    
    if not document:
        return {
            "error": f"Document {doc_id} not found",
            "doc_id": doc_id,
        }
    
    # Return structured document data
    return {
        "source": {
            "doc_id": document.doc_id,
            "patient_id": document.patient_id,
            "document_type": document.document_type,
            "date_of_service": document.metadata.date_of_service.isoformat() if document.metadata.date_of_service else None,
        },
        "content": document.model_dump(mode='json'),
    }


@tool("get_current_meds")
def get_current_meds_tool(patient_id: str, limit: int = 50) -> Any:
    """Retrieve current medications with source provenance.
    
    Returns medications sorted by date (most recent first), each with:
    - drug_name, dosage, frequency, duration
    - source: doc_id, date_of_service, prescriber
    
    This tool does NOT provide medical advice. It only retrieves 
    prescribed medications from the patient's records.
    
    Args:
        patient_id: The patient identifier
        limit: Maximum number of medication items to return (default: 50)
    """
    meds = get_current_meds(patient_id=patient_id, limit=limit)
    
    # Enhance with standardized source provenance
    for med in meds:
        med['source'] = {
            'doc_id': med.get('doc_id'),
            'date_of_service': med.get('date_of_service'),
            'prescriber_name': med.get('prescriber_name'),
            'prescriber_specialty': med.get('prescriber_specialty'),
        }
    
    summary = {
        "total_medications": len(meds),
        "unique_drugs": len(set(m.get('drug_name') for m in meds if m.get('drug_name'))),
        "prescribers": list(set(m.get('prescriber_name') for m in meds if m.get('prescriber_name'))),
    }
    
    return {
        "summary": summary,
        "medications": meds
    }


tools = [
    get_abnormal_labs_tool,
    get_lab_trend_tool,
    get_radiology_conclusions_tool,
    get_patient_snapshot_tool,
    get_current_meds_tool,
    consultation_prep_tool,
    patient_rag_search_tool,
    get_previous_consultations_tool,
    get_document_by_id_tool,  # NEW: Allows verification of specific documents
]
