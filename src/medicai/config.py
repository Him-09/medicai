import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

class Config:
    
    PROJECT_ROOT = Path(__file__).parent.parent.parent
    DATA_DIR = PROJECT_ROOT / "data"
    DATA_RAW_DIR = DATA_DIR / "raw"
    DATA_PROCESSED_DIR = DATA_DIR / "processed"
    
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    DEFAULT_TEXT_MODEL: str = os.getenv("DEFAULT_TEXT_MODEL", "gpt-4o")
    DEFAULT_VISION_MODEL: str = os.getenv("DEFAULT_VISION_MODEL", "gpt-4o")
    
    GCP_PROJECT_ID: Optional[str] = os.getenv("GCP_PROJECT_ID")
    GCP_LOCATION: str = os.getenv("GCP_LOCATION", "eu")
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    
    MIN_TEXT_CHARS_FOR_TEXT_PDF: int = 60
    
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    
    @classmethod
    def get_openai_client(cls) -> OpenAI:
        if not cls.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not set in environment")
        return OpenAI(api_key=cls.OPENAI_API_KEY)
    
    @classmethod
    def ensure_dirs(cls):
        cls.DATA_RAW_DIR.mkdir(parents=True, exist_ok=True)
        cls.DATA_PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

config = Config()

config.ensure_dirs()
