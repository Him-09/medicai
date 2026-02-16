# pgvector_retriever.py
"""
pgvector-based document retrieval for MedicAI.
Safe replacement for FAISS that uses PostgreSQL pgvector.
"""
from __future__ import annotations

from typing import List, Dict, Any

from medicai.rag.pgvector_store import search_patient_documents


def rag_search(patient_id: str, query: str, k: int = 5) -> List[Dict[str, Any]]:
    """
    Perform semantic search on the patient's indexed documents using pgvector.
    
    This is a drop-in replacement for the FAISS-based rag_search function.
    
    Args:
        patient_id: Patient identifier
        query: Search query text
        k: Number of results to return
        
    Returns:
        A list of dict entries with:
        - text (retrieved chunk)
        - metadata (doc_id, document_type, date_of_service, similarity)
    """
    results = search_patient_documents(patient_id, query, k=k)
    
    return [
        {
            "text": r["text"],
            "metadata": {
                "patient_id": patient_id,
                "doc_id": r["doc_id"],
                "document_type": r["document_type"],
                "date_of_service": r["date_of_service"],
                "similarity": r["similarity"],
            },
        }
        for r in results
    ]


def search_with_context(
    patient_id: str,
    query: str,
    k: int = 5
) -> Dict[str, Any]:
    """
    Perform search and return results with formatted context.
    
    Args:
        patient_id: Patient identifier
        query: Search query text
        k: Number of results to return
        
    Returns:
        Dict with results list and formatted context string
    """
    results = rag_search(patient_id, query, k=k)
    
    # Format context for LLM consumption
    context_parts = []
    for i, r in enumerate(results, 1):
        meta = r["metadata"]
        context_parts.append(
            f"[Source {i}] {meta.get('document_type', 'unknown')} "
            f"({meta.get('date_of_service', 'no date')})\n{r['text']}"
        )
    
    return {
        "results": results,
        "context": "\n\n---\n\n".join(context_parts),
        "query": query,
        "patient_id": patient_id,
    }
