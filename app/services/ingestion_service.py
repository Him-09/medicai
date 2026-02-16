from __future__ import annotations

from pathlib import Path
import shutil

from fastapi import UploadFile

from medicai.config import config
from medicai.ingestion.router_pipeline import process_document
from medicai.storage.file_store import FileStore
from medicai.storage.indexer_sql import upsert_document, index_lab, index_radiology
from medicai.storage.postgres import get_conn

_store = FileStore()

def save_upload_to_raw(patient_id: str, file: UploadFile) -> Path:
    raw_dir = Path(config.DATA_RAW_DIR) / patient_id
    raw_dir.mkdir(parents=True, exist_ok=True)

    dest = raw_dir / file.filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return dest

def ingest_file(patient_id: str, uploaded_path: Path):
    # Extract + classify + normalize into your document schema
    doc = process_document(str(uploaded_path))

    # Override patient_id with the correct one from the API request
    # (process_document extracts from path, but uploaded files may not have it)
    doc.patient_id = patient_id
    
    # Save structured JSON into processed store
    processed_path = _store.save(doc)
    
    # Index to PostgreSQL for SQL-based queries
    with get_conn() as conn:
        upsert_document(conn, doc)
        if doc.document_type == "lab":
            index_lab(conn, doc)
        elif doc.document_type == "radiology":
            index_radiology(conn, doc)
        conn.commit()
    
    return doc, processed_path
