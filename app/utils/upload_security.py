# upload_security.py
"""
Secure file upload utilities for MedicAI.
Prevents path traversal, restricts file types, and limits file sizes.
"""
import os
import uuid
from typing import Set

from fastapi import HTTPException, UploadFile

# Allowed MIME types for medical documents
ALLOWED_MIME: Set[str] = {
    "application/pdf",
    "image/png",
    "image/jpeg",
}

# Maximum file size (10MB)
MAX_BYTES = 10 * 1024 * 1024

# MIME type to extension mapping
MIME_TO_EXT = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
}


def safe_save_upload(file: UploadFile, dest_dir: str) -> str:
    """
    Safely save an uploaded file with security checks.
    
    This function:
    - Validates MIME type against allowlist
    - Generates a random UUID filename (ignores user filename)
    - Enforces file size limits
    - Prevents path traversal attacks
    
    Args:
        file: FastAPI UploadFile object
        dest_dir: Destination directory (absolute path recommended)
        
    Returns:
        Absolute path to the saved file
        
    Raises:
        HTTPException 400: Unsupported file type
        HTTPException 413: File too large
    """
    # Validate MIME type
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Allowed: {', '.join(ALLOWED_MIME)}"
        )
    
    # Create destination directory if needed
    os.makedirs(dest_dir, exist_ok=True)
    
    # Generate safe filename using UUID (ignore user-provided filename)
    ext = MIME_TO_EXT.get(content_type, ".bin")
    filename = f"{uuid.uuid4().hex}{ext}"
    
    # Ensure path is within dest_dir (prevent traversal)
    path = os.path.abspath(os.path.join(dest_dir, filename))
    if not path.startswith(os.path.abspath(dest_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    
    # Write file with size limit check
    size = 0
    try:
        with open(path, "wb") as f:
            while True:
                chunk = file.file.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_BYTES:
                    f.close()
                    _safe_remove(path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size: {MAX_BYTES // (1024*1024)}MB"
                    )
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        _safe_remove(path)
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    return path


def _safe_remove(path: str) -> None:
    """Safely remove a file, ignoring errors."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


def validate_upload(file: UploadFile) -> None:
    """
    Validate an upload without saving it.
    
    Args:
        file: FastAPI UploadFile object
        
    Raises:
        HTTPException 400: If file type is not allowed
    """
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Allowed: {', '.join(ALLOWED_MIME)}"
        )
