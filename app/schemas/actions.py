from pydantic import BaseModel
from typing import Any, Dict, List

class AbnormalLabsOut(BaseModel):
    patient_id: str
    rows: List[Dict[str, Any]]

class LabTrendOut(BaseModel):
    patient_id: str
    test_name: str
    points: List[Dict[str, Any]]

class RadiologyConclusionsOut(BaseModel):
    patient_id: str
    rows: List[Dict[str, Any]]
