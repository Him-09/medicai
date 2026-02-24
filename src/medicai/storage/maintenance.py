from medicai.storage.postgres import get_conn

def auto_complete_old_consultations() -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE consultations
                SET status = 'completed', updated_at = now()
                WHERE status = 'active'
                  AND consultation_time < now() - interval '6 hours'
                """,
            )
            affected = cur.rowcount
        conn.commit()
    
    return affected

def auto_archive_inactive_patients(days: int = 180) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE patients p
                SET status = 'archived', updated_at = now()
                WHERE p.status = 'active'
                  AND COALESCE(
                    (SELECT MAX(c.consultation_time)
                     FROM consultations c
                     WHERE c.patient_id = p.patient_id
                       AND c.status IN ('active','completed')
                    ),
                    p.created_at
                  ) < now() - make_interval(days => %s)
                """,
                (days,),
            )
            affected = cur.rowcount
        conn.commit()
    
    return affected

def unarchive_patient(patient_id: str) -> bool:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE patients
                SET status = 'active', updated_at = now()
                WHERE patient_id = %s AND status = 'archived'
                """,
                (patient_id,),
            )
            affected = cur.rowcount
        conn.commit()
    
    return affected > 0

def run_all_maintenance_tasks(inactive_days: int = 180) -> dict:
    consultations_completed = auto_complete_old_consultations()
    patients_archived = auto_archive_inactive_patients(inactive_days)
    
    return {
        "consultations_completed": consultations_completed,
        "patients_archived": patients_archived,
    }
