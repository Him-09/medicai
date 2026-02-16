"""
Logging configuration for MedicAI.
"""

import logging
import sys
from pathlib import Path
from medicai.config import config


def setup_logging(name: str = "medicai") -> logging.Logger:
    """
    Setup logging with consistent format.
    
    Args:
        name: Logger name
        
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, config.LOG_LEVEL))
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, config.LOG_LEVEL))
    
    # Format
    formatter = logging.Formatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(formatter)
    
    # Add handler
    if not logger.handlers:
        logger.addHandler(console_handler)
    
    return logger


# Default logger
logger = setup_logging()
