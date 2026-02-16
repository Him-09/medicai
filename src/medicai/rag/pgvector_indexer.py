# pgvector_indexer.py
"""
pgvector-based document indexer for MedicAI.
Builds embeddings and stores them in PostgreSQL with pgvector.
"""
from __future__ import annotations

from typing import List, Optional
import logging

from medicai.storage.file_store import FileStore
from medicai.schemas import LabDocument, RadiologyDocument, AnyDocument
from medicai.rag.pgvector_store import store_document_embedding, delete_patient_embeddings

logger = logging.getLogger(__name__)

store = FileStore()


def _lab_to_text(doc: LabDocument) -> str:
    """
    Create a synthetic textual representation of a lab panel for RAG.
    We do not include numeric interpretation; only facts.
    """
    lines = []
    lines.append(f"{doc.structured.panel_name or 'Panel'} - {doc.metadata.date_of_service}")
    for t in doc.structured.tests:
        val = f"{t.value} {t.unit}" if t.value is not None else "n/a"
        ref = f"(ref: {t.ref_low}-{t.ref_high})" if t.ref_low or t.ref_high else ""
        lines.append(f"- {t.name}: {val} {ref}")
    return "\n".join(lines)


def _radiology_to_text(doc: RadiologyDocument) -> str:
    """Convert radiology document to text for embedding."""
    return doc.text or (
        f"{doc.structured.contexte_clinique}\n\n"
        f"{doc.structured.technique_examen}\n\n"
        f"{doc.structured.resultats}\n\n"
        f"{doc.structured.conclusion}"
    )


def index_document(doc: AnyDocument) -> Optional[str]:
    """
    Index a single document into pgvector.
    
    Args:
        doc: Document to index
        
    Returns:
        Embedding record ID if successful, None otherwise
    """
    if isinstance(doc, RadiologyDocument):
        text = _radiology_to_text(doc)
    elif isinstance(doc, LabDocument):
        text = _lab_to_text(doc)
    else:
        text = doc.text or ""
    
    if not text or text.strip() == "":
        logger.warning(f"Skipping empty document: {doc.doc_id}")
        return None
    
    cleaned = text.strip()
    date_str = (
        doc.metadata.date_of_service.isoformat()
        if doc.metadata.date_of_service else None
    )
    
    try:
        embedding_id = store_document_embedding(
            patient_id=doc.patient_id,
            doc_id=doc.doc_id,
            document_type=doc.document_type,
            content=cleaned,
            date_of_service=date_str,
            metadata={
                "source": "file_store",
            }
        )
        logger.info(f"Indexed document {doc.doc_id} -> {embedding_id}")
        return embedding_id
    except Exception as e:
        logger.error(f"Failed to index document {doc.doc_id}: {e}")
        return None


def build_index_for_patient(patient_id: str, rebuild: bool = False) -> dict:
    """
    Build pgvector index for all documents of a patient.
    
    Args:
        patient_id: Patient identifier
        rebuild: If True, delete existing embeddings first
        
    Returns:
        Dict with indexing statistics
    """
    if rebuild:
        deleted = delete_patient_embeddings(patient_id)
        logger.info(f"Deleted {deleted} existing embeddings for patient {patient_id}")
    
    docs: List[AnyDocument] = store.load_by_patient(patient_id)
    
    indexed = 0
    skipped = 0
    errors = 0
    
    for doc in docs:
        result = index_document(doc)
        if result:
            indexed += 1
        elif result is None:
            skipped += 1
        else:
            errors += 1
    
    return {
        "patient_id": patient_id,
        "total_documents": len(docs),
        "indexed": indexed,
        "skipped": skipped,
        "errors": errors,
    }


def rebuild_all_indexes() -> dict:
    """
    Rebuild pgvector indexes for all patients.
    
    Returns:
        Dict with total statistics
    """
    # Get all unique patient IDs from file store
    from pathlib import Path
    from medicai.config import config
    
    processed_dir = config.DATA_PROCESSED_DIR
    patient_dirs = [d.name for d in processed_dir.iterdir() if d.is_dir()]
    
    total_indexed = 0
    total_skipped = 0
    total_errors = 0
    patients_processed = 0
    
    for patient_id in patient_dirs:
        try:
            result = build_index_for_patient(patient_id, rebuild=True)
            total_indexed += result["indexed"]
            total_skipped += result["skipped"]
            total_errors += result["errors"]
            patients_processed += 1
        except Exception as e:
            logger.error(f"Failed to index patient {patient_id}: {e}")
            total_errors += 1
    
    return {
        "patients_processed": patients_processed,
        "total_indexed": total_indexed,
        "total_skipped": total_skipped,
        "total_errors": total_errors,
    }
