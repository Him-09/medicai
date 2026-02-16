from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Depends
from fastapi.responses import FileResponse, Response
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path

from app.schemas.documents import (
    UploadOut, 
    DocumentListItem, 
    DocumentDetail, 
    DocumentReviewUpdate,
    DocumentUpdateIn,
    DocumentExtractedDataUpdate,
    PendingCountResponse,
    PendingDocumentItem,
    PendingDocumentsResponse,
    DuplicateDocumentResponse
)
from app.services.ingestion_service import save_upload_to_raw, ingest_file
from medicai.storage.file_store import FileStore
from medicai.storage.postgres import get_conn
from app.auth import get_current_user
from app.audit import audit_event, DOC_UPLOAD, DOC_VIEW, DOC_DELETE
from app.utils.upload_security import validate_upload

router = APIRouter(prefix="/api/patients", tags=["documents"])
documents_router = APIRouter(prefix="/api/documents", tags=["documents"])

_file_store = FileStore()

@router.post("/{patient_id}/documents:upload", response_model=UploadOut)
def upload_document(
    patient_id: str,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user)
):
    patient_id = patient_id.strip()
    if not patient_id:
        raise HTTPException(400, "patient_id is required")

    if not file or not file.filename:
        raise HTTPException(400, "file is required")
    
    # Validate file type and size
    validate_upload(file)

    # Check for duplicate document by filename
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT doc_id, patient_id FROM documents 
                    WHERE source_file_path LIKE %s
                    ORDER BY processed_at DESC LIMIT 1
                """, (f"%{file.filename}%",))
                existing = cur.fetchone()
                
                if existing:
                    existing_doc_id, existing_patient_id = existing
                    # Document already exists - return conflict with details
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "message": f"Document '{file.filename}' already exists",
                            "existing_doc_id": existing_doc_id,
                            "existing_patient_id": existing_patient_id,
                            "can_reassign": True
                        }
                    )
    except HTTPException:
        raise
    except Exception:
        pass  # Continue with upload if check fails

    raw_path = save_upload_to_raw(patient_id, file)
    doc, processed_path = ingest_file(patient_id, raw_path)
    
    # Audit the upload
    audit_event(user["id"], DOC_UPLOAD, patient_id=patient_id, metadata={"doc_id": doc.doc_id})

    return UploadOut(
        patient_id=patient_id,
        doc_id=doc.doc_id,
        document_type=doc.document_type,
        stored_processed_path=str(processed_path),
        source_file_path=str(raw_path),
    )


@router.get("/{patient_id}/documents", response_model=List[DocumentListItem])
def list_patient_documents(
    patient_id: str,
    review_status: Optional[str] = Query(None, description="Filter by review status (pending or reviewed)")
):
    """List all documents for a patient with optional review status filter."""
    patient_id = patient_id.strip()
    if not patient_id:
        raise HTTPException(400, "patient_id is required")

    # Query from PostgreSQL for review status
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                if review_status:
                    cur.execute("""
                        SELECT doc_id, patient_id, document_type, date_of_service, 
                               source_file_path, review_status, reviewed_at
                        FROM documents
                        WHERE patient_id = %s AND review_status = %s
                        ORDER BY date_of_service DESC NULLS LAST
                    """, (patient_id, review_status))
                else:
                    cur.execute("""
                        SELECT doc_id, patient_id, document_type, date_of_service, 
                               source_file_path, review_status, reviewed_at
                        FROM documents
                        WHERE patient_id = %s
                        ORDER BY date_of_service DESC NULLS LAST
                    """, (patient_id,))
                
                rows = cur.fetchall()
                result = []
                for row in rows:
                    doc_id, pid, doc_type, dos, source_file, rev_status, rev_at = row
                    result.append(DocumentListItem(
                        doc_id=doc_id,
                        patient_id=pid,
                        document_type=doc_type,
                        date_of_service=dos.isoformat() if dos else None,
                        source_file=source_file.split('/')[-1] if source_file else None,
                        doc_date=dos.isoformat() if dos else None,
                        review_status=rev_status or 'pending',
                        reviewed_at=rev_at
                    ))
                return result
    except Exception as e:
        # Fallback to FileStore if DB query fails
        documents = _file_store.load_by_patient(patient_id)
        result = []
        for doc in documents:
            result.append(DocumentListItem(
                doc_id=doc.doc_id,
                patient_id=doc.patient_id,
                document_type=doc.document_type,
                date_of_service=getattr(doc, 'date_of_service', None),
                source_file=getattr(doc, 'source_file', None),
                doc_date=getattr(doc, 'doc_date', None),
                review_status='pending',
                reviewed_at=None
            ))
        return result


@documents_router.get("/pending/count", response_model=PendingCountResponse)
def get_pending_count():
    """Get count of all pending documents across all patients."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT COUNT(*) 
                    FROM documents 
                    WHERE review_status = 'pending'
                """)
                count = cur.fetchone()[0]
                return PendingCountResponse(count=count)
    except Exception as e:
        raise HTTPException(500, f"Failed to get pending count: {str(e)}")


@documents_router.get("/pending", response_model=PendingDocumentsResponse)
def get_pending_documents(limit: int = Query(5, description="Max number of documents to return")):
    """Get pending documents with details for triage list."""
    import json
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Get total count
                cur.execute("""
                    SELECT COUNT(*) 
                    FROM documents 
                    WHERE review_status = 'pending'
                """)
                total_count = cur.fetchone()[0]
                
                # Get pending documents with patient info and summary
                cur.execute("""
                    SELECT 
                        d.doc_id,
                        d.patient_id,
                        p.name as patient_name,
                        d.document_type,
                        d.payload,
                        d.date_of_service,
                        d.created_at
                    FROM documents d
                    LEFT JOIN patients p ON d.patient_id = p.patient_id
                    WHERE d.review_status = 'pending'
                    ORDER BY d.created_at DESC
                    LIMIT %s
                """, (limit,))
                
                rows = cur.fetchall()
                documents = []
                
                for row in rows:
                    doc_id, patient_id, patient_name, doc_type, content_json, date_of_service, created_at = row
                    
                    # Extract summary from content
                    summary = None
                    if content_json:
                        try:
                            content = json.loads(content_json) if isinstance(content_json, str) else content_json
                            
                            # Try to get meaningful summary based on document type
                            if doc_type and 'lab' in doc_type.lower():
                                # Look for abnormal results
                                tests = content.get('tests', [])
                                abnormals = [t for t in tests if t.get('flag') in ['H', 'L', 'high', 'low']]
                                if abnormals:
                                    first = abnormals[0]
                                    flag = '↑' if first.get('flag') in ['H', 'high'] else '↓'
                                    summary = f"{first.get('name', 'Test')} {flag} {first.get('value', '')}"
                                else:
                                    panel = content.get('panel_name', '')
                                    summary = panel if panel else 'Lab results'
                            elif doc_type and 'radiology' in doc_type.lower():
                                conclusion = content.get('conclusion', '')
                                if conclusion:
                                    summary = conclusion[:60] + '...' if len(conclusion) > 60 else conclusion
                                else:
                                    summary = content.get('type_examen', 'Imaging study')
                            elif doc_type and 'prescription' in doc_type.lower():
                                meds = content.get('medications', [])
                                if meds:
                                    med_names = [m.get('drug_name', m.get('name', '')) for m in meds[:2]]
                                    summary = ', '.join(filter(None, med_names))
                                else:
                                    summary = 'Prescription'
                            else:
                                summary = doc_type or 'Document'
                        except:
                            summary = doc_type or 'Document'
                    
                    documents.append(PendingDocumentItem(
                        doc_id=doc_id,
                        patient_id=patient_id or '',
                        patient_name=patient_name or 'Unknown',
                        document_type=doc_type or 'document',
                        summary=summary,
                        date_of_service=str(date_of_service) if date_of_service else None,
                        created_at=created_at.isoformat() if created_at else None
                    ))
                
                return PendingDocumentsResponse(count=total_count, documents=documents)
    except Exception as e:
        import traceback
        print(f"Error getting pending documents: {traceback.format_exc()}")
        raise HTTPException(500, f"Failed to get pending documents: {str(e)}")


@documents_router.get("/{doc_id}", response_model=DocumentDetail)
def get_document_by_id(doc_id: str):
    """Get full document details by document ID."""
    doc_id = doc_id.strip()
    if not doc_id:
        raise HTTPException(400, "doc_id is required")

    # Get review status from DB
    review_status = 'pending'
    reviewed_at = None
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT review_status, reviewed_at 
                    FROM documents 
                    WHERE doc_id = %s
                """, (doc_id,))
                row = cur.fetchone()
                if row:
                    review_status, reviewed_at = row
    except Exception:
        pass  # Use defaults if query fails

    document = _file_store.load(doc_id)
    if not document:
        raise HTTPException(404, f"Document {doc_id} not found")

    # Return full document detail
    return DocumentDetail(
        doc_id=document.doc_id,
        patient_id=document.patient_id,
        document_type=document.document_type,
        date_of_service=getattr(document, 'date_of_service', None),
        source_file=getattr(document, 'source_file', None),
        doc_date=getattr(document, 'doc_date', None),
        review_status=review_status,
        reviewed_at=reviewed_at,
        content=document.model_dump(mode='json'),
        source_file_url=f"/api/documents/{doc_id}/raw",
    )


@documents_router.get("/{doc_id}/raw")
def get_document_raw_file(doc_id: str):
    """Serve the raw document file for viewing."""
    doc_id = doc_id.strip()
    if not doc_id:
        raise HTTPException(400, "doc_id is required")
    
    # Get source file path from DB
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT source_file_path 
                    FROM documents 
                    WHERE doc_id = %s
                """, (doc_id,))
                row = cur.fetchone()
                if not row or not row[0]:
                    raise HTTPException(404, f"Document file not found for {doc_id}")
                
                source_path = Path(row[0])
                if not source_path.exists():
                    raise HTTPException(404, f"Document file does not exist: {source_path}")
                
                # Determine media type based on file extension
                media_type_map = {
                    '.pdf': 'application/pdf',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.txt': 'text/plain',
                }
                media_type = media_type_map.get(source_path.suffix.lower(), 'application/octet-stream')
                
                # Return file with inline disposition for viewing
                return FileResponse(
                    path=str(source_path),
                    media_type=media_type,
                    headers={
                        "Content-Disposition": f"inline; filename={source_path.name}"
                    }
                )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to retrieve document file: {str(e)}")


@documents_router.patch("/{doc_id}")
def update_document_review_status(doc_id: str, payload: DocumentReviewUpdate):
    """Mark a document as reviewed or pending."""
    doc_id = doc_id.strip()
    if not doc_id:
        raise HTTPException(400, "doc_id is required")
    
    if payload.review_status not in ['pending', 'reviewed']:
        raise HTTPException(400, "review_status must be 'pending' or 'reviewed'")
    
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Check if document exists
                cur.execute("SELECT doc_id FROM documents WHERE doc_id = %s", (doc_id,))
                if not cur.fetchone():
                    raise HTTPException(404, f"Document {doc_id} not found")
                
                # Update review status
                if payload.review_status == 'reviewed':
                    cur.execute("""
                        UPDATE documents 
                        SET review_status = %s, reviewed_at = NOW()
                        WHERE doc_id = %s
                    """, (payload.review_status, doc_id))
                else:
                    cur.execute("""
                        UPDATE documents 
                        SET review_status = %s, reviewed_at = NULL
                        WHERE doc_id = %s
                    """, (payload.review_status, doc_id))
                
                conn.commit()
                
                # Get updated values
                cur.execute("""
                    SELECT review_status, reviewed_at 
                    FROM documents 
                    WHERE doc_id = %s
                """, (doc_id,))
                review_status, reviewed_at = cur.fetchone()
                
                return {
                    "doc_id": doc_id,
                    "review_status": review_status,
                    "reviewed_at": reviewed_at.isoformat() if reviewed_at else None,
                    "message": f"Document marked as {review_status}"
                }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to update document: {str(e)}")


@documents_router.patch("/{doc_id}/reassign")
def reassign_document(doc_id: str, payload: DocumentUpdateIn):
    """Reassign a document to another patient."""
    doc_id = doc_id.strip()
    if not doc_id:
        raise HTTPException(400, "doc_id is required")
    
    if not payload.patient_id:
        raise HTTPException(400, "patient_id is required for reassignment")
    
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Check if document exists
                cur.execute("SELECT patient_id FROM documents WHERE doc_id = %s", (doc_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(404, f"Document {doc_id} not found")
                
                old_patient_id = row[0]
                
                # Check if new patient exists
                cur.execute("SELECT patient_id FROM patients WHERE patient_id = %s", (payload.patient_id,))
                if not cur.fetchone():
                    raise HTTPException(404, f"Patient {payload.patient_id} not found")
                
                # Update document patient_id and reset review status
                cur.execute("""
                    UPDATE documents 
                    SET patient_id = %s, review_status = 'pending', reviewed_at = NULL
                    WHERE doc_id = %s
                """, (payload.patient_id, doc_id))
                
                # Update related lab_results and radiology_reports
                cur.execute("""
                    UPDATE lab_results 
                    SET patient_id = %s
                    WHERE doc_id = %s
                """, (payload.patient_id, doc_id))
                
                cur.execute("""
                    UPDATE radiology_reports 
                    SET patient_id = %s
                    WHERE doc_id = %s
                """, (payload.patient_id, doc_id))
                
                conn.commit()
                
                return {
                    "doc_id": doc_id,
                    "old_patient_id": old_patient_id,
                    "new_patient_id": payload.patient_id,
                    "message": f"Document reassigned from {old_patient_id} to {payload.patient_id}"
                }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to reassign document: {str(e)}")


@documents_router.delete("/{doc_id}")
def delete_document(doc_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Delete a document and its related data."""
    doc_id = doc_id.strip()
    if not doc_id:
        raise HTTPException(400, "doc_id is required")
    
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Check if document exists
                cur.execute("SELECT patient_id FROM documents WHERE doc_id = %s", (doc_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(404, f"Document {doc_id} not found")
                
                patient_id = row[0]
                
                # Audit the delete BEFORE deleting
                audit_event(
                    user["id"], 
                    DOC_DELETE, 
                    patient_id=patient_id, 
                    metadata={"doc_id": doc_id}
                )
                
                # Delete related lab_results
                cur.execute("DELETE FROM lab_results WHERE doc_id = %s", (doc_id,))
                
                # Delete related radiology_reports
                cur.execute("DELETE FROM radiology_reports WHERE doc_id = %s", (doc_id,))
                
                # Delete document
                cur.execute("DELETE FROM documents WHERE doc_id = %s", (doc_id,))
                
                conn.commit()
                
                return {
                    "doc_id": doc_id,
                    "patient_id": patient_id,
                    "message": "Document deleted successfully"
                }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to delete document: {str(e)}")


@documents_router.patch("/{doc_id}/extracted-data")
def update_document_extracted_data(doc_id: str, payload: DocumentExtractedDataUpdate):
    """Update the extracted data for a document (allow doctor to correct extraction errors)."""
    import json
    
    doc_id = doc_id.strip()
    if not doc_id:
        raise HTTPException(400, "doc_id is required")
    
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Check if document exists
                cur.execute("SELECT doc_id FROM documents WHERE doc_id = %s", (doc_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(404, f"Document {doc_id} not found")
                
                # Load current payload from database and update it
                cur.execute("SELECT payload FROM documents WHERE doc_id = %s", (doc_id,))
                current_payload = cur.fetchone()[0]
                
                if current_payload:
                    # Update metadata and structured directly in payload (they're at root level, not under 'content')
                    if 'metadata' in payload.content:
                        if 'metadata' not in current_payload:
                            current_payload['metadata'] = {}
                        current_payload['metadata'].update(payload.content['metadata'])
                    if 'structured' in payload.content:
                        if 'structured' not in current_payload:
                            current_payload['structured'] = {}
                        current_payload['structured'].update(payload.content['structured'])
                    
                    # Update database
                    cur.execute("""
                        UPDATE documents 
                        SET payload = %s::jsonb 
                        WHERE doc_id = %s
                    """, (json.dumps(current_payload, ensure_ascii=False), doc_id))
                    conn.commit()
                    
                    # Also update the file store (reload to get fresh copy)
                    document = _file_store.load(doc_id)
                    if document:
                        if 'metadata' in payload.content and hasattr(document, 'metadata'):
                            for key, value in payload.content['metadata'].items():
                                if hasattr(document.metadata, key):
                                    setattr(document.metadata, key, value)
                        if 'structured' in payload.content and hasattr(document, 'structured'):
                            for key, value in payload.content['structured'].items():
                                if hasattr(document.structured, key):
                                    setattr(document.structured, key, value)
                        _file_store.save(document)
                
                return {
                    "doc_id": doc_id,
                    "message": "Extracted data updated successfully",
                    "updated_content": payload.content
                }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error updating extracted data: {traceback.format_exc()}")
        raise HTTPException(500, f"Failed to update extracted data: {str(e)}")
