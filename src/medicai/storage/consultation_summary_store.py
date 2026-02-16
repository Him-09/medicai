from __future__ import annotations
from typing import Optional, List, Dict
from medicai.storage.postgres import get_conn


def upsert_summary(
    *,
    consultation_id: str,
    patient_id: str,
    summary: str,
    source: str = "ai",
    version: int = 1,
) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into consultation_summaries
                  (consultation_id, patient_id, summary, source, version)
                values (%s,%s,%s,%s,%s)
                on conflict (consultation_id)
                do update set
                  summary = excluded.summary,
                  source = excluded.source,
                  version = excluded.version,
                  updated_at = now()
                """,
                (consultation_id, patient_id, summary, source, version),
            )
        conn.commit()


def get_summary(consultation_id: str) -> Optional[Dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select consultation_id, patient_id, summary, version, created_at
                from consultation_summaries
                where consultation_id = %s
                """,
                (consultation_id,),
            )
            row = cur.fetchone()

    if not row:
        return None

    cols = ["consultation_id", "patient_id", "summary", "version", "created_at"]
    return dict(zip(cols, row))


def list_patient_summaries(patient_id: str) -> List[Dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select consultation_id, summary, created_at
                from consultation_summaries
                where patient_id = %s
                order by created_at desc
                """,
                (patient_id,),
            )
            rows = cur.fetchall()

    return [
        {
            "consultation_id": r[0],
            "summary": r[1],
            "created_at": r[2],
        }
        for r in rows
    ]
