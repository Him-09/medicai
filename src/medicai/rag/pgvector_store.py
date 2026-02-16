# pgvector_store.py
"""
PostgreSQL pgvector-based vector storage for MedicAI.
Replaces FAISS with secure, auditable vector storage in Postgres.
"""
from __future__ import annotations

import json
import logging
from typing import List, Dict, Any, Optional

from medicai.storage.postgres import get_conn
from medicai.config import config

logger = logging.getLogger(__name__)

# OpenAI embedding dimension
EMBEDDING_DIM = 1536


def _get_embeddings(texts: List[str]) -> List[List[float]]:
    """Get embeddings from OpenAI API."""
    from openai import OpenAI
    
    client = config.get_openai_client()
    
    # OpenAI allows batching up to 2048 texts
    response = client.embeddings.create(
        model="text-embedding-ada-002",
        input=texts
    )
    
    return [item.embedding for item in response.data]


def store_document_embedding(
    patient_id: str,
    doc_id: str,
    document_type: str,
    content: str,
    date_of_service: Optional[str] = None,
    chunk_index: int = 0,
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """
    Store a document chunk with its embedding in pgvector.
    
    Args:
        patient_id: Patient identifier
        doc_id: Document identifier
        document_type: Type of document (lab, radiology, etc.)
        content: Text content to embed
        date_of_service: Optional date of service
        chunk_index: Index for multi-chunk documents
        metadata: Additional metadata
        
    Returns:
        UUID of the stored embedding record
    """
    # Get embedding from OpenAI
    embeddings = _get_embeddings([content])
    embedding = embeddings[0]
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO document_embeddings 
                    (patient_id, doc_id, document_type, date_of_service, 
                     chunk_index, content, embedding, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s::vector, %s::jsonb)
                ON CONFLICT (doc_id, chunk_index) 
                DO UPDATE SET
                    content = EXCLUDED.content,
                    embedding = EXCLUDED.embedding,
                    metadata = EXCLUDED.metadata
                RETURNING id
                """,
                (
                    patient_id,
                    doc_id,
                    document_type,
                    date_of_service,
                    chunk_index,
                    content,
                    f"[{','.join(map(str, embedding))}]",
                    json.dumps(metadata or {}),
                ),
            )
            result = cur.fetchone()
        conn.commit()
    
    return str(result[0]) if result else ""


def store_document_embeddings_batch(
    patient_id: str,
    doc_id: str,
    document_type: str,
    chunks: List[str],
    date_of_service: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> List[str]:
    """
    Store multiple document chunks with embeddings in batch.
    
    Args:
        patient_id: Patient identifier
        doc_id: Document identifier
        document_type: Type of document
        chunks: List of text chunks to embed
        date_of_service: Optional date of service
        metadata: Additional metadata
        
    Returns:
        List of UUIDs for stored embedding records
    """
    if not chunks:
        return []
    
    # Get all embeddings in one API call
    embeddings = _get_embeddings(chunks)
    
    ids = []
    with get_conn() as conn:
        with conn.cursor() as cur:
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                cur.execute(
                    """
                    INSERT INTO document_embeddings 
                        (patient_id, doc_id, document_type, date_of_service, 
                         chunk_index, content, embedding, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s::vector, %s::jsonb)
                    ON CONFLICT (doc_id, chunk_index) 
                    DO UPDATE SET
                        content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding,
                        metadata = EXCLUDED.metadata
                    RETURNING id
                    """,
                    (
                        patient_id,
                        doc_id,
                        document_type,
                        date_of_service,
                        i,
                        chunk,
                        f"[{','.join(map(str, embedding))}]",
                        json.dumps(metadata or {}),
                    ),
                )
                result = cur.fetchone()
                if result:
                    ids.append(str(result[0]))
        conn.commit()
    
    return ids


def search_patient_documents(
    patient_id: str,
    query: str,
    k: int = 5
) -> List[Dict[str, Any]]:
    """
    Perform semantic search on a patient's documents using pgvector.
    
    Args:
        patient_id: Patient identifier
        query: Search query text
        k: Number of results to return
        
    Returns:
        List of matching documents with similarity scores
    """
    # Get query embedding
    embeddings = _get_embeddings([query])
    query_embedding = embeddings[0]
    embedding_str = f"[{','.join(map(str, query_embedding))}]"
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    doc_id,
                    document_type,
                    date_of_service,
                    content,
                    metadata,
                    1 - (embedding <=> %s::vector) AS similarity
                FROM document_embeddings
                WHERE patient_id = %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (embedding_str, patient_id, embedding_str, k),
            )
            rows = cur.fetchall()
    
    return [
        {
            "doc_id": row[0],
            "document_type": row[1],
            "date_of_service": row[2].isoformat() if row[2] else None,
            "text": row[3],
            "metadata": row[4],
            "similarity": float(row[5]) if row[5] else 0.0,
        }
        for row in rows
    ]


def delete_document_embeddings(doc_id: str) -> int:
    """
    Delete all embeddings for a document.
    
    Args:
        doc_id: Document identifier
        
    Returns:
        Number of records deleted
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM document_embeddings WHERE doc_id = %s",
                (doc_id,),
            )
            deleted = cur.rowcount
        conn.commit()
    
    return deleted


def delete_patient_embeddings(patient_id: str) -> int:
    """
    Delete all embeddings for a patient.
    
    Args:
        patient_id: Patient identifier
        
    Returns:
        Number of records deleted
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM document_embeddings WHERE patient_id = %s",
                (patient_id,),
            )
            deleted = cur.rowcount
        conn.commit()
    
    return deleted


def get_embedding_stats(patient_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get statistics about stored embeddings.
    
    Args:
        patient_id: Optional patient to filter by
        
    Returns:
        Dict with count and document type breakdown
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            if patient_id:
                cur.execute(
                    """
                    SELECT document_type, COUNT(*) 
                    FROM document_embeddings 
                    WHERE patient_id = %s
                    GROUP BY document_type
                    """,
                    (patient_id,),
                )
            else:
                cur.execute(
                    """
                    SELECT document_type, COUNT(*) 
                    FROM document_embeddings 
                    GROUP BY document_type
                    """
                )
            type_counts = dict(cur.fetchall())
            
            if patient_id:
                cur.execute(
                    "SELECT COUNT(DISTINCT doc_id) FROM document_embeddings WHERE patient_id = %s",
                    (patient_id,),
                )
            else:
                cur.execute("SELECT COUNT(DISTINCT doc_id) FROM document_embeddings")
            doc_count = cur.fetchone()[0]
    
    return {
        "total_chunks": sum(type_counts.values()),
        "unique_documents": doc_count,
        "by_type": type_counts,
    }
