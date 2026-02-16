from __future__ import annotations

import json
from typing import Iterable, Optional

from medicai.storage.file_store import FileStore
from medicai.schemas import AnyDocument, LabDocument, RadiologyDocument, PrescriptionDocument
from medicai.storage.postgres import get_conn


store = FileStore()


def upsert_document(conn, doc: AnyDocument) -> None:
    payload = doc.model_dump(mode="json")

    date_of_service = None
    try:
        date_of_service = doc.metadata.date_of_service
    except Exception:
        date_of_service = None

    source = payload.get("source") or {}
    conn.execute(
        """
        insert into documents (
          doc_id, patient_id, document_type, date_of_service,
          source_file_path, source_file_type, processed_at, model_used,
          payload
        )
        values (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
        on conflict (doc_id) do update set
          patient_id = excluded.patient_id,
          document_type = excluded.document_type,
          date_of_service = excluded.date_of_service,
          source_file_path = excluded.source_file_path,
          source_file_type = excluded.source_file_type,
          processed_at = excluded.processed_at,
          model_used = excluded.model_used,
          payload = excluded.payload
        """,
        (
            doc.doc_id,
            doc.patient_id,
            doc.document_type,
            date_of_service,
            source.get("file_path"),
            source.get("file_type"),
            source.get("processed_at"),
            source.get("model_used"),
            json.dumps(payload, ensure_ascii=False),
        ),
    )


def _resolve_clinic_id(conn, doc_id: str, patient_id: str) -> Optional[str]:
    """Resolve clinic_id from the documents table or patients table."""
    with conn.cursor() as cur:
        cur.execute("SELECT clinic_id FROM documents WHERE doc_id = %s", (doc_id,))
        row = cur.fetchone()
        if row and row[0]:
            return str(row[0])
        # Fallback: from patients
        cur.execute("SELECT clinic_id FROM patients WHERE patient_id = %s", (patient_id,))
        row = cur.fetchone()
        if row and row[0]:
            return str(row[0])
    return None


def index_lab(conn, doc: LabDocument) -> None:
    # simplest + safest: wipe lab rows for doc_id, then insert fresh
    conn.execute("delete from lab_results where doc_id = %s", (doc.doc_id,))

    date_of_service = doc.metadata.date_of_service
    panel_name = doc.structured.panel_name

    clinic_id = _resolve_clinic_id(conn, doc.doc_id, doc.patient_id)

    rows = []
    for t in doc.structured.tests:
        rows.append(
            (
                doc.doc_id,
                doc.patient_id,
                clinic_id,
                date_of_service,
                panel_name,
                t.name,
                t.value,
                t.unit,
                t.ref_low,
                t.ref_high,
                t.flag,
                t.source_text,
            )
        )

    if not rows:
        return

    with conn.cursor() as cur:
        cur.executemany(
            """
            insert into lab_results (
              doc_id, patient_id, clinic_id, date_of_service, panel_name,
              test_name, value, unit, ref_low, ref_high, flag, source_text
            )
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
        )


def index_radiology(conn, doc: RadiologyDocument) -> None:
    md = doc.metadata
    st = doc.structured

    clinic_id = _resolve_clinic_id(conn, doc.doc_id, doc.patient_id)

    conn.execute(
        """
        insert into radiology_reports (
          doc_id, patient_id, clinic_id, date_of_service, exam_type,
          contexte_clinique, technique_examen, resultats, conclusion
        )
        values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        on conflict (doc_id) do update set
          patient_id = excluded.patient_id,
          clinic_id = excluded.clinic_id,
          date_of_service = excluded.date_of_service,
          exam_type = excluded.exam_type,
          contexte_clinique = excluded.contexte_clinique,
          technique_examen = excluded.technique_examen,
          resultats = excluded.resultats,
          conclusion = excluded.conclusion
        """,
        (
            doc.doc_id,
            doc.patient_id,
            clinic_id,
            md.date_of_service,
            md.type_examen,
            st.contexte_clinique,
            st.technique_examen,
            st.resultats,
            st.conclusion,
        ),
    )


def index_prescription(conn, doc: PrescriptionDocument) -> None:
    # Wipe existing prescription items for doc_id, then insert fresh
    conn.execute("delete from prescription_items where doc_id = %s", (doc.doc_id,))

    date_of_service = doc.metadata.date_of_service
    prescriber_name = doc.metadata.prescriber_full_name
    prescriber_specialty = doc.metadata.prescriber_specialty

    clinic_id = _resolve_clinic_id(conn, doc.doc_id, doc.patient_id)

    rows = []
    for item in doc.structured.items:
        rows.append(
            (
                doc.doc_id,
                doc.patient_id,
                clinic_id,
                date_of_service,
                prescriber_name,
                prescriber_specialty,
                item.drug_name,
                item.strength_or_concentration,
                item.form,
                item.route,
                item.dose,
                item.frequency,
                item.duration,
                item.quantity,
                item.instructions,
                item.as_written,
                item.confidence,
            )
        )

    if not rows:
        return

    with conn.cursor() as cur:
        cur.executemany(
            """
            insert into prescription_items (
              doc_id, patient_id, clinic_id, date_of_service,
              prescriber_name, prescriber_specialty,
              drug_name, strength_or_concentration, form, route,
              dose, frequency, duration, quantity, instructions,
              as_written, confidence
            )
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
        )


def index_document(doc: AnyDocument) -> None:
    with get_conn() as conn:
        with conn.transaction():
            upsert_document(conn, doc)

            if isinstance(doc, LabDocument):
                index_lab(conn, doc)
            elif isinstance(doc, RadiologyDocument):
                index_radiology(conn, doc)
            elif isinstance(doc, PrescriptionDocument):
                index_prescription(conn, doc)
            # else: ignore for now (clinical_note/other later)


def index_patient(patient_id: str) -> int:
    docs = store.load_by_patient(patient_id)
    for d in docs:
        index_document(d)
    return len(docs)
