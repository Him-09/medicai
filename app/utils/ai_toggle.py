# ai_toggle.py
"""
AI processing toggle for MedicAI.
Allows clinic-level control over AI features.
"""
import os
from fastapi import HTTPException

# Read from environment, default to enabled
AI_ENABLED = os.getenv("AI_ENABLED", "true").lower() == "true"


def is_ai_enabled() -> bool:
    """Check if AI processing is currently enabled."""
    return AI_ENABLED


def ensure_ai_enabled() -> None:
    """
    Guard function to check if AI is enabled before processing.
    
    Raises:
        HTTPException 403: If AI processing is disabled
        
    Usage:
        ensure_ai_enabled()
        # Then call OpenAI/LLM
    """
    if not AI_ENABLED:
        raise HTTPException(
            status_code=403,
            detail="AI processing is disabled by clinic settings. Contact your administrator."
        )


def get_ai_status() -> dict:
    """
    Get current AI processing status.
    
    Returns:
        Dict with enabled status and configuration info
    """
    return {
        "ai_enabled": AI_ENABLED,
        "env_var": "AI_ENABLED",
        "current_value": os.getenv("AI_ENABLED", "true"),
    }
