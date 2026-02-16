from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from medicai.storage.postgres import get_conn


def _parse_date(since: Optional[str]) -> Optional[date]:
    if not since:
        return None
    return datetime.fromisoformat(since).date()


def get_abnormal_labs_sql(patient_id: str, since: Optional[str] = None) -> List[Dict[str, Any]]:
    since_date = _parse_date(since)

    with get_conn() as conn:
        with conn.cursor() as cur:
            if since_date:
                cur.execute(
                    """
                    select doc_id, date_of_service, panel_name, test_name, value, unit, ref_low, ref_high, flag, source_text
                    from lab_results
                    where patient_id = %s
                      and flag in ('low','high')
                      and date_of_service >= %s
                    order by date_of_service desc nulls last
                    """,
                    (patient_id, since_date),
                )
            else:
                cur.execute(
                    """
                    select doc_id, date_of_service, panel_name, test_name, value, unit, ref_low, ref_high, flag, source_text
                    from lab_results
                    where patient_id = %s
                      and flag in ('low','high')
                    order by date_of_service desc nulls last
                    """,
                    (patient_id,),
                )

            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_lab_trend_sql(patient_id: str, test_name: str, since: Optional[str] = None) -> Dict[str, Any]:
    since_date = _parse_date(since)
    norm = test_name.strip().lower().replace(" ", "_")

    with get_conn() as conn:
        with conn.cursor() as cur:
            if since_date:
                cur.execute(
                    """
                    select date_of_service, value, unit, ref_low, ref_high, flag, doc_id, panel_name, test_name
                    from lab_results
                    where patient_id = %s
                      and replace(lower(test_name),' ','_') = %s
                      and date_of_service >= %s
                    order by date_of_service asc nulls last
                    """,
                    (patient_id, norm, since_date),
                )
            else:
                cur.execute(
                    """
                    select date_of_service, value, unit, ref_low, ref_high, flag, doc_id, panel_name, test_name
                    from lab_results
                    where patient_id = %s
                      and replace(lower(test_name),' ','_') = %s
                    order by date_of_service asc nulls last
                    """,
                    (patient_id, norm),
                )

            cols = [d.name for d in cur.description]
            points = [dict(zip(cols, row)) for row in cur.fetchall()]

    return {"patient_id": patient_id, "test_name": test_name, "points": points}


def get_radiology_conclusions_sql(patient_id: str, since: Optional[str] = None) -> List[Dict[str, Any]]:
    since_date = _parse_date(since)

    with get_conn() as conn:
        with conn.cursor() as cur:
            if since_date:
                cur.execute(
                    """
                    select doc_id, date_of_service, exam_type, contexte_clinique, resultats, conclusion
                    from radiology_reports
                    where patient_id = %s
                      and date_of_service >= %s
                    order by date_of_service desc nulls last
                    """,
                    (patient_id, since_date),
                )
            else:
                cur.execute(
                    """
                    select doc_id, date_of_service, exam_type, contexte_clinique, resultats, conclusion
                    from radiology_reports
                    where patient_id = %s
                    order by date_of_service desc nulls last
                    """,
                    (patient_id,),
                )

            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
        

def get_patient_snapshot_sql(patient_id: str) -> Dict[str, Any]:
    """
    High-level snapshot for a patient: latest lab panel + latest radiology report + current medications.
    Mirrors the output shape of patient_tools.get_patient_snapshot().
    """
    snapshot: Dict[str, Any] = {
        "patient_id": patient_id,
        "latest_lab": None,
        "latest_radiology": None,
        "active_problems": [],
        "current_medications": [],
        "allergies": [],
    }

    with get_conn() as conn:
        # ---- Latest lab doc_id by date
        with conn.cursor() as cur:
            cur.execute(
                """
                select doc_id, date_of_service
                from documents
                where patient_id = %s and document_type = 'lab' and date_of_service is not null
                order by date_of_service desc
                limit 1
                """,
                (patient_id,),
            )
            row = cur.fetchone()

        if row:
            lab_doc_id, lab_date = row

            with conn.cursor() as cur:
                cur.execute(
                    """
                    select panel_name, test_name, value, unit, ref_low, ref_high, flag
                    from lab_results
                    where patient_id = %s and doc_id = %s
                    order by lower(test_name) asc
                    """,
                    (patient_id, lab_doc_id),
                )
                lab_rows = cur.fetchall()
                cols = [d.name for d in cur.description]
                tests = [dict(zip(cols, r)) for r in lab_rows]

            panel_name = None
            if tests:
                panel_name = tests[0].get("panel_name")

            snapshot["latest_lab"] = {
                "doc_id": lab_doc_id,
                "date_of_service": lab_date.isoformat() if lab_date else None,
                "panel_name": panel_name,
                "tests": [
                    {
                        "name": t.get("test_name"),
                        "value": t.get("value"),
                        "unit": t.get("unit"),
                        "ref_low": t.get("ref_low"),
                        "ref_high": t.get("ref_high"),
                        "flag": t.get("flag"),
                    }
                    for t in tests
                ],
            }

        # ---- Latest radiology
        with conn.cursor() as cur:
            cur.execute(
                """
                select doc_id, date_of_service, exam_type, conclusion
                from radiology_reports
                where patient_id = %s and date_of_service is not null
                order by date_of_service desc
                limit 1
                """,
                (patient_id,),
            )
            rad = cur.fetchone()

        if rad:
            doc_id, ds, exam_type, conclusion = rad
            snapshot["latest_radiology"] = {
                "doc_id": doc_id,
                "date_of_service": ds.isoformat() if ds else None,
                "type_examen": exam_type,
                "conclusion": conclusion,
            }

        # ---- Current medications from latest prescription
        with conn.cursor() as cur:
            cur.execute(
                """
                select drug_name, dose, frequency, form, duration
                from prescription_items
                where patient_id = %s
                order by date_of_service desc nulls last
                limit 10
                """,
                (patient_id,),
            )
            meds = cur.fetchall()
            snapshot["current_medications"] = [
                {
                    "name": m[0],
                    "dose": m[1] or "",
                    "frequency": m[2] or "",
                    "form": m[3] or "",
                    "duration": m[4] or "",
                }
                for m in meds
            ]

    return snapshot


def get_current_meds_sql(patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Get current medications for a patient from prescription_items table.
    Returns latest prescription items ordered by date_of_service desc.
    
    Arguments:
        patient_id: patient identifier
        limit: maximum number of items to return (default 50)
    
    Returns:
        List of medication dictionaries with all prescription item fields
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select 
                    doc_id, patient_id, date_of_service,
                    prescriber_name, prescriber_specialty,
                    drug_name, strength_or_concentration, form, route,
                    dose, frequency, duration, quantity, instructions,
                    as_written, confidence
                from prescription_items
                where patient_id = %s
                order by date_of_service desc nulls last
                limit %s
                """,
                (patient_id, limit),
            )

            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
