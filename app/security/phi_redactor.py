# security/phi_redactor.py
"""
PHI (Protected Health Information) redaction for logging.
Ensures no PHI is accidentally logged in debug/info messages.

This module provides:
1. A logging filter that redacts sensitive patterns
2. Safe logging utilities for PHI-aware logging
3. Configuration for what patterns to redact
"""
import re
import logging
from typing import List, Tuple, Pattern
from functools import lru_cache


# Patterns to redact from logs
# Each tuple is (pattern, replacement, description)
PHI_PATTERNS: List[Tuple[str, str, str]] = [
    # Email addresses
    (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', 'email'),
    
    # Phone numbers (various formats)
    (r'\b(?:\+?212|0)[\s.-]?[5-7]\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}\b', '[PHONE]', 'moroccan_phone'),
    (r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b', '[PHONE]', 'us_phone'),
    (r'\b\+\d{1,3}[-.\s]?\d{6,14}\b', '[PHONE]', 'intl_phone'),
    
    # National ID / CIN (Morocco)
    (r'\b[A-Z]{1,2}\d{5,7}\b', '[CIN]', 'moroccan_cin'),
    
    # Social Security Numbers (if any US patients)
    (r'\b\d{3}-\d{2}-\d{4}\b', '[SSN]', 'ssn'),
    
    # Credit card numbers
    (r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b', '[CARD]', 'credit_card'),
    
    # Dates of birth (various formats) - be careful not to over-match
    (r'\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}\b', '[DOB]', 'dob_dmy'),
    (r'\b(?:19|20)\d{2}[/.-](?:0?[1-9]|1[0-2])[/.-](?:0?[1-9]|[12]\d|3[01])\b', '[DOB]', 'dob_ymd'),
    
    # Patient names after "patient" keyword (conservative)
    (r'(?i)patient[:\s]+["\']?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)["\']?', 'patient: [NAME]', 'patient_name'),
    
    # Names after common labels
    (r'(?i)(?:name|nom|patient_name)[:\s]*["\']?([A-Z][a-záàâäéèêëïîôùûüç]+(?:\s+[A-Z][a-záàâäéèêëïîôùûüç]+)+)["\']?', '[NAME]', 'labeled_name'),
    
    # IP addresses (not strictly PHI but good to redact in some contexts)
    (r'\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b', '[IP]', 'ip_address'),
    
    # Base64 encoded data (might contain sensitive info)
    (r'(?:[A-Za-z0-9+/]{4}){10,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?', '[BASE64_DATA]', 'base64'),
    
    # JWT tokens (sensitive)
    (r'eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*', '[JWT_TOKEN]', 'jwt'),
    
    # Passwords in URLs or logs
    (r'(?i)(?:password|pwd|passwd|secret)[=:\s]+[^\s&]+', '[PASSWORD_REDACTED]', 'password'),
]

# Compile patterns for efficiency
@lru_cache(maxsize=1)
def _get_compiled_patterns() -> List[Tuple[Pattern, str]]:
    """Compile all PHI patterns (cached)."""
    return [(re.compile(pattern), replacement) for pattern, replacement, _ in PHI_PATTERNS]


def redact_phi(text: str) -> str:
    """
    Redact PHI from a text string.
    
    Args:
        text: Input text that may contain PHI
        
    Returns:
        Text with PHI patterns replaced
    """
    if not text:
        return text
    
    result = str(text)
    for pattern, replacement in _get_compiled_patterns():
        result = pattern.sub(replacement, result)
    
    return result


class PHIRedactingFilter(logging.Filter):
    """
    Logging filter that redacts PHI from log messages.
    
    Usage:
        handler = logging.StreamHandler()
        handler.addFilter(PHIRedactingFilter())
        logger.addHandler(handler)
    """
    
    def filter(self, record: logging.LogRecord) -> bool:
        """Filter and redact PHI from log record."""
        # Redact the main message
        if record.msg:
            if isinstance(record.msg, str):
                record.msg = redact_phi(record.msg)
        
        # Redact arguments if they're strings
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: redact_phi(str(v)) if isinstance(v, str) else v
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, (list, tuple)):
                record.args = tuple(
                    redact_phi(str(arg)) if isinstance(arg, str) else arg
                    for arg in record.args
                )
        
        return True


class PHIRedactingHandler(logging.Handler):
    """
    Logging handler that wraps another handler and redacts PHI.
    
    Usage:
        base_handler = logging.StreamHandler()
        phi_handler = PHIRedactingHandler(base_handler)
        logger.addHandler(phi_handler)
    """
    
    def __init__(self, handler: logging.Handler):
        super().__init__()
        self.handler = handler
    
    def emit(self, record: logging.LogRecord):
        """Emit a record after redacting PHI."""
        # Create a copy to avoid modifying the original
        import copy
        redacted_record = copy.copy(record)
        
        # Redact the message
        if redacted_record.msg:
            redacted_record.msg = redact_phi(str(redacted_record.msg))
        
        # Redact arguments
        if redacted_record.args:
            if isinstance(redacted_record.args, dict):
                redacted_record.args = {
                    k: redact_phi(str(v)) if isinstance(v, str) else v
                    for k, v in redacted_record.args.items()
                }
            elif isinstance(redacted_record.args, (list, tuple)):
                redacted_record.args = tuple(
                    redact_phi(str(arg)) if isinstance(arg, str) else arg
                    for arg in redacted_record.args
                )
        
        self.handler.emit(redacted_record)
    
    def flush(self):
        self.handler.flush()
    
    def close(self):
        self.handler.close()


def configure_phi_safe_logging():
    """
    Configure the root logger to redact PHI from all log output.
    Call this at application startup.
    """
    root_logger = logging.getLogger()
    
    # Add PHI filter to all existing handlers
    for handler in root_logger.handlers:
        handler.addFilter(PHIRedactingFilter())
    
    # Configure app loggers
    for logger_name in ['app', 'medicai', 'uvicorn']:
        logger = logging.getLogger(logger_name)
        for handler in logger.handlers:
            handler.addFilter(PHIRedactingFilter())


# Safe logging utilities
def safe_log_patient_action(logger: logging.Logger, action: str, patient_id: str, **kwargs):
    """
    Safely log a patient-related action without exposing PHI.
    
    Args:
        logger: Logger instance
        action: Action being performed
        patient_id: Patient identifier (will be partially masked)
        **kwargs: Additional context (will be redacted)
    """
    # Mask patient ID (show first 8 chars only)
    masked_id = patient_id[:8] + "..." if len(patient_id) > 8 else patient_id
    
    # Redact any additional kwargs
    safe_kwargs = {k: redact_phi(str(v)) for k, v in kwargs.items()}
    
    logger.info(f"{action} for patient {masked_id}", extra=safe_kwargs)


def safe_log_document_action(logger: logging.Logger, action: str, doc_id: str, patient_id: str = None):
    """
    Safely log a document-related action.
    """
    masked_doc = doc_id[:12] + "..." if len(doc_id) > 12 else doc_id
    masked_patient = patient_id[:8] + "..." if patient_id and len(patient_id) > 8 else patient_id
    
    if masked_patient:
        logger.info(f"{action} document {masked_doc} for patient {masked_patient}")
    else:
        logger.info(f"{action} document {masked_doc}")
