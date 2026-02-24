from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class WorkspaceOut(BaseModel):
    consultation_id: str
    patient_id: str
    visit_focus: str = ""
    agenda: List[dict] = Field(default_factory=list)
    hpi: dict
    problems: List[dict] = Field(default_factory=list)
    generated_at: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class SaveWorkspaceIn(BaseModel):
    visit_focus: Optional[str] = None
    agenda: Optional[List[dict]] = None
    hpi: Optional[dict] = None
    problems: Optional[List[dict]] = None
    quick_notes: Optional[List[dict]] = None
    orders: Optional[dict] = None

class GenerateWorkspaceIn(BaseModel):
    pass
