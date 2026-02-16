from pydantic import BaseModel, Field
from typing import Literal, List, Optional

class ChatIn(BaseModel):
    patient_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)

class ChatOut(BaseModel):
    consultation_id: str
    patient_id: str
    reply: str

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    sources: Optional[str] = None  # comma-separated doc_ids for traceability

class ChatHistoryOut(BaseModel):
    consultation_id: str
    messages: List[ChatMessage]

class ResetOut(BaseModel):
    consultation_id: str
    status: str
