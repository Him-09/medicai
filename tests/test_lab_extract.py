"""
Test lab extraction functionality.
"""

import pytest
from medicai.ingestion.lab_extract import extract_labs_from_text


def test_extract_labs_basic():
    """Test basic lab extraction from text."""
    sample_text = """
    BIOCHIMIE SANGUINE
    Date: 2025-10-10
    
    CRP 2.1 mg/L (< 5.0)
    Ferritine 132 ng/mL (11-306.8)
    """
    
    result = extract_labs_from_text(sample_text)
    
    assert "tests" in result
    assert isinstance(result["tests"], list)
    # Add more assertions based on expected structure


if __name__ == "__main__":
    pytest.main([__file__])
