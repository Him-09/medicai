import os
import uuid
from typing import Set

from fastapi import HTTPException, UploadFile

ALLOWED_MIME: Set[str] = {
    "application/pdf",
    "image/png",
    "image/jpeg",
}

MAX_BYTES = 10 * 1024 * 1024

MIME_TO_EXT = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
}

def safe_save_upload(file: UploadFile, dest_dir: str) -> str:
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Allowed: {', '.join(ALLOWED_MIME)}"
        )
    
    os.makedirs(dest_dir, exist_ok=True)
    
    ext = MIME_TO_EXT.get(content_type, ".bin")
    filename = f"{uuid.uuid4().hex}{ext}"
    
    path = os.path.abspath(os.path.join(dest_dir, filename))
    if not path.startswith(os.path.abspath(dest_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    
    size = 0
    try:
        with open(path, "wb") as f:
            while True:
                chunk = file.file.read(1024 * 1024)
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
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass

def validate_upload(file: UploadFile) -> None:
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Allowed: {', '.join(ALLOWED_MIME)}"
        )
