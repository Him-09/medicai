"""Document schemas"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime


class DocumentMetadata(BaseModel):
    """Schema for document metadata"""
    file_name: str = Field(..., description="Original file name")
    file_size: int = Field(..., description="File size in bytes")
    mime_type: str = Field(..., description="MIME type")
    document_type: Optional[str] = Field(None, description="Document type (lab, radiology, etc.)")
    extracted_data: Optional[Dict[str, Any]] = Field(None, description="Extracted structured data")
    processing_status: str = Field(default="pending", description="Processing status")


class UploadOut(BaseModel):
    """Schema for document upload response"""
    patient_id: str = Field(..., description="Patient ID")
    doc_id: str = Field(..., description="Document ID")
    document_type: str = Field(..., description="Document type")
    stored_processed_path: str = Field(..., description="Processed file path")
    source_file_path: str = Field(..., description="Source file path")


class DocumentUploadResponse(BaseModel):
    """Schema for document upload response"""
    document_id: str = Field(..., description="Generated document ID")
    message: str = Field(..., description="Upload status message")
    processing_status: str = Field(..., description="Processing status")


class DocumentResponse(BaseModel):
    """Schema for document response"""
    id: str = Field(..., description="Document ID")
    patient_id: Optional[str] = Field(None, description="Associated patient ID")
    file_name: str = Field(..., description="File name")
    file_size: int = Field(..., description="File size in bytes")
    mime_type: str = Field(..., description="MIME type")
    document_type: Optional[str] = Field(None, description="Document type")
    processing_status: str = Field(..., description="Processing status")
    created_at: datetime = Field(..., description="Upload timestamp")
    updated_at: datetime = Field(..., description="Update timestamp")
    extracted_data: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class DocumentSearchRequest(BaseModel):
    """Schema for document search request"""
    query: str = Field(..., description="Search query")
    patient_id: Optional[str] = Field(None, description="Filter by patient ID")
    document_type: Optional[str] = Field(None, description="Filter by document type")
    top_k: int = Field(default=10, description="Number of results to return")


class DocumentSearchResult(BaseModel):
    """Schema for document search result"""
    document_id: str = Field(..., description="Document ID")


class DocumentListItem(BaseModel):
    """Schema for document list item with minimal data"""
    doc_id: str = Field(..., description="Document ID")
    patient_id: str = Field(..., description="Patient ID")
    document_type: str = Field(..., description="Document type (lab, radiology, etc.)")
    date_of_service: Optional[str] = Field(None, description="Date of service")
    source_file: Optional[str] = Field(None, description="Source file name")
    doc_date: Optional[str] = Field(None, description="Document date")
    review_status: Optional[str] = Field('pending', description="Review status (pending, reviewed)")
    reviewed_at: Optional[datetime] = Field(None, description="When document was reviewed")


class DocumentDetail(BaseModel):
    """Schema for full document detail"""
    doc_id: str = Field(..., description="Document ID")
    patient_id: str = Field(..., description="Patient ID")
    document_type: str = Field(..., description="Document type")
    date_of_service: Optional[str] = Field(None, description="Date of service")
    source_file: Optional[str] = Field(None, description="Source file name")
    doc_date: Optional[str] = Field(None, description="Document date")
    review_status: Optional[str] = Field('pending', description="Review status")
    reviewed_at: Optional[datetime] = Field(None, description="When document was reviewed")
    content: Dict[str, Any] = Field(..., description="Full document content")
    source_file_url: Optional[str] = Field(None, description="URL to view raw document file")


class DocumentReviewUpdate(BaseModel):
    """Schema for updating document review status"""
    review_status: str = Field(..., description="Review status (pending or reviewed)")


class DocumentUpdateIn(BaseModel):
    """Schema for updating document (e.g., reassigning to another patient)"""
    patient_id: Optional[str] = Field(None, description="New patient ID to reassign document to")
    review_status: Optional[str] = Field(None, description="Review status (pending or reviewed)")


class DocumentExtractedDataUpdate(BaseModel):
    """Schema for updating document extracted data"""
    content: Dict[str, Any] = Field(..., description="Updated document content with extracted data")


class PendingCountResponse(BaseModel):
    """Schema for pending documents count"""
    count: int = Field(..., description="Number of pending documents")


class PendingDocumentItem(BaseModel):
    """Schema for pending document item in triage list"""
    doc_id: str = Field(..., description="Document ID")
    patient_id: str = Field(..., description="Patient ID")
    patient_name: str = Field(..., description="Patient name")
    document_type: str = Field(..., description="Document type")
    summary: Optional[str] = Field(None, description="Brief summary/highlight from document")
    date_of_service: Optional[str] = Field(None, description="Date of service")
    created_at: Optional[str] = Field(None, description="When document was uploaded")


class PendingDocumentsResponse(BaseModel):
    """Schema for pending documents list with details"""
    count: int = Field(..., description="Total pending count")
    documents: List[PendingDocumentItem] = Field(default_factory=list, description="List of pending documents")


class DuplicateDocumentResponse(BaseModel):
    """Schema for duplicate document detection"""
    is_duplicate: bool = Field(..., description="Whether document already exists")
    existing_doc_id: Optional[str] = Field(None, description="ID of existing document")
    existing_patient_id: Optional[str] = Field(None, description="Patient ID of existing document")
    message: str = Field(..., description="Descriptive message")
