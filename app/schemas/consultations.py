from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal

class ConsultationCreateIn(BaseModel):
    patient_id: str = Field(..., min_length=1)
    name: Optional[str] = Field(default=None, description="Consultation name or title")
    consultation_time: Optional[datetime] = Field(default=None, description="Scheduled consultation date/time")

class ConsultationUpdateIn(BaseModel):
    name: Optional[str] = Field(None, description="Consultation name or title")
    status: Optional[Literal["active", "completed", "canceled"]] = Field(None, description="Consultation status")
    consultation_time: Optional[datetime] = Field(None, description="Scheduled consultation date/time")

class ConsultationCreateOut(BaseModel):
    consultation_id: str
    patient_id: str
    name: Optional[str]
    consultation_time: datetime
    created_at: datetime
