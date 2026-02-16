"""
router_pipeline.py

Medical document classification and processing pipeline.

Step 1: Classify document type (lab, radiology, prescription, clinical_note, other)
Step 2: Process based on classification

Usage:
    python -m medicai.ingestion.router_pipeline data/raw/patient1/lab_bio.jpeg
"""

import sys
from typing import Union
from datetime import datetime

import pdfplumber

from medicai.config import config
from medicai.storage.file_store import FileStore
from medicai.utils.logging import logger
from medicai.utils.paths import generate_doc_id, extract_patient_id_from_path, is_pdf, is_image
from medicai.ingestion.lab_extract import extract_labs_from_text, extract_labs_from_image_file
from medicai.ingestion.radiology_extract import extract_radiology_from_text, extract_radiology_from_image
from medicai.ingestion.prescription_extract import extract_prescription_from_text, extract_prescription_from_image_file
from medicai.schemas import (
    LabDocument, RadiologyDocument, PrescriptionDocument, BaseDocument,
    LabMetadata, RadiologyMetadata, PrescriptionMetadata, BaseMetadata,
    LabStructured, RadiologyStructured, PrescriptionStructured,
    SourceInfo, LabTest, MedicationItem, DocumentType
)

from medicai.storage.postgres import ping_db
from medicai.storage.indexer_sql import index_document


client = config.get_openai_client()


def extract_text_from_pdf(path: str) -> str:
    texts = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            texts.append(page.extract_text() or "")
    return "\n\n".join(texts)


def classify_document_from_text(text: str, model: str = None) -> DocumentType:
    """Classify document type based on text content."""
    if model is None:
        model = config.DEFAULT_TEXT_MODEL
    system_msg = (
        "You are a medical document classifier. "
        "Classify the document into ONE of these categories: "
        "lab, radiology, prescription, clinical_note, other"
    )
    
    user_msg = f"""
Classify this medical document into ONE category:

Categories:
- "lab": Laboratory/biological analysis results (blood tests, urine tests, etc.)
- "radiology": Imaging reports (X-ray, CT, MRI, ultrasound, etc.)
- "prescription": Medication prescriptions or ordonnances
- "clinical_note": Clinical notes, consultation reports, discharge summaries
- "other": Any other medical document

Document text (first 2000 chars):
{text[:2000]}

Respond with ONLY the category name (lab, radiology, prescription, clinical_note, or other).
"""
    
    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
    )
    
    classification = resp.choices[0].message.content.strip().lower()
    valid_types = ["lab", "radiology", "prescription", "clinical_note", "other"]
    return classification if classification in valid_types else "other"


def classify_document_from_image(image_path: str, model: str = None) -> DocumentType:
    """Classify document type based on image content using vision."""
    if model is None:
        model = config.DEFAULT_VISION_MODEL
    
    import base64
    
    with open(image_path, "rb") as f:
        img_bytes = f.read()
    
    b64_image = base64.b64encode(img_bytes).decode('utf-8')
    
    system_msg = (
        "You are a medical document classifier. "
        "Classify the document into ONE of these categories: "
        "lab, radiology, prescription, clinical_note, other"
    )
    
    user_msg = """
Look at this medical document image and classify it into ONE category:

Categories:
- "lab": Laboratory/biological analysis results (blood tests, urine tests, etc.)
- "radiology": Imaging reports (X-ray, CT, MRI, ultrasound, échographie, etc.)
- "prescription": Medication prescriptions or ordonnances
- "clinical_note": Clinical notes, consultation reports, discharge summaries
- "other": Any other medical document

Respond with ONLY the category name (lab, radiology, prescription, clinical_note, or other).
"""
    
    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[
            {"role": "system", "content": system_msg},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_msg},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"}
                    },
                ],
            },
        ],
    )
    
    classification = resp.choices[0].message.content.strip().lower()
    valid_types = ["lab", "radiology", "prescription", "clinical_note", "other"]
    return classification if classification in valid_types else "other"


def process_document(path: str, model: str = None) -> Union[LabDocument, RadiologyDocument, BaseDocument]:
    """
    Main pipeline:
      1. Classify document type
      2. Process based on type
      3. Return validated Pydantic document model
    """
    if model is None:
        model = config.DEFAULT_TEXT_MODEL
    
    file_type = "pdf" if is_pdf(path) else "image"
    timestamp = datetime.now()
    
    # Generate patient ID
    patient_id = extract_patient_id_from_path(path)
    
    # Step 1: Classify document and generate deterministic doc_id
    if is_pdf(path):
        raw_text = extract_text_from_pdf(path)
        doc_type = classify_document_from_text(raw_text, model=model)
        # Generate doc_id from extracted text for PDFs (idempotent)
        doc_id = generate_doc_id(path, text_content=raw_text)
        logger.info(f"{path} -> PDF -> Classified as: {doc_type}")
    elif is_image(path):
        # Read file bytes for doc_id generation
        with open(path, 'rb') as f:
            file_bytes = f.read()
        doc_type = classify_document_from_image(path, model=model)
        # Generate doc_id from file bytes for images (idempotent)
        doc_id = generate_doc_id(path, file_content=file_bytes)
        logger.info(f"{path} -> Image -> Classified as: {doc_type}")
        raw_text = None
    else:
        raise ValueError(f"Unsupported file type: {path}")
    
    # Create source info
    source = SourceInfo(
        file_path=path,
        file_type=file_type,
        processed_at=timestamp,
        model_used=model
    )
    
    # Step 2: Process based on classification
    if doc_type == "lab":
        # Process lab documents
        if is_pdf(path):
            extracted_dict = extract_labs_from_text(raw_text, model=model)
            pdf_text = raw_text
        else:
            extracted_dict = extract_labs_from_image_file(path, model=model)
            pdf_text = None
        
        # Convert extracted dict to Pydantic models
        tests = [LabTest(**test) for test in extracted_dict.get("tests", [])]
        
        # Generate human-readable text summary for RAG
        lab_text_parts = []
        panel_name = extracted_dict.get("panel_name", "ANALYSES BIOLOGIQUES")
        date_str = extracted_dict.get("date_of_service", "date inconnue")
        
        lab_text_parts.append(f"{panel_name} du {date_str}:")
        
        for test in tests:
            # Build reference range string
            if test.ref_low is not None and test.ref_high is not None:
                ref_str = f"({test.ref_low}–{test.ref_high})"
            elif test.ref_high is not None:
                ref_str = f"(< {test.ref_high})"
            elif test.ref_low is not None:
                ref_str = f"(> {test.ref_low})"
            else:
                ref_str = ""
            
            # Build test line
            value_str = f"{test.value} {test.unit}" if test.value is not None else "non disponible"
            flag_str = f"– {test.flag}" if test.flag != "unknown" else ""
            
            test_line = f"{test.name} {value_str} {ref_str} {flag_str}".strip()
            lab_text_parts.append(test_line)
        
        rag_text = "; ".join(lab_text_parts)
        
        # Create validated LabDocument
        return LabDocument(
            patient_id=patient_id,
            doc_id=doc_id,
            document_type="lab",
            source=source,
            metadata=LabMetadata(
                date_of_service=extracted_dict.get("date_of_service"),
                panel_name=extracted_dict.get("panel_name")
            ),
            text=pdf_text or rag_text,  # Use PDF text if available, otherwise RAG summary
            structured=LabStructured(
                panel_name=extracted_dict.get("panel_name"),
                tests=tests
            )
        )
        
    elif doc_type == "radiology":
        # Process radiology reports
        if is_pdf(path):
            radiology_dict = extract_radiology_from_text(raw_text, model=model)
            pdf_text = raw_text
        else:
            radiology_dict = extract_radiology_from_image(path, model=model)
            pdf_text = None
        
        # Combine text sections
        text_sections = []
        if radiology_dict.get("contexte_clinique"):
            text_sections.append(f"CONTEXTE CLINIQUE:\n{radiology_dict['contexte_clinique']}")
        if radiology_dict.get("technique_examen"):
            text_sections.append(f"TECHNIQUE D'EXAMEN:\n{radiology_dict['technique_examen']}")
        if radiology_dict.get("resultats"):
            text_sections.append(f"RÉSULTATS:\n{radiology_dict['resultats']}")
        if radiology_dict.get("conclusion"):
            text_sections.append(f"CONCLUSION:\n{radiology_dict['conclusion']}")
        
        structured_text = "\n\n".join(text_sections) if text_sections else None
        
        # Create validated RadiologyDocument
        return RadiologyDocument(
            patient_id=patient_id,
            doc_id=doc_id,
            document_type="radiology",
            source=source,
            metadata=RadiologyMetadata(
                date_of_service=radiology_dict.get("date_of_service"),
                type_examen=radiology_dict.get("type_examen")
            ),
            text=pdf_text or structured_text,
            structured=RadiologyStructured(
                contexte_clinique=radiology_dict.get("contexte_clinique"),
                technique_examen=radiology_dict.get("technique_examen"),
                resultats=radiology_dict.get("resultats"),
                conclusion=radiology_dict.get("conclusion")
            )
        )
    
    elif doc_type == "prescription":
        # Process prescription documents
        if is_pdf(path):
            prescription_dict = extract_prescription_from_text(raw_text, model=model)
            pdf_text = raw_text
        else:
            prescription_dict = extract_prescription_from_image_file(path, model=model)
            pdf_text = None
        
        # Convert extracted dict to Pydantic models
        items = [MedicationItem(**item) for item in prescription_dict.get("items", [])]
        
        # Generate human-readable text summary for RAG
        rx_text_parts = []
        date_str = prescription_dict.get("date_of_service", "date inconnue")
        prescriber = prescription_dict.get("prescriber_full_name", "Prescripteur non spécifié")
        
        rx_text_parts.append(f"Ordonnance du {date_str} par {prescriber}:")
        
        for item in items:
            # Build medication line for RAG
            parts = []
            
            if item.drug_name:
                parts.append(item.drug_name)
            
            if item.strength_or_concentration:
                parts.append(item.strength_or_concentration)
            
            # Add dose and frequency
            dose_freq = []
            if item.dose:
                dose_freq.append(item.dose)
            if item.frequency:
                dose_freq.append(item.frequency)
            if dose_freq:
                parts.append(" ".join(dose_freq))
            
            # Add duration
            if item.duration:
                parts.append(f"({item.duration})")
            
            # Add instructions if present
            if item.instructions:
                parts.append(f"— {item.instructions}")
            
            # If structured parts are missing but as_written exists, use that
            if not parts and item.as_written:
                med_line = item.as_written
            else:
                med_line = " ".join(parts) if parts else "Médicament non spécifié"
            
            rx_text_parts.append(med_line)
        
        rag_text = "; ".join(rx_text_parts)
        
        # Create validated PrescriptionDocument
        return PrescriptionDocument(
            patient_id=patient_id,
            doc_id=doc_id,
            document_type="prescription",
            source=source,
            metadata=PrescriptionMetadata(
                date_of_service=prescription_dict.get("date_of_service"),
                prescriber_full_name=prescription_dict.get("prescriber_full_name"),
                prescriber_specialty=prescription_dict.get("prescriber_specialty"),
                patient_full_name=prescription_dict.get("patient_full_name")
            ),
            text=pdf_text or rag_text,
            structured=PrescriptionStructured(
                items=items,
                additional_notes=prescription_dict.get("additional_notes"),
                warnings=prescription_dict.get("warnings", [])
            )
        )
            
    else:  # clinical_note, other
        # For unprocessed types, return BaseDocument
        return BaseDocument(
            patient_id=patient_id,
            doc_id=doc_id,
            document_type=doc_type,
            source=source,
            metadata=BaseMetadata(
                date_of_service=None,
                note=f"{doc_type.replace('_', ' ').title()} - requires specialized processing"
            ),
            text=raw_text if is_pdf(path) else None,
            structured={}
        )


if __name__ == "__main__":
    import json
    
    if len(sys.argv) < 2:
        logger.info("Usage: python -m medicai.ingestion.router_pipeline path/to/document.pdf|document.jpeg [model]")
        logger.info("\nExample:")
        logger.info("  python -m medicai.ingestion.router_pipeline data/raw/patient1/lab_bio.jpeg")
        logger.info(f"  python -m medicai.ingestion.router_pipeline data/raw/patient1/report.pdf {config.DEFAULT_TEXT_MODEL}")
        raise SystemExit

    file_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) >= 3 else None
    
    # Process document (returns validated Pydantic model)
    document = process_document(file_path, model=model)
    
    # Save using FileStore
    store = FileStore()
    output_path = store.save(document)
    logger.info(f"Saved to: {output_path}")

    # Write-through index to Postgres (best effort)
    if ping_db():
        try:
            index_document(document)
            logger.info("Indexed document into Postgres")
        except Exception as e:
            logger.warning(f"Postgres indexing failed (FileStore is still canonical): {e}")
    else:
        logger.info("Postgres not reachable; skipped indexing (FileStore remains canonical)")

    
    # Print preview to console (truncate text field for readability)
    preview_dict = document.model_dump(mode='json')
    if preview_dict.get("text") and len(preview_dict["text"]) > 400:
        preview_dict["text"] = preview_dict["text"][:400] + "..."
    
    print("\n=== Processing Result ===")
    print(json.dumps(preview_dict, indent=2, ensure_ascii=False))
