import hashlib
from pathlib import Path
from typing import Optional

def generate_doc_id(file_path: str, file_content: bytes = None, text_content: str = None) -> str:
    if file_content is not None:
        return hashlib.sha256(file_content).hexdigest()[:16]
    elif text_content is not None:
        return hashlib.sha256(text_content.encode('utf-8')).hexdigest()[:16]
    else:
        with open(file_path, 'rb') as f:
            content = f.read()
        return hashlib.sha256(content).hexdigest()[:16]

def extract_patient_id_from_path(file_path: str) -> str:
    parts = file_path.replace("\\", "/").split("/")
    for part in parts:
        if part.startswith("patient"):
            return part
    return "unknown"

def is_pdf(path: str) -> bool:
    return path.lower().endswith(".pdf")

def is_image(path: str) -> bool:
    return path.lower().endswith((".jpg", ".jpeg", ".png", ".tif", ".tiff"))
