"""
Workspace generation logic - builds structured consultation workspace.
Fully DB-indexed - queries PostgreSQL tables directly, no filesystem dependency.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid
from medicai.storage.postgres import get_conn


def _load_patient_docs_from_db(patient_id: str) -> List[Dict[str, Any]]:
    """
    Load patient documents directly from PostgreSQL.
    Returns documents in the same format as file-based loader for compatibility.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cursor:
                # Get all documents with extracted data
                cursor.execute("""
                    SELECT 
                        doc_id,
                        document_type,
                        payload,
                        processed_at
                    FROM documents
                    WHERE patient_id = %s
                    ORDER BY processed_at DESC
                """, (patient_id,))
                
                rows = cursor.fetchall()
                
                docs = []
                for row in rows:
                    doc_id, doc_type, payload, processed_at = row
                    
                    # Map document_type to legacy format
                    legacy_type = "lab" if doc_type == "lab_report" else \
                                  "radiology" if doc_type == "radiology_report" else \
                                  "prescription" if doc_type == "prescription" else \
                                  doc_type
                    
                    # Normalize flags to lowercase in structured data
                    structured = payload.get("structured", {}) if payload else {}
                    if structured.get("tests"):
                        for test in structured["tests"]:
                            if "flag" in test and test["flag"]:
                                test["flag"] = test["flag"].lower()
                    
                    # Build document structure
                    doc = {
                        "document_id": doc_id,
                        "document_type": legacy_type,
                        "metadata": payload.get("metadata", {}) if payload else {},
                        "structured": structured,
                        "created_at": processed_at.isoformat() if processed_at else None
                    }
                    
                    docs.append(doc)
                
                return docs
    
    except Exception as e:
        print(f"Error loading documents from DB: {e}")
        return []


def _collect_lab_points(lab_docs: List[Dict]) -> List[str]:
    """
    Extract key lab findings from lab documents.
    Works with DB-loaded documents.
    """
    points = []
    
    for doc in lab_docs[:3]:  # Most recent 3 labs
        structured = doc.get("structured", {})
        tests = structured.get("tests", [])
        
        for test in tests:
            flag = test.get("flag", "").lower()
            if flag in ["high", "low", "critical", "critical_high", "critical_low", "abnormal"]:
                test_name = test.get("name", "Unknown")
                value = test.get("value", "")
                unit = test.get("unit", "")
                ref_low = test.get("ref_low")
                ref_high = test.get("ref_high")
                ref_range = _build_ref_range(ref_low, ref_high)
                
                # Determine arrow based on flag and value direction
                arrow = _get_arrow_for_flag(flag, str(value), ref_range)
                point = f"{test_name} {value} {unit}{arrow}"
                if ref_range:
                    point += f" (ref: {ref_range})"
                
                points.append(point)
                
                if len(points) >= 10:  # Limit to top 10
                    return points
    
    return points


def _get_arrow_for_flag(flag: str, value_str: str, ref_range: str) -> str:
    """
    Get appropriate arrow based on flag and value direction.
    Handles critical_high, critical_low, high, low properly.
    """
    if flag in ["high", "critical_high"]:
        return "↑"
    elif flag in ["low", "critical_low"]:
        return "↓"
    elif flag == "critical":
        # Infer direction from value vs reference range
        try:
            if "-" in ref_range:
                parts = ref_range.split("-")
                low = float(parts[0].strip())
                high = float(parts[1].strip().split()[0])
                value = float(value_str.split()[0])
                if value < low:
                    return "↓"
                elif value > high:
                    return "↑"
        except:
            pass
        return "⚠"
    else:
        return "⚠"


def _format_ref(ref: str) -> str:
    """Format reference range for display."""
    if not ref:
        return ""
    return f"(ref: {ref})"


def _build_ref_range(ref_low, ref_high) -> str:
    """Build reference range string from low and high values."""
    if ref_low and ref_high:
        return f"{ref_low}-{ref_high}"
    elif ref_low:
        return f">{ref_low}"
    elif ref_high:
        return f"<{ref_high}"
    return ""


# Test name normalization mapping (French -> English standard)
TEST_NAME_ALIASES = {
    # White blood cells
    "globules blancs": "wbc",
    "leucocytes": "wbc",
    "gb": "wbc",
    "white blood cells": "wbc",
    "white blood cell count": "wbc",
    # Red blood cells
    "globules rouges": "rbc",
    "gr": "rbc",
    "érythrocytes": "rbc",
    "erythrocytes": "rbc",
    "red blood cells": "rbc",
    # Hemoglobin
    "hémoglobine": "hemoglobin",
    "hb": "hemoglobin",
    "hgb": "hemoglobin",
    # Hematocrit
    "hématocrite": "hematocrit",
    "hct": "hematocrit",
    # Platelets
    "plaquettes": "platelets",
    "thrombocytes": "platelets",
    "plt": "platelets",
    # MCV
    "vgm": "mcv",
    "volume globulaire moyen": "mcv",
    # MCH
    "tcmh": "mch",
    "tgmh": "mch",
    # MCHC
    "ccmh": "mchc",
    # Glucose
    "glycémie": "glucose",
    "blood sugar": "glucose",
    "glycemie": "glucose",
    # Creatinine
    "créatinine": "creatinine",
    "creatinine": "creatinine",
    # BUN
    "urée": "bun",
    "urea": "bun",
    "blood urea nitrogen": "bun",
    # Liver enzymes
    "asat": "ast",
    "sgot": "ast",
    "alat": "alt",
    "sgpt": "alt",
    "gamma gt": "ggt",
    "γ-gt": "ggt",
    "phosphatases alcalines": "alp",
    # Bilirubin
    "bilirubine totale": "bilirubin",
    "bilirubine": "bilirubin",
    # Electrolytes
    "sodium": "sodium",
    "na": "sodium",
    "potassium": "potassium",
    "k": "potassium",
    "chlore": "chloride",
    "cl": "chloride",
    # HbA1c
    "hba1c": "hba1c",
    "hemoglobin a1c": "hba1c",
    "hémoglobine glyquée": "hba1c",
}


def _normalize_test_name(name: str) -> str:
    """Normalize test name to standard English form."""
    if not name:
        return ""
    lower_name = name.lower().strip()
    return TEST_NAME_ALIASES.get(lower_name, lower_name)


def _get_test_value(test: Dict) -> str:
    """Get test value with fallback for different field names."""
    return str(test.get("value", "") or test.get("result_value", "") or "").strip()


def _get_test_unit(test: Dict, default: str = "") -> str:
    """Get test unit with fallback."""
    return test.get("unit", default) or default


def _get_test_ref_range(test: Dict) -> str:
    """Get reference range from test with multiple field support."""
    if test.get("reference_range"):
        return test.get("reference_range")
    return _build_ref_range(test.get("ref_low"), test.get("ref_high"))


def _build_test_lookup(tests: List[Dict]) -> Dict[str, Dict]:
    """Build normalized test lookup map supporting both 'name' and 'test_name' fields."""
    test_map = {}
    for test in tests:
        # Support both 'name' and 'test_name' fields
        raw_name = test.get("name", "") or test.get("test_name", "")
        normalized = _normalize_test_name(raw_name)
        if normalized:
            test_map[normalized] = test
        # Also keep original lowercase for fallback
        if raw_name:
            test_map[raw_name.lower()] = test
    return test_map


def _empty_plan() -> Dict[str, List]:
    """
    Return empty plan structure - SEED MODE.
    
    All plan items are filled on-demand via enrichment tools.
    This avoids pre-generating generic checklists.
    """
    return {
        "today": [],
        "orders": [],
        "treatment": [],
        "follow_up": [],
        "safety_net": [],
    }


def _abnormal_distance_ratio(value_str: str, ref_str: str) -> float:
    """
    Calculate how far a value is from normal range.
    Returns a ratio (1.0 = at boundary, >1.0 = outside range).
    """
    try:
        value = float(value_str.split()[0])  # Extract numeric part
        
        # Parse reference range
        if '-' in ref_str:
            parts = ref_str.split('-')
            low = float(parts[0].strip())
            high = float(parts[1].strip().split()[0])
            
            if value < low:
                return low / value if value > 0 else 999
            elif value > high:
                return value / high
            else:
                return 0  # Within range
        
        return 0
    except:
        return 0


def generate_workspace_data(patient_id: str, processed_dir: str = None, consultation_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate structured workspace data for consultation.
    Fully DB-indexed - no filesystem dependency.
    
    Args:
        patient_id: Patient ID
        processed_dir: Ignored (kept for backward compatibility)
        consultation_id: Current consultation ID (to get changes since last visit)
    
    Returns:
        - visit_focus: str
        - agenda: List[{id, text, checked}]
        - hpi: HPISection dict
        - problems: List[ProblemBlock] dict
    """
    # Load documents from PostgreSQL
    docs = _load_patient_docs_from_db(patient_id)
    lab_docs = [d for d in docs if d.get("document_type") == "lab"]
    rad_docs = [d for d in docs if d.get("document_type") == "radiology"]
    
    # Sort by date
    lab_docs = sorted(lab_docs, key=lambda d: (d.get("metadata") or {}).get("date_of_service") or "0000-00-00", reverse=True)
    rad_docs = sorted(rad_docs, key=lambda d: (d.get("metadata") or {}).get("date_of_service") or "0000-00-00", reverse=True)
    
    # Get changes since last visit
    changes_summary = _get_changes_since_last_visit(patient_id, consultation_id)
    
    # Build HPI
    hpi = _build_hpi_section(lab_docs, rad_docs, changes_summary)
    
    # Build Problems from abnormal findings
    problems = _build_problems_from_labs(lab_docs, rad_docs)
    
    # Build agenda from problems + key findings
    agenda = _build_agenda(problems, hpi)
    
    # Generate visit focus
    visit_focus = _generate_visit_focus(problems, hpi)
    
    return {
        "visit_focus": visit_focus,
        "agenda": agenda,
        "hpi": hpi,
        "problems": problems,
    }


def _generate_visit_focus(problems: List[Dict], hpi: Dict) -> str:
    """Generate one-line visit focus."""
    if problems:
        main_problem = problems[0]["title"]
        return f"Follow-up visit: {main_problem}"
    return "Follow-up consultation"


def _build_agenda(problems: List[Dict], hpi: Dict) -> List[Dict]:
    """
    Build thin agenda - SEED MODE ONLY.
    
    Only objective items:
    - Top problems to address
    - Review evidence
    
    No pre-generated symptom/red flag items.
    """
    agenda = []
    agenda_id = 1
    
    # Add top 3 problems
    for problem in problems[:3]:
        agenda.append({
            "id": agenda_id,
            "text": f"Address: {problem['title']}",
            "checked": False
        })
        agenda_id += 1
    
    # Add review evidence item if we have objective highlights
    if hpi.get("objective_highlights"):
        agenda.append({
            "id": agenda_id,
            "text": "Review evidence and lab results",
            "checked": False
        })
        agenda_id += 1
    
    # Add changes since last visit if present
    if hpi.get("since_last_visit"):
        agenda.append({
            "id": agenda_id,
            "text": "Discuss changes since last visit",
            "checked": False
        })
        agenda_id += 1
    
    return agenda


def _get_changes_since_last_visit(patient_id: str, consultation_id: Optional[str]) -> List[Dict[str, Any]]:
    """
    Query database for changes since last visit.
    
    Returns structured list of changes:
    - type: "new_doc", "new_abnormal", "worsening", "new_imaging"
    - label: Display text
    - source: {document_id, date, etc}
    """
    if not consultation_id:
        return []
    
    try:
        with get_conn() as conn:
            with conn.cursor() as cursor:
                # Get last consultation timestamp
                cursor.execute("""
                    SELECT created_at 
                    FROM consultations 
                    WHERE patient_id = %s 
                      AND consultation_id != %s 
                      AND created_at < (SELECT created_at FROM consultations WHERE consultation_id = %s)
                    ORDER BY created_at DESC 
                    LIMIT 1
                """, (patient_id, consultation_id, consultation_id))
                
                last_consult = cursor.fetchone()
                if not last_consult:
                    return ""
                
                last_visit_time = last_consult[0]
                
                # Get new documents
                cursor.execute("""
                    SELECT document_type, processed_at
                    FROM documents
                    WHERE patient_id = %s AND processed_at > %s
                    ORDER BY processed_at DESC
                """, (patient_id, last_visit_time))
                
                new_docs = cursor.fetchall()
                
                # Get new abnormal lab results
                cursor.execute("""
                    SELECT test_name, value, unit, ref_low, ref_high, flag, doc_id, date_of_service
                    FROM lab_results
                    WHERE patient_id = %s 
                      AND date_of_service > %s
                      AND LOWER(flag) IN ('high', 'low', 'critical', 'critical_high', 'critical_low')
                    ORDER BY date_of_service DESC
                """, (patient_id, last_visit_time))
                
                new_abnormals = cursor.fetchall()
                
                # Get worsening trends (simplified - compare latest to previous)
                cursor.execute("""
                    SELECT DISTINCT lr1.test_name, 
                           lr1.value as current_value,
                           lr2.value as previous_value,
                           lr1.flag as current_flag,
                           lr2.flag as previous_flag,
                           lr1.doc_id,
                           lr1.date_of_service
                    FROM lab_results lr1
                    LEFT JOIN lab_results lr2 
                        ON lr1.patient_id = lr2.patient_id 
                        AND lr1.test_name = lr2.test_name
                        AND lr2.date_of_service <= %s
                        AND lr2.date_of_service = (
                            SELECT MAX(date_of_service) 
                            FROM lab_results 
                            WHERE patient_id = lr2.patient_id 
                              AND test_name = lr2.test_name 
                              AND date_of_service <= %s
                        )
                    WHERE lr1.patient_id = %s 
                      AND lr1.date_of_service > %s
                      AND LOWER(lr1.flag) IN ('high', 'low', 'critical', 'critical_high', 'critical_low')
                      AND (lr2.flag IS NULL OR LOWER(lr2.flag) = 'normal')
                """, (last_visit_time, last_visit_time, patient_id, last_visit_time))
                
                worsening = cursor.fetchall()
                
                # Get new imaging
                cursor.execute("""
                    SELECT exam_type, resultats, conclusion, doc_id, date_of_service
                    FROM radiology_reports
                    WHERE patient_id = %s AND date_of_service > %s
                    ORDER BY date_of_service DESC
                """, (patient_id, last_visit_time))
                
                new_imaging = cursor.fetchall()
                
                # Build structured changes list
                changes = []
                
                # Add new documents
                for doc_type, processed_at in new_docs:
                    changes.append({
                        "type": "new_doc",
                        "label": f"New {doc_type} uploaded",
                        "source": {
                            "document_type": doc_type,
                            "date": processed_at.isoformat() if processed_at else None
                        }
                    })
                
                # Add new abnormals
                for test_name, value, unit, ref_low, ref_high, flag, doc_id, date_of_service in new_abnormals[:5]:
                    ref_range = _build_ref_range(ref_low, ref_high)
                    arrow = _get_arrow_for_flag(flag.lower() if flag else "", value, ref_range)
                    changes.append({
                        "type": "new_abnormal",
                        "label": f"{test_name} {value}{unit or ''}{arrow}",
                        "source": {
                            "document_id": doc_id,
                            "date": date_of_service.isoformat() if date_of_service else None,
                            "test_name": test_name,
                            "value": value,
                            "flag": flag.lower() if flag else None
                        }
                    })
                
                # Add worsening trends
                for test_name, curr, prev, curr_flag, prev_flag, doc_id, date_of_service in worsening[:3]:
                    changes.append({
                        "type": "worsening",
                        "label": f"{test_name} {prev}→{curr}",
                        "source": {
                            "document_id": doc_id,
                            "date": date_of_service.isoformat() if date_of_service else None,
                            "test_name": test_name,
                            "previous_value": prev,
                            "current_value": curr
                        }
                    })
                
                # Add new imaging
                for exam_type, resultats, conclusion, doc_id, date_of_service in new_imaging[:2]:
                    summary = conclusion if conclusion else resultats[:100] if resultats else exam_type
                    changes.append({
                        "type": "new_imaging",
                        "label": f"{exam_type}: {summary[:80] if summary else 'Results available'}",
                        "source": {
                            "report_id": doc_id,
                            "date": date_of_service.isoformat() if date_of_service else None,
                            "study_type": exam_type
                        }
                    })
                
                return changes
        
    except Exception as e:
        print(f"Error getting changes since last visit: {e}")
        return ""


def _build_hpi_section(lab_docs: List[Dict], rad_docs: List[Dict], changes_summary: List[Dict]) -> Dict[str, Any]:
    """
    Build structured HPI section - SEED MODE ONLY.
    
    Only returns objectively grounded data:
    - one_liner: factual summary from labs/imaging
    - since_last_visit: objective changes
    - objective_highlights: lab values with doc_ids
    
    Empty placeholders for doctor-driven enrichment:
    - symptoms (filled via enrich_symptoms tool)
    - red_flags (filled via enrich_red_flags tool)
    """
    
    # Detect syndrome for one-liner only (no symptoms/red_flags)
    syndrome = _detect_syndrome_name_only(lab_docs)
    one_liner = _generate_objective_one_liner(lab_docs, rad_docs, syndrome)
    
    objective_highlights = []
    
    # Get most recent lab - objective data only
    if lab_docs:
        latest_lab = lab_docs[0]
        lab_date = (latest_lab.get("metadata") or {}).get("date_of_service") or "unknown"
        doc_id = latest_lab.get("document_id", "")
        
        # Build objective highlights - top 5 abnormal tests with doc_ids
        tests = (latest_lab.get("structured") or {}).get("tests", [])
        abnormal_tests = [t for t in tests if t.get("flag") in ["critical", "critical_high", "critical_low", "high", "low"]]
        
        for test in abnormal_tests[:5]:
            test_name = test.get("name", "Unknown")
            value = test.get("value", "")
            unit = test.get("unit", "")
            ref_low = test.get("ref_low")
            ref_high = test.get("ref_high")
            flag = test.get("flag", "")
            
            ref_range = _build_ref_range(ref_low, ref_high)
            arrow = _get_arrow_for_flag(flag, str(value), ref_range)
            highlight_text = f"{test_name}: {value} {unit}{arrow}"
            if ref_range:
                highlight_text += f" {_format_ref(ref_range)}"
            
            objective_highlights.append({
                "text": highlight_text,
                "source": f"Labs {lab_date}",
                "docId": doc_id,
                "date": lab_date,
                "type": "lab"
            })
    
    # Get most recent imaging - objective data only
    if rad_docs:
        latest_rad = rad_docs[0]
        rad_date = (latest_rad.get("metadata") or {}).get("date_of_service") or "unknown"
        doc_id = latest_rad.get("document_id", "")
        conclusion = (latest_rad.get("structured") or {}).get("conclusion", "")
        impression = (latest_rad.get("structured") or {}).get("impression", "")
        
        summary = conclusion or impression
        if summary:
            summary_text = summary[:150] + "..." if len(summary) > 150 else summary
            objective_highlights.append({
                "text": f"Imaging: {summary_text}",
                "source": f"Radiology {rad_date}",
                "docId": doc_id,
                "date": rad_date,
                "type": "radiology"
            })
    
    return {
        "one_liner": one_liner,
        # EMPTY - filled on-demand via enrichment tools
        "symptoms": [],
        "red_flags": [],
        # Objective data
        "since_last_visit": changes_summary,
        "objective_highlights": objective_highlights,
        # Doctor fills during consultation
        "meds_adherence": None,
        "meds_side_effects": None,
        "nsaids_use": None,
        "anticoagulants_use": None,
        "patient_goal": None,
        # Context for enrichment tools
        "syndrome": syndrome
    }


def _detect_syndrome_name_only(lab_docs: List[Dict]) -> Optional[str]:
    """
    Detect clinical syndrome name from lab pattern.
    Returns ONLY the syndrome name - no pre-generated content.
    Used for context in enrichment tools.
    """
    if not lab_docs:
        return None
    
    latest_lab = lab_docs[0]
    tests = (latest_lab.get("structured") or {}).get("tests", [])
    test_map = _build_test_lookup(tests)
    
    # Check for anemia
    hgb = test_map.get("hemoglobin")
    if hgb and hgb.get("flag") in ["low", "critical", "critical_low"]:
        return "anemia"
    
    # Check for WBC abnormalities
    wbc = test_map.get("wbc")
    if wbc and wbc.get("flag") in ["high", "low", "critical", "critical_high", "critical_low"]:
        wbc_flag = wbc.get("flag", "")
        return "leukocytosis" if wbc_flag in ["high", "critical_high"] else "leukopenia"
    
    # Check for renal dysfunction
    creatinine = test_map.get("creatinine")
    if creatinine and creatinine.get("flag") in ["high", "critical", "critical_high"]:
        return "renal_dysfunction"
    
    # Check for hyperglycemia
    glucose = test_map.get("glucose")
    if glucose and glucose.get("flag") in ["high", "critical", "critical_high"]:
        return "hyperglycemia"
    
    # Check for liver dysfunction
    alt = test_map.get("alt") or test_map.get("sgpt")
    ast = test_map.get("ast") or test_map.get("sgot")
    bilirubin = test_map.get("bilirubin")
    if (alt and alt.get("flag") in ["high", "critical", "critical_high"]) or \
       (ast and ast.get("flag") in ["high", "critical", "critical_high"]) or \
       (bilirubin and bilirubin.get("flag") in ["high", "critical", "critical_high"]):
        return "liver_dysfunction"
    
    # Check for electrolyte abnormalities
    potassium = test_map.get("potassium")
    if potassium and potassium.get("flag") in ["critical", "critical_high", "critical_low"]:
        is_high = potassium.get("flag") in ["critical_high", "high"]
        return "hyperkalemia" if is_high else "hypokalemia"
    
    return None


def _generate_objective_one_liner(lab_docs: List[Dict], rad_docs: List[Dict], syndrome: Optional[str]) -> str:
    """
    Generate objective one-liner summary.
    Based purely on facts from documents - no clinical interpretation.
    """
    parts = []
    
    # Add lab-based summary
    if lab_docs:
        latest_lab = lab_docs[0]
        lab_date = (latest_lab.get("metadata") or {}).get("date_of_service") or "unknown"
        tests = (latest_lab.get("structured") or {}).get("tests", [])
        test_map = _build_test_lookup(tests)
        
        # Get key values for one-liner based on syndrome
        if syndrome == "anemia":
            hgb = test_map.get("hemoglobin")
            if hgb:
                hgb_value = _get_test_value(hgb)
                hgb_flag = hgb.get("flag", "")
                severity = "severe" if "critical" in hgb_flag else "moderate"
                parts.append(f"{severity} anemia on CBC (Hb {hgb_value})")
        
        elif syndrome in ["leukocytosis", "leukopenia"]:
            wbc = test_map.get("wbc")
            if wbc:
                wbc_value = _get_test_value(wbc)
                parts.append(f"{syndrome} on CBC (WBC {wbc_value})")
        
        elif syndrome == "renal_dysfunction":
            cr = test_map.get("creatinine")
            if cr:
                cr_value = _get_test_value(cr)
                parts.append(f"elevated creatinine on labs (Cr {cr_value})")
        
        elif syndrome == "hyperglycemia":
            glucose = test_map.get("glucose")
            if glucose:
                glucose_value = _get_test_value(glucose)
                parts.append(f"elevated glucose ({glucose_value})")
        
        elif syndrome == "liver_dysfunction":
            parts.append("abnormal liver function tests")
        
        elif syndrome in ["hyperkalemia", "hypokalemia"]:
            k = test_map.get("potassium")
            if k:
                k_value = _get_test_value(k)
                parts.append(f"critical potassium (K {k_value})")
        
        else:
            # Count abnormal tests
            abnormal = [t for t in tests if t.get("flag") in ["high", "low", "critical", "critical_high", "critical_low"]]
            if abnormal:
                parts.append(f"{len(abnormal)} abnormal lab value(s)")
    
    # Add radiology summary if significant
    if rad_docs:
        latest_rad = rad_docs[0]
        conclusion = (latest_rad.get("structured") or {}).get("conclusion", "")
        if conclusion:
            # Check for significant findings
            text_lower = conclusion.lower()
            if any(kw in text_lower for kw in ["mass", "tumor", "tumeur", "tumoral", "nodule", "lesion"]):
                exam_type = (latest_rad.get("structured") or {}).get("exam_type", "imaging")
                parts.append(f"mass/lesion on {exam_type}")
    
    if parts:
        return f"Follow-up consultation; {'; '.join(parts)}"
    return "Follow-up visit"


def _detect_clinical_syndrome(lab_docs: List[Dict]) -> Dict[str, Any]:
    """
    Detect clinical syndrome from lab pattern.
    Returns syndrome-specific HPI context (one_liner, symptoms, red_flags).
    
    DEPRECATED: Use _detect_syndrome_name_only for seed mode.
    Kept for backward compatibility.
    """
    if not lab_docs:
        return {"name": None, "one_liner": "Follow-up visit", "symptoms": [], "red_flags": []}
    
    latest_lab = lab_docs[0]
    tests = (latest_lab.get("structured") or {}).get("tests", [])
    
    # Build normalized test lookup
    test_map = _build_test_lookup(tests)
    
    # Check for anemia syndrome (priority 1 - most common)
    hgb = test_map.get("hemoglobin")
    if hgb and hgb.get("flag") in ["low", "critical", "critical_low"]:
        hgb_value = _get_test_value(hgb)
        anemia_type = "severe" if hgb.get("flag") in ["critical", "critical_low"] else "moderate"
        
        return {
            "name": "anemia",
            "one_liner": f"Follow-up consultation; {anemia_type} anemia noted on recent CBC (Hb {hgb_value})",
            "symptoms": [
                {"name": "Fatigue", "details": "Severity and impact on daily activities"},
                {"name": "Dyspnea on exertion", "details": "Onset and triggers"},
                {"name": "Dizziness/lightheadedness", "details": "Frequency and circumstances"},
            ],
            "red_flags": [
                {"label": "Melena (black, tarry stools)", "checked": None},
                {"label": "Hematemesis (vomiting blood)", "checked": None},
                {"label": "Hematochezia (bright red blood per rectum)", "checked": None},
                {"label": "Chest pain or syncope", "checked": None},
            ]
        }
    
    # Check for leukocytosis/leukopenia (WBC abnormality)
    wbc = test_map.get("wbc")
    if wbc and wbc.get("flag") in ["high", "low", "critical", "critical_high", "critical_low"]:
        wbc_value = _get_test_value(wbc)
        wbc_flag = wbc.get("flag", "")
        is_high = wbc_flag in ["high", "critical_high"]
        is_critical = "critical" in wbc_flag
        
        if is_high:
            return {
                "name": "leukocytosis",
                "one_liner": f"Follow-up consultation; {'marked ' if is_critical else ''}leukocytosis on recent CBC (WBC {wbc_value})",
                "symptoms": [
                    {"name": "Fever", "details": "Temperature, duration, pattern"},
                    {"name": "Localized pain/swelling", "details": "Site of possible infection"},
                    {"name": "Fatigue/malaise", "details": "Severity and onset"},
                ],
                "red_flags": [
                    {"label": "High fever (>39°C/102°F)", "checked": None},
                    {"label": "Rigors/chills", "checked": None},
                    {"label": "Altered mental status", "checked": None},
                    {"label": "Unexplained weight loss", "checked": None},
                ]
            }
        else:
            return {
                "name": "leukopenia",
                "one_liner": f"Follow-up consultation; {'severe ' if is_critical else ''}leukopenia on recent CBC (WBC {wbc_value})",
                "symptoms": [
                    {"name": "Recurrent infections", "details": "Frequency and types"},
                    {"name": "Fever", "details": "Even low-grade fever is significant"},
                    {"name": "Fatigue", "details": "Severity"},
                ],
                "red_flags": [
                    {"label": "Fever (any temperature elevation)", "checked": None},
                    {"label": "Mouth sores/ulcers", "checked": None},
                    {"label": "Signs of infection", "checked": None},
                    {"label": "Petechiae/bruising", "checked": None},
                ]
            }
    
    # Check for renal dysfunction syndrome
    creatinine = test_map.get("creatinine")
    if creatinine and creatinine.get("flag") in ["high", "critical", "critical_high"]:
        cr_value = _get_test_value(creatinine)
        return {
            "name": "renal_dysfunction",
            "one_liner": f"Follow-up consultation; elevated creatinine on recent labs (Cr {cr_value})",
            "symptoms": [
                {"name": "Decreased urine output", "details": "Onset and volume"},
                {"name": "Edema", "details": "Location and severity"},
                {"name": "Nausea/vomiting", "details": "If present"},
            ],
            "red_flags": [
                {"label": "Oliguria/anuria", "checked": None},
                {"label": "Confusion or altered mental status", "checked": None},
                {"label": "Chest pain or dyspnea", "checked": None},
            ]
        }
    
    # Check for hyperglycemia
    glucose = test_map.get("glucose")
    if glucose and glucose.get("flag") in ["high", "critical", "critical_high"]:
        glucose_value = _get_test_value(glucose)
        return {
            "name": "hyperglycemia",
            "one_liner": f"Follow-up consultation; elevated glucose on recent labs ({glucose_value})",
            "symptoms": [
                {"name": "Polyuria (increased urination)", "details": "Frequency"},
                {"name": "Polydipsia (increased thirst)", "details": "Severity"},
                {"name": "Weight changes", "details": "Amount and timeline"},
            ],
            "red_flags": [
                {"label": "Confusion or altered mental status", "checked": None},
                {"label": "Fruity breath odor", "checked": None},
                {"label": "Abdominal pain", "checked": None},
            ]
        }
    
    # Check for liver dysfunction
    alt = test_map.get("alt") or test_map.get("sgpt")
    ast = test_map.get("ast") or test_map.get("sgot")
    bilirubin = test_map.get("bilirubin")
    if (alt and alt.get("flag") in ["high", "critical", "critical_high"]) or \
       (ast and ast.get("flag") in ["high", "critical", "critical_high"]) or \
       (bilirubin and bilirubin.get("flag") in ["high", "critical", "critical_high"]):
        return {
            "name": "liver_dysfunction",
            "one_liner": "Follow-up consultation; abnormal liver function tests on recent labs",
            "symptoms": [
                {"name": "Jaundice", "details": "Skin/eye yellowing"},
                {"name": "Right upper quadrant pain", "details": "Character and severity"},
                {"name": "Fatigue/weakness", "details": "Severity and onset"},
                {"name": "Dark urine/pale stools", "details": "If present"},
            ],
            "red_flags": [
                {"label": "Altered mental status (encephalopathy)", "checked": None},
                {"label": "Severe abdominal pain", "checked": None},
                {"label": "GI bleeding", "checked": None},
                {"label": "Fever with jaundice", "checked": None},
            ]
        }
    
    # Check for electrolyte abnormalities
    potassium = test_map.get("potassium")
    sodium = test_map.get("sodium")
    if potassium and potassium.get("flag") in ["critical", "critical_high", "critical_low"]:
        k_value = _get_test_value(potassium)
        is_high = potassium.get("flag") in ["critical_high", "high"]
        return {
            "name": "hyperkalemia" if is_high else "hypokalemia",
            "one_liner": f"Follow-up consultation; critical potassium level (K {k_value})",
            "symptoms": [
                {"name": "Muscle weakness", "details": "Distribution and severity"},
                {"name": "Palpitations", "details": "Frequency and associated symptoms"},
                {"name": "Fatigue", "details": "Severity"},
            ],
            "red_flags": [
                {"label": "Chest pain or palpitations", "checked": None},
                {"label": "Severe muscle weakness", "checked": None},
                {"label": "ECG changes", "checked": None},
                {"label": "Respiratory difficulty", "checked": None},
            ]
        }
    
    # No specific syndrome detected - check for any abnormals
    abnormal_tests = [t for t in tests if t.get("flag") in ["high", "low", "critical", "critical_high", "critical_low"]]
    if abnormal_tests:
        return {
            "name": None,
            "one_liner": f"Follow-up visit for {len(abnormal_tests)} abnormal lab value(s)",
            "symptoms": [],
            "red_flags": []
        }
    
    return {
        "name": None,
        "one_liner": "Follow-up visit",
        "symptoms": [],
        "red_flags": []
    }


def _build_problems_from_labs(lab_docs: List[Dict], rad_docs: List[Dict]) -> List[Dict]:
    """Build problem blocks from clinical syndromes (not just single tests)."""
    problems = []
    
    # Process lab documents if available
    if lab_docs:
        latest_lab = lab_docs[0]
        lab_date = (latest_lab.get("metadata") or {}).get("date_of_service") or "unknown"
        doc_id = latest_lab.get("document_id", "")
        tests = (latest_lab.get("structured") or {}).get("tests", [])
        
        # Build normalized test lookup
        test_map = _build_test_lookup(tests)
        
        # Detect and create problems for clinical syndromes
        syndrome = _detect_clinical_syndrome(lab_docs)
        syndrome_name = syndrome.get("name")
        
        if syndrome_name == "anemia":
            problem = _create_anemia_problem(test_map, lab_date, doc_id, lab_docs)
            if problem:
                problems.append(problem)
        
        elif syndrome_name == "leukocytosis":
            problem = _create_wbc_problem(test_map, lab_date, doc_id, lab_docs, is_high=True)
            if problem:
                problems.append(problem)
        
        elif syndrome_name == "leukopenia":
            problem = _create_wbc_problem(test_map, lab_date, doc_id, lab_docs, is_high=False)
            if problem:
                problems.append(problem)
        
        elif syndrome_name == "renal_dysfunction":
            problem = _create_renal_problem(test_map, lab_date, doc_id, lab_docs)
            if problem:
                problems.append(problem)
        
        elif syndrome_name == "hyperglycemia":
            problem = _create_diabetes_problem(test_map, lab_date, doc_id, lab_docs)
            if problem:
                problems.append(problem)
        
        elif syndrome_name == "liver_dysfunction":
            problem = _create_liver_problem(test_map, lab_date, doc_id, lab_docs)
            if problem:
                problems.append(problem)
        
        elif syndrome_name in ["hyperkalemia", "hypokalemia"]:
            problem = _create_electrolyte_problem(test_map, lab_date, doc_id, lab_docs, syndrome_name)
            if problem:
                problems.append(problem)
        
        # If no syndrome-based problem, fall back to critical/abnormal individual tests
        if not problems:
            critical_tests = [t for t in tests if t.get("flag") in ["critical", "critical_high", "critical_low"]]
            abnormal_tests = [t for t in tests if t.get("flag") in ["high", "low"]]
            
            for test in critical_tests[:2]:
                problem = _create_generic_problem_from_test(test, lab_date, doc_id, "urgent")
                if problem:
                    problems.append(problem)
            
            if len(problems) < 3 and abnormal_tests:
                problem = _create_generic_problem_from_test(abnormal_tests[0], lab_date, doc_id, None)
                if problem:
                    problems.append(problem)
    
    # Add problems from radiology findings (always process, even without labs)
    rad_problems = _build_problems_from_radiology(rad_docs)
    problems.extend(rad_problems)
    
    return problems


def _build_problems_from_radiology(rad_docs: List[Dict]) -> List[Dict]:
    """
    Build problem blocks from radiology findings.
    Extracts significant findings from conclusion/impression and creates structured problems.
    """
    problems = []
    
    if not rad_docs:
        return problems
    
    for rad_doc in rad_docs[:3]:  # Process up to 3 most recent radiology docs
        structured = rad_doc.get("structured", {})
        metadata = rad_doc.get("metadata", {})
        
        # Get key fields
        doc_id = rad_doc.get("document_id", "")
        rad_date = metadata.get("date_of_service") or "unknown"
        exam_type = structured.get("exam_type") or metadata.get("exam_type") or "Imaging"
        conclusion = structured.get("conclusion", "")
        resultats = structured.get("resultats") or structured.get("results", "")
        clinical_context = structured.get("clinical_context") or structured.get("contexte_clinique", "")
        
        # Skip if no meaningful findings
        if not conclusion and not resultats:
            continue
        
        # Detect critical/urgent findings using keywords
        finding_text = f"{conclusion} {resultats}".lower()
        
        # Keywords that indicate urgent/critical findings
        urgent_keywords = [
            "tumoral", "tumorale", "tumor", "tumeur", "mass", "masse",
            "cancer", "malign", "metasta", "carcinoma", "neoplasm",
            "hepatoblastome", "hepatoblastoma", "lymphoma", "sarcoma",
            "suspicious", "suspecte", "highly suggestive",
            "urgent", "critical", "immediate",
            "fracture", "hemorrhage", "hémorragie", "bleeding",
            "obstruction", "perforation", "infarct",
            "embolie", "embolism", "thrombose", "thrombosis"
        ]
        
        # Keywords that indicate significant but non-urgent findings
        significant_keywords = [
            "hépatomégalie", "hepatomegaly", "splenomegaly", "splénomégalie",
            "nodule", "nodular", "lesion", "lésion", "formation",
            "enlarged", "augmenté", "hypertrophy", "hypertrophie",
            "effusion", "épanchement", "ascite", "ascites",
            "calcul", "stone", "lithiase",
            "inflammation", "inflammatoire",
            "abnormal", "anormal", "pathologique"
        ]
        
        is_urgent = any(kw in finding_text for kw in urgent_keywords)
        is_significant = is_urgent or any(kw in finding_text for kw in significant_keywords)
        
        # Skip non-significant findings
        if not is_significant:
            continue
        
        # Extract the main finding for title
        title = _extract_radiology_problem_title(conclusion, resultats, exam_type)
        
        # Build evidence from the radiology report
        evidence = []
        if conclusion:
            evidence.append({
                "label": f"Conclusion: {conclusion[:100]}{'...' if len(conclusion) > 100 else ''}",
                "docId": doc_id,
                "date": rad_date,
                "type": "radiology"
            })
        
        # SEED MODE: No pre-generated assessment/plan for radiology
        
        # Create problem block
        problem = {
            "id": str(uuid.uuid4()),
            "title": title,
            "urgency": "urgent" if is_urgent else None,
            "assessment": None,  # Filled via enrich_assessment
            "evidence": evidence,
            "plan": _empty_plan(),  # Filled via enrich_plan
            "sources": [f"{exam_type} {rad_date}"],
            "syndrome": "imaging_mass" if is_urgent else None,  # For enrichment context
        }
        
        problems.append(problem)
    
    return problems


def _extract_radiology_problem_title(conclusion: str, resultats: str, exam_type: str) -> str:
    """Extract a concise problem title from radiology findings."""
    text = conclusion or resultats
    text_lower = text.lower()
    
    # Common findings to extract as titles
    finding_patterns = [
        ("hepatoblastome", "Hepatic mass — possible hepatoblastoma"),
        ("hepatoblastoma", "Hepatic mass — possible hepatoblastoma"),
        ("hépatomégalie", "Hepatomegaly with mass lesions"),
        ("hepatomegaly", "Hepatomegaly with mass lesions"),
        ("tumoral", "Mass lesion on imaging"),
        ("tumorale", "Mass lesion on imaging"),
        ("tumor", "Mass lesion on imaging"),
        ("tumeur", "Mass lesion on imaging"),
        ("masse", "Mass lesion"),
        ("mass", "Mass lesion"),
        ("nodule", "Nodular lesion"),
        ("metasta", "Metastatic disease"),
        ("fracture", "Fracture"),
        ("pneumonia", "Pneumonia"),
        ("pneumonie", "Pneumonia"),
        ("effusion", "Pleural effusion"),
        ("épanchement", "Effusion"),
        ("ascite", "Ascites"),
        ("ascites", "Ascites"),
        ("obstruction", "Obstruction"),
        ("stone", "Urolithiasis/Cholelithiasis"),
        ("calcul", "Calculus/Stone"),
    ]
    
    for pattern, title in finding_patterns:
        if pattern in text_lower:
            return title
    
    # Default to exam type + abnormality
    return f"Abnormal {exam_type} findings"


def _build_radiology_assessment(conclusion: str, resultats: str, exam_type: str) -> str:
    """Build assessment text from radiology findings."""
    if conclusion:
        # Truncate if too long
        if len(conclusion) > 300:
            return f"{conclusion[:300]}... Requires clinical correlation and possible further workup."
        return f"{conclusion} Requires clinical correlation and possible further workup."
    elif resultats:
        if len(resultats) > 200:
            return f"Imaging findings: {resultats[:200]}... Requires review and correlation."
        return f"Imaging findings: {resultats}. Requires review and correlation."
    return f"{exam_type} shows abnormal findings requiring further evaluation."


def _build_radiology_plan(conclusion: str, resultats: str, exam_type: str, is_urgent: bool) -> Dict:
    """Build structured plan for radiology findings."""
    text_lower = f"{conclusion} {resultats}".lower()
    
    today_items = [
        {"id": str(uuid.uuid4()), "text": "Review imaging findings with patient", "checked": False},
        {"id": str(uuid.uuid4()), "text": "Assess for related symptoms", "checked": False},
    ]
    
    orders_items = []
    treatment_items = []
    follow_up_items = []
    safety_net_items = []
    
    # Add specific recommendations based on findings
    if "irm" in text_lower or "mri" in text_lower or "caractérisation" in text_lower:
        orders_items.append({"id": str(uuid.uuid4()), "text": "Order MRI for further characterization as recommended", "checked": False})
    
    if any(kw in text_lower for kw in ["tumoral", "tumorale", "tumor", "tumeur", "mass", "masse", "hepatoblastome"]):
        orders_items.append({"id": str(uuid.uuid4()), "text": "Tumor markers (AFP, CEA, CA 19-9 as appropriate)", "checked": False})
        orders_items.append({"id": str(uuid.uuid4()), "text": "Consider biopsy if indicated", "checked": False})
        treatment_items.append({"id": str(uuid.uuid4()), "text": "Oncology referral", "checked": False})
        treatment_items.append({"id": str(uuid.uuid4()), "text": "Hepatology/Surgery consultation", "checked": False})
    
    if any(kw in text_lower for kw in ["hépatomégalie", "hepatomegaly", "foie"]):
        orders_items.append({"id": str(uuid.uuid4()), "text": "LFTs (AST, ALT, ALP, bilirubin, albumin)", "checked": False})
        orders_items.append({"id": str(uuid.uuid4()), "text": "Hepatitis panel if not recent", "checked": False})
    
    if is_urgent:
        treatment_items.insert(0, {"id": str(uuid.uuid4()), "text": "Urgent specialist referral", "checked": False})
        follow_up_items.append({"id": str(uuid.uuid4()), "text": "Expedited follow-up within 1 week", "checked": False})
        safety_net_items.append({"id": str(uuid.uuid4()), "text": "Return immediately if worsening pain, jaundice, or new symptoms", "checked": False})
    else:
        follow_up_items.append({"id": str(uuid.uuid4()), "text": "Follow-up after additional workup completed", "checked": False})
        safety_net_items.append({"id": str(uuid.uuid4()), "text": "Return if new or worsening symptoms", "checked": False})
    
    # Ensure at least one item in each bucket
    if not orders_items:
        orders_items.append({"id": str(uuid.uuid4()), "text": "Additional imaging or labs as clinically indicated", "checked": False})
    
    return {
        "today": today_items,
        "orders": orders_items,
        "treatment": treatment_items,
        "follow_up": follow_up_items,
        "safety_net": safety_net_items,
    }


def _create_anemia_problem(test_map: Dict, lab_date: str, doc_id: str, lab_docs: List[Dict]) -> Optional[Dict]:
    """Create anemia problem from multiple test pattern."""
    hgb = test_map.get("hemoglobin")
    if not hgb:
        return None
    
    mcv = test_map.get("mcv")
    ferritin = test_map.get("ferritin")
    rbc = test_map.get("rbc")
    
    hgb_value = _get_test_value(hgb)
    hgb_unit = _get_test_unit(hgb, "g/dL")
    hgb_flag = hgb.get("flag", "")
    hgb_ref = _get_test_ref_range(hgb)
    urgency = "urgent" if hgb_flag in ["critical", "critical_low"] else None
    
    # Build structured evidence with docId for clickable chips
    arrow = _get_arrow_for_flag(hgb_flag, hgb_value, hgb_ref)
    evidence = [{
        "label": f"Hemoglobin {hgb_value} {hgb_unit}{arrow} {_format_ref(hgb_ref)}",
        "docId": doc_id,
        "date": lab_date,
        "type": "lab"
    }]
    
    if rbc:
        rbc_value = _get_test_value(rbc)
        rbc_unit = _get_test_unit(rbc, "M/µL")
        rbc_ref = _get_test_ref_range(rbc)
        rbc_arrow = _get_arrow_for_flag(rbc.get("flag", ""), rbc_value, rbc_ref)
        evidence.append({
            "label": f"RBC {rbc_value} {rbc_unit}{rbc_arrow} {_format_ref(rbc_ref)}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    if mcv:
        mcv_value = _get_test_value(mcv)
        mcv_unit = _get_test_unit(mcv, "fL")
        mcv_ref = _get_test_ref_range(mcv)
        mcv_arrow = _get_arrow_for_flag(mcv.get("flag", ""), mcv_value, mcv_ref)
        evidence.append({
            "label": f"MCV {mcv_value} {mcv_unit}{mcv_arrow} {_format_ref(mcv_ref)}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    if ferritin:
        ferritin_value = _get_test_value(ferritin)
        ferritin_unit = _get_test_unit(ferritin, "ng/mL")
        ferritin_ref = _get_test_ref_range(ferritin)
        ferritin_arrow = _get_arrow_for_flag(ferritin.get("flag", ""), ferritin_value, ferritin_ref)
        evidence.append({
            "label": f"Ferritin {ferritin_value} {ferritin_unit}{ferritin_arrow} {_format_ref(ferritin_ref)}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    # Check trends
    trend = _get_test_trend("hemoglobin", lab_docs)
    if trend:
        evidence.append({
            "label": f"Trend: {trend}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    # SEED MODE: No pre-generated assessment - filled via enrichment
    # SEED MODE: No pre-generated plan - filled via enrichment
    
    return {
        "id": str(uuid.uuid4()),
        "title": "Anemia — severe" if urgency == "urgent" else "Anemia",
        "urgency": urgency,
        "assessment": None,  # Filled via enrich_assessment
        "evidence": evidence,
        "plan": _empty_plan(),  # Filled via enrich_plan
        "sources": [f"CBC {lab_date}"],
        "syndrome": "anemia",  # For enrichment context
    }


def _create_renal_problem(test_map: Dict, lab_date: str, doc_id: str, lab_docs: List[Dict]) -> Optional[Dict]:
    """Create renal dysfunction problem from test pattern."""
    creatinine = test_map.get("creatinine")
    if not creatinine:
        return None
    
    bun = test_map.get("bun")
    egfr = test_map.get("egfr") or test_map.get("gfr")
    
    cr_value = _get_test_value(creatinine)
    cr_unit = _get_test_unit(creatinine, "mg/dL")
    cr_flag = creatinine.get("flag", "")
    cr_ref = _get_test_ref_range(creatinine)
    urgency = "urgent" if cr_flag in ["critical", "critical_high"] else None
    
    cr_arrow = _get_arrow_for_flag(cr_flag, cr_value, cr_ref)
    evidence = [{
        "label": f"Creatinine {cr_value} {cr_unit}{cr_arrow} {_format_ref(cr_ref)}",
        "docId": doc_id,
        "date": lab_date,
        "type": "lab"
    }]
    if bun:
        bun_val = _get_test_value(bun)
        bun_unit = _get_test_unit(bun, "mg/dL")
        bun_ref = _get_test_ref_range(bun)
        bun_arrow = _get_arrow_for_flag(bun.get("flag", ""), bun_val, bun_ref)
        evidence.append({
            "label": f"BUN {bun_val} {bun_unit}{bun_arrow} {_format_ref(bun_ref)}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    if egfr:
        egfr_val = _get_test_value(egfr)
        egfr_unit = _get_test_unit(egfr, "mL/min/1.73m²")
        egfr_arrow = _get_arrow_for_flag(egfr.get("flag", ""), egfr_val, "")
        evidence.append({
            "label": f"eGFR {egfr_val} {egfr_unit}{egfr_arrow}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    trend = _get_test_trend("creatinine", lab_docs)
    if trend:
        evidence.append({
            "label": f"Trend: {trend}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    # SEED MODE: No pre-generated assessment/plan
    
    return {
        "id": str(uuid.uuid4()),
        "title": "Acute kidney injury" if urgency == "urgent" else "Renal dysfunction",
        "urgency": urgency,
        "assessment": None,  # Filled via enrich_assessment
        "evidence": evidence,
        "plan": _empty_plan(),  # Filled via enrich_plan
        "sources": [f"BMP/CMP {lab_date}"],
        "syndrome": "renal_dysfunction",
    }


def _create_diabetes_problem(test_map: Dict, lab_date: str, doc_id: str, lab_docs: List[Dict]) -> Optional[Dict]:
    """Create diabetes/hyperglycemia problem."""
    glucose = test_map.get("glucose")
    if not glucose:
        return None
    
    hba1c = test_map.get("hba1c")
    
    glucose_value = _get_test_value(glucose)
    glucose_unit = _get_test_unit(glucose, "mg/dL")
    glucose_flag = glucose.get("flag", "")
    glucose_ref = _get_test_ref_range(glucose)
    urgency = "urgent" if glucose_flag in ["critical", "critical_high"] else None
    
    glucose_arrow = _get_arrow_for_flag(glucose_flag, glucose_value, glucose_ref)
    evidence = [{
        "label": f"Glucose {glucose_value} {glucose_unit}{glucose_arrow} {_format_ref(glucose_ref)}",
        "docId": doc_id,
        "date": lab_date,
        "type": "lab"
    }]
    if hba1c:
        hba1c_val = _get_test_value(hba1c)
        hba1c_unit = _get_test_unit(hba1c, "%")
        hba1c_flag = hba1c.get("flag", "")
        hba1c_arrow = _get_arrow_for_flag(hba1c_flag, hba1c_val, "")
        evidence.append({
            "label": f"HbA1c {hba1c_val}{hba1c_unit}{hba1c_arrow}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    # SEED MODE: No pre-generated assessment/plan
    
    return {
        "id": str(uuid.uuid4()),
        "title": "Hyperglycemia — uncontrolled diabetes" if urgency == "urgent" else "Hyperglycemia",
        "urgency": urgency,
        "assessment": None,  # Filled via enrich_assessment
        "evidence": evidence,
        "plan": _empty_plan(),  # Filled via enrich_plan
        "sources": [f"Labs {lab_date}"],
        "syndrome": "hyperglycemia",
    }


def _create_wbc_problem(test_map: Dict, lab_date: str, doc_id: str, lab_docs: List[Dict], is_high: bool) -> Optional[Dict]:
    """Create WBC abnormality problem (leukocytosis or leukopenia)."""
    wbc = test_map.get("wbc")
    if not wbc:
        return None
    
    wbc_value = _get_test_value(wbc)
    wbc_unit = _get_test_unit(wbc, "K/µL")
    wbc_flag = wbc.get("flag", "")
    wbc_ref = _get_test_ref_range(wbc)
    urgency = "urgent" if "critical" in wbc_flag else None
    
    arrow = _get_arrow_for_flag(wbc_flag, wbc_value, wbc_ref)
    evidence = [{
        "label": f"WBC {wbc_value} {wbc_unit}{arrow} {_format_ref(wbc_ref)}",
        "docId": doc_id,
        "date": lab_date,
        "type": "lab"
    }]
    
    # Add differential if available
    neutrophils = test_map.get("neutrophils") or test_map.get("neutrophiles")
    lymphocytes = test_map.get("lymphocytes")
    if neutrophils:
        neut_value = _get_test_value(neutrophils)
        neut_unit = _get_test_unit(neutrophils, "%")
        evidence.append({
            "label": f"Neutrophils {neut_value} {neut_unit}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    if lymphocytes:
        lymph_value = _get_test_value(lymphocytes)
        lymph_unit = _get_test_unit(lymphocytes, "%")
        evidence.append({
            "label": f"Lymphocytes {lymph_value} {lymph_unit}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    # Add trend
    trend = _get_test_trend("wbc", lab_docs)
    if trend:
        evidence.append({
            "label": f"Trend: {trend}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    # SEED MODE: Title only, no pre-generated assessment/plan
    if is_high:
        title = "Leukocytosis — marked" if urgency else "Leukocytosis"
        syndrome = "leukocytosis"
    else:
        title = "Leukopenia — severe" if urgency else "Leukopenia"
        syndrome = "leukopenia"
    
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "urgency": urgency,
        "assessment": None,  # Filled via enrich_assessment
        "evidence": evidence,
        "plan": _empty_plan(),  # Filled via enrich_plan
        "sources": [f"CBC {lab_date}"],
        "syndrome": syndrome,
    }


def _create_liver_problem(test_map: Dict, lab_date: str, doc_id: str, lab_docs: List[Dict]) -> Optional[Dict]:
    """Create liver dysfunction problem."""
    alt = test_map.get("alt") or test_map.get("sgpt")
    ast = test_map.get("ast") or test_map.get("sgot")
    bilirubin = test_map.get("bilirubin")
    alp = test_map.get("alp")
    ggt = test_map.get("ggt")
    
    if not alt and not ast and not bilirubin:
        return None
    
    evidence = []
    is_critical = False
    
    if alt:
        alt_value = _get_test_value(alt)
        alt_unit = _get_test_unit(alt, "U/L")
        alt_ref = _get_test_ref_range(alt)
        alt_flag = alt.get("flag", "")
        alt_arrow = _get_arrow_for_flag(alt_flag, alt_value, alt_ref)
        if "critical" in alt_flag:
            is_critical = True
        evidence.append({
            "label": f"ALT {alt_value} {alt_unit}{alt_arrow} {_format_ref(alt_ref)}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    if ast:
        ast_value = _get_test_value(ast)
        ast_unit = _get_test_unit(ast, "U/L")
        ast_ref = _get_test_ref_range(ast)
        ast_flag = ast.get("flag", "")
        ast_arrow = _get_arrow_for_flag(ast_flag, ast_value, ast_ref)
        if "critical" in ast_flag:
            is_critical = True
        evidence.append({
            "label": f"AST {ast_value} {ast_unit}{ast_arrow} {_format_ref(ast_ref)}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    if bilirubin:
        bili_value = _get_test_value(bilirubin)
        bili_unit = _get_test_unit(bilirubin, "mg/dL")
        bili_ref = _get_test_ref_range(bilirubin)
        bili_flag = bilirubin.get("flag", "")
        bili_arrow = _get_arrow_for_flag(bili_flag, bili_value, bili_ref)
        if "critical" in bili_flag:
            is_critical = True
        evidence.append({
            "label": f"Bilirubin {bili_value} {bili_unit}{bili_arrow} {_format_ref(bili_ref)}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    if alp:
        alp_value = _get_test_value(alp)
        alp_unit = _get_test_unit(alp, "U/L")
        alp_ref = _get_test_ref_range(alp)
        alp_arrow = _get_arrow_for_flag(alp.get("flag", ""), alp_value, alp_ref)
        evidence.append({
            "label": f"ALP {alp_value} {alp_unit}{alp_arrow} {_format_ref(alp_ref)}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    urgency = "urgent" if is_critical else None
    
    # SEED MODE: No pre-generated assessment/plan
    
    return {
        "id": str(uuid.uuid4()),
        "title": "Acute liver injury" if urgency else "Liver function abnormality",
        "urgency": urgency,
        "assessment": None,  # Filled via enrich_assessment
        "evidence": evidence,
        "plan": _empty_plan(),  # Filled via enrich_plan
        "sources": [f"LFTs {lab_date}"],
        "syndrome": "liver_dysfunction",
    }


def _create_electrolyte_problem(test_map: Dict, lab_date: str, doc_id: str, lab_docs: List[Dict], syndrome_name: str) -> Optional[Dict]:
    """Create electrolyte abnormality problem (hyper/hypokalemia, etc.)."""
    potassium = test_map.get("potassium")
    sodium = test_map.get("sodium")
    
    evidence = []
    urgency = None
    
    if potassium:
        k_value = _get_test_value(potassium)
        k_unit = _get_test_unit(potassium, "mEq/L")
        k_ref = _get_test_ref_range(potassium)
        k_flag = potassium.get("flag", "")
        k_arrow = _get_arrow_for_flag(k_flag, k_value, k_ref)
        if "critical" in k_flag:
            urgency = "urgent"
        evidence.append({
            "label": f"Potassium {k_value} {k_unit}{k_arrow} {_format_ref(k_ref)}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    if sodium:
        na_value = _get_test_value(sodium)
        na_unit = _get_test_unit(sodium, "mEq/L")
        na_ref = _get_test_ref_range(sodium)
        na_flag = sodium.get("flag", "")
        na_arrow = _get_arrow_for_flag(na_flag, na_value, na_ref)
        evidence.append({
            "label": f"Sodium {na_value} {na_unit}{na_arrow} {_format_ref(na_ref)}",
            "docId": doc_id,
            "date": lab_date,
            "type": "lab"
        })
    
    if not evidence:
        return None
    
    is_hyperkalemia = syndrome_name == "hyperkalemia"
    
    # SEED MODE: Title only, no pre-generated assessment/plan
    if is_hyperkalemia:
        title = "Hyperkalemia — critical" if urgency else "Hyperkalemia"
    else:
        title = "Hypokalemia — critical" if urgency else "Hypokalemia"
    
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "urgency": urgency,
        "assessment": None,  # Filled via enrich_assessment
        "evidence": evidence,
        "plan": _empty_plan(),  # Filled via enrich_plan
        "sources": [f"BMP {lab_date}"],
        "syndrome": syndrome_name,
    }


def _create_generic_problem_from_test(test: Dict, lab_date: str, doc_id: str, urgency: Optional[str]) -> Optional[Dict]:
    """Create a problem block from any lab test with abnormal values."""
    # Get test name from either field
    name = test.get("name", "") or test.get("test_name", "") or "Unknown"
    value = _get_test_value(test)
    unit = _get_test_unit(test, "")
    flag = test.get("flag", "")
    ref_str = _get_test_ref_range(test)
    
    # Normalize and determine problem title based on test name
    normalized_name = _normalize_test_name(name)
    title = name  # Default to original name
    
    # Map common tests to clinical problem titles
    title_map = {
        "hemoglobin": "Anemia",
        "wbc": "WBC abnormality",
        "platelets": "Platelet abnormality",
        "glucose": "Hyperglycemia" if flag in ["high", "critical_high"] else "Hypoglycemia",
        "creatinine": "Kidney function abnormality",
        "bun": "Kidney function abnormality",
        "alt": "Liver enzyme elevation",
        "ast": "Liver enzyme elevation",
        "bilirubin": "Hyperbilirubinemia",
        "sodium": "Sodium abnormality",
        "potassium": "Potassium abnormality",
    }
    
    if normalized_name in title_map:
        title = title_map[normalized_name]
    
    # Add severity qualifier for critical values
    if urgency == "urgent":
        title = f"{title} — critical"
    
    # Build structured evidence with docId for clickable chips
    arrow = _get_arrow_for_flag(flag, value, ref_str)
    evidence = [{
        "label": f"{name} {value} {unit}{arrow} {_format_ref(ref_str)}".strip(),
        "docId": doc_id,
        "date": lab_date,
        "type": "lab"
    }]
    
    # SEED MODE: No pre-generated assessment/plan
    
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "urgency": urgency,
        "assessment": None,  # Filled via enrich_assessment
        "evidence": evidence,
        "plan": _empty_plan(),  # Filled via enrich_plan
        "sources": [f"Labs {lab_date}"],
        "syndrome": None,  # Unknown syndrome for generic problems
    }


def _get_test_trend(test_name: str, lab_docs: List[Dict]) -> Optional[str]:
    """Get trend for a specific test across multiple labs."""
    values = []
    normalized_search = _normalize_test_name(test_name)
    
    for doc in lab_docs[:3]:
        tests = (doc.get("structured") or {}).get("tests", [])
        for test in tests:
            # Check both name fields
            raw_name = test.get("name", "") or test.get("test_name", "")
            normalized = _normalize_test_name(raw_name)
            
            if normalized == normalized_search or raw_name.lower() == test_name.lower():
                val_str = _get_test_value(test)
                try:
                    val = float(val_str.split()[0])
                    values.append(val)
                except (ValueError, IndexError):
                    pass
                break
    
    if len(values) >= 2:
        # values[0] is most recent, values[1] is previous
        if values[0] < values[1]:
            return f"{values[-1]}→{values[0]} (improving)"
        elif values[0] > values[1]:
            return f"{values[-1]}→{values[0]} (worsening)"
        else:
            return f"{values[0]} (stable)"
    return None
