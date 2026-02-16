"""
Workspace schemas for consultation documentation.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class HPISymptom(BaseModel):
    name: str
    details: str


class HPICheckItem(BaseModel):
    label: str
    checked: Optional[bool] = None


class HPISection(BaseModel):
    one_liner: str = Field(description="Brief summary: age, chief complaint, key findings")
    symptoms: List[dict] = Field(default_factory=list)  # Flexible format
    red_flags: List[dict] = Field(default_factory=list)  # Flexible format
    since_last_visit: str = ""
    meds_adherence: Optional[bool] = None
    meds_side_effects: str = ""
    nsaids_use: Optional[bool] = None
    anticoagulants_use: Optional[bool] = None
    objective_highlights: List[dict] = Field(default_factory=list)  # {text: str, source: str}
    patient_goal: str = ""


class ProblemPlanItem(BaseModel):
    id: int
    text: str
    checked: bool = False


class ProblemPlan(BaseModel):
    today: List[ProblemPlanItem] = Field(default_factory=list)
    orders: List[ProblemPlanItem] = Field(default_factory=list)
    treatment: List[ProblemPlanItem] = Field(default_factory=list)
    follow_up: List[ProblemPlanItem] = Field(default_factory=list)
    safety_net: List[ProblemPlanItem] = Field(default_factory=list)


class ProblemBlock(BaseModel):
    id: int
    title: str
    urgency: Optional[str] = None  # "Urgent", "Routine", etc.
    assessment: str = ""
    evidence: List[str] = Field(default_factory=list)
    plan: dict  # Flexible plan structure - can be nested ProblemPlan or flat list
    sources: List[str] = Field(default_factory=list)


class WorkspaceOut(BaseModel):
    consultation_id: str
    patient_id: str
    visit_focus: str = ""
    agenda: List[dict] = Field(default_factory=list)  # {id, text, checked}
    hpi: dict  # Flexible HPI structure
    problems: List[dict] = Field(default_factory=list)  # Flexible problem structure
    generated_at: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SaveWorkspaceIn(BaseModel):
    # patient_id is fetched from consultation, not sent in request
    visit_focus: Optional[str] = None
    agenda: Optional[List[dict]] = None
    hpi: Optional[dict] = None
    problems: Optional[List[dict]] = None
    quick_notes: Optional[List[dict]] = None
    orders: Optional[dict] = None  # WorkspaceOrders object with rx_intents, referral_intents, etc.


class GenerateWorkspaceIn(BaseModel):
    # patient_id is fetched from consultation, not sent in request
    pass  # No fields needed


# ============================================================================
# ENRICHMENT SCHEMAS - for "Seed → Enrich" model
# ============================================================================

class EnrichProblemIn(BaseModel):
    """Request to enrich a problem with clinical content."""
    problem_id: str = Field(description="ID of the problem to enrich")
    problem_title: str = Field(description="Title of the problem (used for syndrome detection)")
    evidence: List[dict] = Field(default_factory=list, description="Evidence items from the problem")
    urgency: Optional[str] = Field(None, description="Urgency level if any")
    fields: Optional[List[str]] = Field(
        None,
        description="Specific fields to enrich. If None, enriches all. Options: symptoms, red_flags, assessment, plan, suggested_orders"
    )
    mode: Optional[str] = Field(
        "auto",
        description="Enrichment mode: 'kb' (knowledge base only), 'llm' (LLM only), 'auto' (KB-first, LLM-fallback)"
    )


class EnrichProblemOut(BaseModel):
    """Response with enriched clinical content."""
    problem_id: str
    symptoms: Optional[List[dict]] = None
    red_flags: Optional[List[dict]] = None
    assessment: Optional[str] = None
    plan: Optional[dict] = None
    suggested_orders: Optional[List[dict]] = None
    origin: Optional[str] = Field(
        None,
        description="Source of enrichment: 'knowledge_base', 'llm_generated', or 'default_template'"
    )
    requires_review: bool = Field(
        False,
        description="True if content is LLM-generated and should be flagged for review"
    )


class EnrichHPIIn(BaseModel):
    """Request to enrich HPI with syndrome-specific content."""
    syndrome: Optional[str] = Field(None, description="Detected syndrome name for context")
    fields: Optional[List[str]] = Field(
        None,
        description="Specific fields to enrich. Options: symptoms, red_flags"
    )
    mode: Optional[str] = Field(
        "auto",
        description="Enrichment mode: 'kb', 'llm', or 'auto'"
    )


class EnrichHPIOut(BaseModel):
    """Response with enriched HPI content."""
    symptoms: Optional[List[dict]] = None
    red_flags: Optional[List[dict]] = None
    origin: Optional[str] = Field(
        None,
        description="Source of enrichment: 'knowledge_base', 'llm_generated', or 'default_template'"
    )
    requires_review: bool = Field(
        False,
        description="True if content is LLM-generated and should be flagged for review"
    )
