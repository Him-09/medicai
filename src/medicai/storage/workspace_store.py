"""
Workspace storage - persists consultation workspace state.
"""
from typing import Optional, Dict, Any, Union
import json
from datetime import datetime
from medicai.storage.postgres import get_conn


def init_workspace_table() -> None:
    """Create workspace table if it doesn't exist."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                create table if not exists consultation_workspace (
                    consultation_id text primary key,
                    patient_id text not null,
                    visit_focus text,
                    agenda jsonb,
                    hpi jsonb,
                    problems jsonb,
                    quick_notes jsonb,
                    orders jsonb,
                    created_at timestamp default now(),
                    updated_at timestamp default now()
                );
                
                create index if not exists idx_workspace_patient_id 
                on consultation_workspace(patient_id);
                
                create index if not exists idx_workspace_updated_at 
                on consultation_workspace(updated_at desc);
                """
            )
        conn.commit()


def save_workspace(
    *,
    consultation_id: str,
    patient_id: str,
    clinic_id: Optional[str] = None,
    visit_focus: Optional[str] = None,
    agenda: Optional[list] = None,
    hpi: Optional[Dict[str, Any]] = None,
    problems: Optional[list] = None,
    quick_notes: Optional[list] = None,
    orders: Optional[Union[list, dict]] = None,  # Can be list (old) or dict (new WorkspaceOrders)
) -> Dict[str, Any]:
    """
    Save or update workspace state for consultation.
    Uses upsert to create or update.
    clinic_id is resolved from the consultation if not provided.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Resolve clinic_id from consultation if not explicitly provided
            if not clinic_id:
                cur.execute(
                    "SELECT clinic_id FROM consultations WHERE id = %s",
                    (consultation_id,),
                )
                row = cur.fetchone()
                clinic_id = str(row[0]) if row and row[0] else None

            cur.execute(
                """
                insert into consultation_workspace (
                    consultation_id, patient_id, clinic_id, visit_focus, agenda, hpi, problems, quick_notes, orders, updated_at
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                on conflict (consultation_id)
                do update set
                    visit_focus = excluded.visit_focus,
                    agenda = excluded.agenda,
                    hpi = excluded.hpi,
                    problems = excluded.problems,
                    quick_notes = excluded.quick_notes,
                    orders = excluded.orders,
                    updated_at = now()
                returning consultation_id, patient_id, visit_focus, agenda, hpi, problems, quick_notes, orders, created_at, updated_at
                """,
                (
                    consultation_id,
                    patient_id,
                    clinic_id,
                    visit_focus,
                    json.dumps(agenda) if agenda else None,
                    json.dumps(hpi) if hpi else None,
                    json.dumps(problems) if problems else None,
                    json.dumps(quick_notes) if quick_notes else None,
                    json.dumps(orders) if orders else None,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    
    if not row:
        raise RuntimeError("Failed to save workspace")
    
    return {
        "consultation_id": row[0],
        "patient_id": row[1],
        "visit_focus": row[2],
        "agenda": row[3],
        "hpi": row[4],
        "problems": row[5],
        "quick_notes": row[6],
        "orders": row[7],
        "created_at": row[8].isoformat() if row[8] else None,
        "updated_at": row[9].isoformat() if row[9] else None,
    }


def get_workspace(consultation_id: str) -> Optional[Dict[str, Any]]:
    """Get workspace state for consultation."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select consultation_id, patient_id, visit_focus, agenda, hpi, problems, quick_notes, orders, created_at, updated_at
                from consultation_workspace
                where consultation_id = %s
                """,
                (consultation_id,),
            )
            row = cur.fetchone()
    
    if not row:
        return None
    
    return {
        "consultation_id": row[0],
        "patient_id": row[1],
        "visit_focus": row[2],
        "agenda": row[3],
        "hpi": row[4],
        "problems": row[5],
        "quick_notes": row[6],
        "orders": row[7],
        "created_at": row[8].isoformat() if row[8] else None,
        "updated_at": row[9].isoformat() if row[9] else None,
    }


def delete_workspace(consultation_id: str) -> bool:
    """Delete workspace for consultation."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "delete from consultation_workspace where consultation_id = %s",
                (consultation_id,),
            )
            deleted = cur.rowcount > 0
        conn.commit()
    
    return deleted
