from __future__ import annotations
from typing import Optional, List, Dict
from datetime import datetime
from medicai.storage.postgres import get_conn

def init_patients_table() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                create table if not exists patients (
                    patient_id text primary key,
                    name text not null,
                    dob text not null,
                    sex text,
                    email text,
                    phone text,
                    address text,
                    medical_history text,
                    allergies text[],
                    active_problems text[],
                    status text default 'active',
                    archived_at timestamp,
                    created_at timestamp default now(),
                    updated_at timestamp default now()
                );
                
                create index if not exists idx_patients_name 
                on patients(name);
                
                create index if not exists idx_patients_status 
                on patients(status);
                """
            )
            cur.execute(
                """
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                   WHERE table_name='patients' AND column_name='sex') 
                    THEN 
                        ALTER TABLE patients ADD COLUMN sex text;
                    END IF; 
                END $$;
                """
            )
        conn.commit()

def create_patient(
    *,
    patient_id: str,
    name: str,
    dob: str,
    sex: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    address: Optional[str] = None,
    medical_history: Optional[str] = None,
    allergies: Optional[List[str]] = None,
    active_problems: Optional[List[str]] = None,
    status: str = "active",
) -> Dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into patients (patient_id, name, dob, sex, email, phone, address, medical_history, allergies, active_problems, status)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                returning patient_id, name, dob, sex, email, phone, address, medical_history, allergies, active_problems, status, created_at
                """,
                (patient_id, name, dob, sex, email, phone, address, medical_history, allergies or [], active_problems or [], status),
            )
            row = cur.fetchone()
        conn.commit()
    
    if not row:
        raise RuntimeError("Failed to create patient")
    
    return {
        "patient_id": row[0],
        "name": row[1],
        "dob": row[2],
        "sex": row[3],
        "email": row[4],
        "phone": row[5],
        "address": row[6],
        "medical_history": row[7],
        "allergies": row[8] or [],
        "active_problems": row[9] or [],
        "status": row[10],
        "created_at": row[11],
    }

def get_patient(patient_id: str) -> Optional[Dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select patient_id, name, dob, sex, email, phone, address, medical_history, allergies, active_problems, status, archived_at, created_at, updated_at
                from patients
                where patient_id = %s
                """,
                (patient_id,),
            )
            row = cur.fetchone()
    
    if not row:
        return None
    
    return {
        "patient_id": row[0],
        "name": row[1],
        "dob": row[2],
        "sex": row[3],
        "email": row[4],
        "phone": row[5],
        "address": row[6],
        "medical_history": row[7],
        "allergies": row[8] or [],
        "active_problems": row[9] or [],
        "status": row[10],
        "archived_at": row[11],
        "created_at": row[12],
        "updated_at": row[13],
    }

def get_all_patients(status: Optional[str] = None) -> List[Dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            if status:
                cur.execute(
                    """
                    select patient_id, name, dob, sex, email, phone, address, medical_history, allergies, active_problems, status, archived_at, created_at, updated_at
                    from patients
                    where status = %s
                    order by created_at desc
                    """,
                    (status,),
                )
            else:
                cur.execute(
                    """
                    select patient_id, name, dob, sex, email, phone, address, medical_history, allergies, active_problems, status, archived_at, created_at, updated_at
                    from patients
                    order by created_at desc
                    """
                )
            rows = cur.fetchall()
    
    return [
        {
            "patient_id": row[0],
            "name": row[1],
            "dob": row[2],
            "sex": row[3],
            "email": row[4],
            "phone": row[5],
            "address": row[6],
            "medical_history": row[7],
            "allergies": row[8] or [],
            "active_problems": row[9] or [],
            "status": row[10],
            "archived_at": row[11],
            "created_at": row[12],
            "updated_at": row[13],
        }
        for row in rows
    ]

def update_patient(
    patient_id: str,
    *,
    name: Optional[str] = None,
    dob: Optional[str] = None,
    sex: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    address: Optional[str] = None,
    medical_history: Optional[str] = None,
    allergies: Optional[List[str]] = None,
    active_problems: Optional[List[str]] = None,
    status: Optional[str] = None,
) -> Optional[Dict]:
    updates = []
    params = []
    
    if name is not None:
        updates.append("name = %s")
        params.append(name)
    if dob is not None:
        updates.append("dob = %s")
        params.append(dob)
    if sex is not None:
        updates.append("sex = %s")
        params.append(sex)
    if email is not None:
        updates.append("email = %s")
        params.append(email)
    if phone is not None:
        updates.append("phone = %s")
        params.append(phone)
    if address is not None:
        updates.append("address = %s")
        params.append(address)
    if medical_history is not None:
        updates.append("medical_history = %s")
        params.append(medical_history)
    if allergies is not None:
        updates.append("allergies = %s")
        params.append(allergies)
    if active_problems is not None:
        updates.append("active_problems = %s")
        params.append(active_problems)
    if status is not None:
        updates.append("status = %s")
        params.append(status)
    
    if not updates:
        return get_patient(patient_id)
    
    if status == "archived":
        updates.append("archived_at = now()")
    
    updates.append("updated_at = now()")
    params.append(patient_id)
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                update patients
                set {", ".join(updates)}
                where patient_id = %s
                returning patient_id, name, dob, sex, email, phone, address, medical_history, allergies, active_problems, status, archived_at, created_at, updated_at
                """,
                params,
            )
            row = cur.fetchone()
        conn.commit()
    
    if not row:
        return None
    
    return {
        "patient_id": row[0],
        "name": row[1],
        "dob": row[2],
        "sex": row[3],
        "email": row[4],
        "phone": row[5],
        "address": row[6],
        "medical_history": row[7],
        "allergies": row[8] or [],
        "active_problems": row[9] or [],
        "status": row[10],
        "archived_at": row[11],
        "created_at": row[12],
        "updated_at": row[13],
    }
