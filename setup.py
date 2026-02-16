"""
Setup configuration for MedicAI package.
"""

from setuptools import setup, find_packages

setup(
    name="medicai",
    version="0.1.0",
    description="AI-powered medical document processing and clinical assistant",
    author="Your Name",
    author_email="your.email@example.com",
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    python_requires=">=3.10",
    install_requires=[
        "google-cloud-documentai>=2.18.0",
        "google-cloud-core>=2.3.3",
        "google-api-core>=2.14.0",
        "pdfplumber>=0.11.0",
        "pdf2image>=1.16.3",
        "pillow>=10.0.0",
        "openai>=1.6.1",
        "pydantic>=2.0.0",
        "langchain>=0.1.0",
        "langchain-core>=0.1.0",
        "langchain-community>=0.0.20",
        "langchain-openai>=0.0.5",
        "langgraph>=0.1.0",
        "langgraph-checkpoint-postgres>=1.0.0",
        "faiss-cpu>=1.7.4",
        "psycopg>=3.1.0",
        "python-dotenv>=1.0.0",
        "pytesseract>=0.3.10",
        "opencv-python>=4.8.0.0",
        "rich>=13.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-cov>=4.1.0",
            "black>=23.0.0",
            "ruff>=0.1.0",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Healthcare Industry",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
