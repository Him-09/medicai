from __future__ import annotations

from typing import List, Dict, Any, Optional
from pathlib import Path

from medicai.storage.file_store import FileStore
from medicai.schemas import LabDocument, RadiologyDocument, AnyDocument

from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings


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
    return doc.text or (
        f"{doc.structured.contexte_clinique}\n\n"
        f"{doc.structured.technique_examen}\n\n"
        f"{doc.structured.resultats}\n\n"
        f"{doc.structured.conclusion}"
    )


def build_index_for_patient(
    patient_id: str,
    save_path: str = "data/vectorstores"
) -> FAISS:
    """
    Build a FAISS index for a single patient using all their documents.
    """
    docs: List[AnyDocument] = store.load_by_patient(patient_id)

    texts = []
    metadatas = []

    for doc in docs:

        if isinstance(doc, RadiologyDocument):
            text = _radiology_to_text(doc)
        elif isinstance(doc, LabDocument):
            text = _lab_to_text(doc)
        else:
            # for 'other' doc types later:
            text = doc.text or ""

        if not text or text.strip() == "":
            continue

        cleaned = text.strip()

        texts.append(cleaned)
        metadatas.append({
            "patient_id": patient_id,
            "doc_id": doc.doc_id,
            "document_type": doc.document_type,
            "date_of_service": (
                doc.metadata.date_of_service.isoformat()
                if doc.metadata.date_of_service else None
            ),
        })

    embeddings = OpenAIEmbeddings()
    vectorstore = FAISS.from_texts(texts, embeddings, metadatas=metadatas)

    # save
    Path(save_path).mkdir(parents=True, exist_ok=True)
    vectorstore.save_local(f"{save_path}/{patient_id}")

    return vectorstore
