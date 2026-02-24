from __future__ import annotations
from typing import Optional, List, Dict
from datetime import datetime
from medicai.storage.postgres import get_conn
from medicai.storage.maintenance import unarchive_patient

def init_consultations_table() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                create table if not exists consultations (
                    consultation_id text primary key,
                    patient_id text not null,
                    name text,
                    consultation_time timestamp not null,
                    status text default 'active',
                    created_at timestamp default now(),
                    updated_at timestamp default now()
                );
                
                create index if not exists idx_consultations_patient_id 
                on consultations(patient_id);
                
                create index if not exists idx_consultations_consultation_time 
                on consultations(consultation_time desc);
                """
            )
        conn.commit()

def create_consultation(
    *,
    consultation_id: str,
    patient_id: str,
    consultation_time: datetime,
    name: Optional[str] = None,
    status: str = "active",
) -> Dict:
    unarchive_patient(patient_id)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into consultations (consultation_id, patient_id, name, consultation_time, status)
                values (%s, %s, %s, %s, %s)
                returning consultation_id, patient_id, name, consultation_time, status, created_at
                """,
                (consultation_id, patient_id, name, consultation_time, status),
            )
            row = cur.fetchone()
        conn.commit()
    
    if not row:
        raise RuntimeError("Failed to create consultation")
    
    return {
        "consultation_id": row[0],
        "patient_id": row[1],
        "name": row[2],
        "consultation_time": row[3],
        "status": row[4],
        "created_at": row[5],
    }

def get_consultation(consultation_id: str) -> Optional[Dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select consultation_id, patient_id, name, consultation_time, status, created_at, updated_at
                from consultations
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
        "name": row[2],
        "consultation_time": row[3],
        "status": row[4],
        "created_at": row[5],
        "updated_at": row[6],
    }

def list_consultations(
    *,
    patient_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
) -> List[Dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                select consultation_id, patient_id, name, consultation_time, status, created_at
                from consultations
                where 1=1
            """
            params = []
            
            if patient_id:
                query += " and patient_id = %s"
                params.append(patient_id)
            
            if status:
                query += " and status = %s"
                params.append(status)
            
            query += " order by consultation_time desc limit %s"
            params.append(limit)
            
            cur.execute(query, params)
            rows = cur.fetchall()
    
    return [
        {
            "consultation_id": r[0],
            "patient_id": r[1],
            "name": r[2],
            "consultation_time": r[3],
            "status": r[4],
            "created_at": r[5],
        }
        for r in rows
    ]

def update_consultation_status(consultation_id: str, status: str) -> bool:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                update consultations
                set status = %s, updated_at = now()
                where consultation_id = %s
                """,
                (status, consultation_id),
            )
            affected = cur.rowcount
        conn.commit()
    
    return affected > 0

def update_consultation(
    consultation_id: str,
    *,
    name: Optional[str] = None,
    status: Optional[str] = None,
    consultation_time: Optional[datetime] = None,
) -> Optional[Dict]:
    updates = []
    params = []
    
    if name is not None:
        updates.append("name = %s")
        params.append(name)
    
    if status is not None:
        updates.append("status = %s")
        params.append(status)
    
    if consultation_time is not None:
        updates.append("consultation_time = %s")
        params.append(consultation_time)
    
    if not updates:
        return get_consultation(consultation_id)
    
    updates.append("updated_at = now()")
    params.append(consultation_id)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                update consultations
                set {', '.join(updates)}
                where consultation_id = %s
                returning consultation_id, patient_id, name, consultation_time, status, created_at, updated_at
                """,
                params,
            )
            row = cur.fetchone()
        conn.commit()
    
    if not row:
        return None
    
    return {
        "consultation_id": row[0],
        "patient_id": row[1],
        "name": row[2],
        "consultation_time": row[3],
        "status": row[4],
        "created_at": row[5],
        "updated_at": row[6],
    }

def delete_consultation(consultation_id: str) -> bool:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                update consultations
                set status = 'canceled', updated_at = now()
                where consultation_id = %s
                """,
                (consultation_id,),
            )
            affected = cur.rowcount
        conn.commit()
    
    return affected > 0
