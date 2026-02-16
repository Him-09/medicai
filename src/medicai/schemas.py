from __future__ import annotations

from datetime import datetime, date
from typing import List, Optional, Literal, Union
from pydantic import BaseModel, Field


# ---- Shared types ----

DocumentType = Literal["lab", "radiology", "prescription", "clinical_note", "other"]


class SourceInfo(BaseModel):
    file_path: str
    file_type: str  # "pdf" | "image" etc. (router_pipeline sets this)
    processed_at: datetime
    model_used: str


class BaseMetadata(BaseModel):
    """Common metadata for all documents."""
    date_of_service: Optional[date] = Field(
        default=None,
        description="Date of exam / analysis if known (YYYY-MM-DD).",
    )


# ==== LAB DOCUMENTS ==========================================================

class LabTest(BaseModel):
    name: str
    value: Optional[float]
    unit: Optional[str]
    ref_low: Optional[float]
    ref_high: Optional[float]
    flag: Literal["low", "normal", "high", "unknown"] = "unknown"
    source_text: Optional[str]


class LabMetadata(BaseMetadata):
    panel_name: Optional[str] = Field(
        default=None,
        description="Panel name, e.g. 'BIOCHIMIE SANGUINE'.",
    )


class LabStructured(BaseModel):
    panel_name: Optional[str]
    tests: List[LabTest] = Field(default_factory=list)


# ==== RADIOLOGY DOCUMENTS ====================================================

class RadiologyMetadata(BaseMetadata):
    type_examen: Optional[str] = Field(
        default=None,
        description="Type d'examen, e.g. 'TDM ABDOMINALE'.",
    )


class RadiologyStructured(BaseModel):
    contexte_clinique: Optional[str]
    technique_examen: Optional[str]
    resultats: Optional[str]
    conclusion: Optional[str]


# ==== PRESCRIPTION DOCUMENTS =================================================

class MedicationItem(BaseModel):
    drug_name: Optional[str] = None
    strength_or_concentration: Optional[str] = None
    form: Optional[str] = Field(
        default=None,
        description="Pharmaceutical form (e.g., comprimé, gélule, sirop)",
    )
    route: Optional[str] = Field(
        default=None,
        description="Route of administration (e.g., orale, injectable, topique)",
    )
    dose: Optional[str] = Field(
        default=None,
        description="Dose per intake (e.g., 1 cp, 5ml)",
    )
    frequency: Optional[str] = Field(
        default=None,
        description="Frequency (e.g., 3x/jour, matin et soir)",
    )
    duration: Optional[str] = Field(
        default=None,
        description="Treatment duration (e.g., pendant 7 jours)",
    )
    quantity: Optional[str] = Field(
        default=None,
        description="Total quantity prescribed (e.g., 1 boîte)",
    )
    instructions: Optional[str] = Field(
        default=None,
        description="Special instructions (e.g., avant repas, avec eau)",
    )
    as_written: Optional[str] = Field(
        default=None,
        description="Complete medication line as written in prescription",
    )
    confidence: Literal["low", "medium", "high"] = "medium"


class PrescriptionMetadata(BaseMetadata):
    prescriber_full_name: Optional[str] = Field(
        default=None,
        description="Full name of prescriber/physician",
    )
    prescriber_specialty: Optional[str] = Field(
        default=None,
        description="Specialty of prescriber",
    )
    patient_full_name: Optional[str] = Field(
        default=None,
        description="Patient name as written on prescription",
    )


class PrescriptionStructured(BaseModel):
    items: List[MedicationItem] = Field(default_factory=list)
    additional_notes: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


# ==== BASE + SPECIALIZED DOCUMENTS ==========================================

class BaseDocument(BaseModel):
    """
    Common envelope for all medical documents produced by router_pipeline.

    Matches fields set in process_document(): patient_id, doc_id, document_type,
    source, metadata, text, structured.
    """
    schema_version: str = Field(
        default="1.0",
        description="Logical version of this schema. Can be bumped later.",
    )

    patient_id: str
    doc_id: str
    document_type: DocumentType
    source: SourceInfo

    # NOTE: Concrete subclasses will override metadata/structured types.
    metadata: BaseMetadata
    text: Optional[str] = None
    structured: dict = Field(
        default_factory=dict,
        description="Type-specific structured payload.",
    )


class LabDocument(BaseDocument):
    document_type: Literal["lab"] = "lab"
    metadata: LabMetadata
    structured: LabStructured


class RadiologyDocument(BaseDocument):
    document_type: Literal["radiology"] = "radiology"
    metadata: RadiologyMetadata
    structured: RadiologyStructured


class PrescriptionDocument(BaseDocument):
    document_type: Literal["prescription"] = "prescription"
    metadata: PrescriptionMetadata
    structured: PrescriptionStructured


# Union type for parsing any doc
AnyDocument = Union[LabDocument, RadiologyDocument, PrescriptionDocument, BaseDocument]
