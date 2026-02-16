from pydantic import BaseModel
from typing import Any, Dict, Optional, List
from datetime import datetime

class PatientSnapshotOut(BaseModel):
    patient_id: str
    latest_lab: Optional[Dict[str, Any]] = None
    latest_radiology: Optional[Dict[str, Any]] = None
    active_problems: List[str] = []
    current_medications: List[Dict[str, Any]] = []
    allergies: List[str] = []

class PrepOut(BaseModel):
    patient_id: str
    prep_text: str

# Changes since last visit schemas
class NewDocument(BaseModel):
    doc_id: str
    document_type: str
    date_of_service: Optional[str] = None
    processed_at: str

class AbnormalLab(BaseModel):
    test_name: str
    value: str
    unit: str
    flag: str
    date_of_service: str
    trend: str  # "new_abnormal" or "worsening"
    previous_value: Optional[str] = None

class NewImaging(BaseModel):
    report_id: str
    type_examen: str
    date_of_service: str
    conclusion: Optional[str] = None

class PatientChangesOut(BaseModel):
    since: Optional[str] = None
    new_documents: List[NewDocument]
    new_abnormals: List[AbnormalLab]
    worsening_trends: List[AbnormalLab]
    new_imaging: List[NewImaging]
