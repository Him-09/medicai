"""
File-based document storage.

Stores processed documents as JSON files in the processed directory.
Works with Pydantic models for type safety.
"""

import json
from pathlib import Path
from typing import List, Optional, Union

from medicai.config import config
from medicai.utils.logging import logger
from medicai.schemas import AnyDocument, LabDocument, RadiologyDocument, PrescriptionDocument, BaseDocument


class FileStore:
    """Simple file-based document store with Pydantic validation."""
    
    def __init__(self, storage_dir: Path = None):
        """
        Initialize file store.
        
        Args:
            storage_dir: Directory to store JSON files (defaults to config.DATA_PROCESSED_DIR)
        """
        self.storage_dir = storage_dir or config.DATA_PROCESSED_DIR
        self.storage_dir.mkdir(parents=True, exist_ok=True)
    
    def save(self, document: Union[LabDocument, RadiologyDocument, PrescriptionDocument, BaseDocument]) -> Path:
        """
        Save document to JSON file organized by patient_id.
        
        Args:
            document: Pydantic document model instance
            
        Returns:
            Path to saved file
        """
        # Create patient-specific directory
        patient_dir = self.storage_dir / document.patient_id
        patient_dir.mkdir(parents=True, exist_ok=True)
        
        # Save file in patient directory
        filename = f"{document.patient_id}_{document.document_type}_{document.doc_id}.json"
        filepath = patient_dir / filename
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(document.model_dump(mode='json'), f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved document to {filepath}")
        return filepath
    
    def load(self, doc_id: str) -> Optional[AnyDocument]:
        """
        Load document by ID.
        
        Args:
            doc_id: Document ID
            
        Returns:
            Validated Pydantic document or None if not found
        """
        # Search for file containing doc_id in all patient folders
        matches = list(self.storage_dir.glob(f"*/*_{doc_id}.json"))
        
        if not matches:
            return None
        
        if len(matches) > 1:
            logger.warning(f"Multiple files found for doc_id '{doc_id}': {[m.name for m in matches]}. Returning first match.")
        
        filepath = matches[0]
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Use discriminated union to parse correct type
            doc_type = data.get("document_type")
            if doc_type == "lab":
                return LabDocument(**data)
            elif doc_type == "radiology":
                return RadiologyDocument(**data)
            elif doc_type == "prescription":
                return PrescriptionDocument(**data)
            else:
                return BaseDocument(**data)
    
    def load_by_patient(self, patient_id: str) -> List[AnyDocument]:
        """
        Load all documents for a patient.
        
        Args:
            patient_id: Patient ID
            
        Returns:
            List of validated Pydantic documents (skips corrupted files with warning)
        """
        documents = []
        patient_dir = self.storage_dir / patient_id
        
        if not patient_dir.exists():
            return documents
            
        for filepath in patient_dir.glob(f"{patient_id}_*.json"):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    doc_type = data.get("document_type")
                    if doc_type == "lab":
                        documents.append(LabDocument(**data))
                    elif doc_type == "radiology":
                        documents.append(RadiologyDocument(**data))
                    elif doc_type == "prescription":
                        documents.append(PrescriptionDocument(**data))
                    else:
                        documents.append(BaseDocument(**data))
            except Exception as e:
                logger.warning(f"Failed to load {filepath.name}: {e}. Skipping.")
                continue
        return documents
    
    def list_all(self) -> List[AnyDocument]:
        """
        List all documents in storage.
        
        Returns:
            List of all validated Pydantic documents (skips corrupted files with warning)
        """
        documents = []
        # Search all patient folders for JSON files
        for filepath in self.storage_dir.glob("*/*.json"):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    doc_type = data.get("document_type")
                    if doc_type == "lab":
                        documents.append(LabDocument(**data))
                    elif doc_type == "radiology":
                        documents.append(RadiologyDocument(**data))
                    elif doc_type == "prescription":
                        documents.append(PrescriptionDocument(**data))
                    else:
                        documents.append(BaseDocument(**data))
            except Exception as e:
                logger.warning(f"Failed to load {filepath.name}: {e}. Skipping.")
                continue
        return documents
    
    def delete(self, doc_id: str) -> bool:
        """
        Delete document by ID.
        
        Args:
            doc_id: Document ID
            
        Returns:
            True if deleted, False if not found
        """
        matches = list(self.storage_dir.glob(f"*/*_{doc_id}.json"))
        
        if not matches:
            logger.warning(f"No document found with doc_id '{doc_id}' to delete")
            return False
        
        if len(matches) > 1:
            logger.warning(f"Multiple files found for doc_id '{doc_id}'. Deleting all {len(matches)} matches.")
        
        for filepath in matches:
            filepath.unlink()
            logger.info(f"Deleted {filepath.name}")
        
        return True
    
    def load_with_path(self, doc_id: str) -> tuple[Optional[AnyDocument], Optional[Path]]:
        """
        Load document by ID and return both document and file path.
        Useful for debugging and tools.
        
        Args:
            doc_id: Document ID
            
        Returns:
            Tuple of (document, filepath) or (None, None) if not found
        """
        matches = list(self.storage_dir.glob(f"*/*_{doc_id}.json"))
        
        if not matches:
            return None, None
        
        if len(matches) > 1:
            logger.warning(f"Multiple files found for doc_id '{doc_id}': {[m.name for m in matches]}. Returning first match.")
        
        filepath = matches[0]
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            doc_type = data.get("document_type")
            if doc_type == "lab":
                return LabDocument(**data), filepath
            elif doc_type == "radiology":
                return RadiologyDocument(**data), filepath
            else:
                return BaseDocument(**data), filepath
