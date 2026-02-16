# MedicAI - AI-Powered Medical Document Processing & Clinical Assistant

A production-ready medical document processing system that extracts, structures, indexes, and analyzes medical documents using AI. Built for healthcare professionals to streamline document processing and provide intelligent clinical insights with a complete REST API.

## 🌟 Features

### Document Processing
- 🏥 **Multi-Document Support**: Lab reports, radiology reports, prescriptions, clinical notes
- 🤖 **AI-Powered Extraction**: GPT-4o for text and vision-based document processing
- 📊 **Structured Output**: Standardized JSON format with patient IDs and document IDs
- 🔄 **Idempotent Processing**: Content-based document IDs prevent duplicates
- 🇫🇷 **French Medical Documents**: Optimized for French healthcare system

### Intelligent Analysis
- 🔍 **RAG-Enabled Search**: Semantic search across patient documents using FAISS
- 🤝 **Clinical AI Agent**: LangGraph-powered ReAct agent with persistent conversation memory
- 💬 **Persistent Chat**: PostgreSQL-backed conversation history per consultation
- 📈 **Trend Analysis**: Track lab values over time with automatic trend detection
- 🎯 **Abnormality Detection**: Automatic flagging of abnormal lab results
- 📋 **Consultation Prep**: Generate comprehensive pre-consultation summaries

### REST API (FastAPI)
- 🌐 **Complete REST API**: Production-ready endpoints for all features
- 📤 **Document Upload**: Upload and process medical documents via API
- 💬 **Chat Interface**: Conversational AI with memory persistence
- 📊 **Analytics Endpoints**: Lab trends, abnormal results, radiology conclusions
- 🔒 **CORS Support**: Configurable cross-origin resource sharing
- 📝 **OpenAPI Docs**: Auto-generated interactive API documentation

### Data Management
- 💾 **Dual Storage**: JSON file storage + PostgreSQL database
- 🔐 **Idempotent Processing**: SHA-256 content hashing prevents duplicates
- 🗄️ **Vector Indexing**: Patient-specific FAISS indexes for semantic retrieval
- 📊 **SQL Analytics**: Structured data stored in PostgreSQL for complex queries
- 🔄 **Conversation Memory**: Thread-based chat history with PostgreSQL checkpointing

## 🏗️ Architecture

```
medicai/
├── app/                        # FastAPI REST API
│   ├── main.py                 # FastAPI application entry point
│   ├── api/                    # API route handlers
│   │   ├── chat.py             # Chat/conversation endpoints
│   │   ├── patients.py         # Patient data endpoints
│   │   ├── documents.py        # Document upload endpoints
│   │   ├── actions.py          # Analytics endpoints
│   │   └── consultations.py    # Consultation management
│   ├── schemas/                # Pydantic request/response models
│   │   ├── chat.py
│   │   ├── patients.py
│   │   ├── documents.py
│   │   └── actions.py
│   └── services/               # Business logic layer
│       ├── agent_service.py    # AI agent with memory management
│       └── ingestion_service.py # Document processing service
│
├── src/medicai/
│   ├── ingestion/              # Document processing pipeline
│   │   ├── router_pipeline.py  # Main pipeline: classify & process documents
│   │   ├── lab_extract.py      # Lab report extraction (GPT-4o)
│   │   └── radiology_extract.py # Radiology report extraction
│   │
│   ├── storage/                # Persistence layer
│   │   ├── file_store.py       # JSON file storage
│   │   ├── postgres.py         # PostgreSQL connection
│   │   └── indexer_sql.py      # SQL indexing for structured data
│   │
│   ├── rag/                    # Retrieval-Augmented Generation
│   │   ├── indexer.py          # Build FAISS indexes per patient
│   │   └── retriever.py        # Semantic search in patient documents
│   │
│   ├── agent/                  # AI Clinical Agent
│   │   ├── core_agent.py       # LangGraph ReAct agent with memory
│   │   ├── langchain_tools.py  # Tool definitions for LangChain
│   │   ├── patient_tools.py    # Patient data retrieval functions
│   │   ├── patient_tools_sql.py # SQL-based patient queries
│   │   └── consultation_prep.py # Generate consultation summaries
│   │
│   ├── api/                    # (Legacy - migrated to /app)
│   ├── utils/                  # Utilities (logging, paths)
│   ├── config.py               # Configuration management
│   └── schemas.py              # Pydantic models
│
├── data/
│   ├── raw/                    # Original medical documents
│   └── processed/              # Extracted JSON documents
│
├── tests/                      # Unit tests
├── setup.py                    # Package configuration
└── docker-compose.yml          # PostgreSQL container

```

## 📦 Installation

### Prerequisites

- **Python 3.10+**
- **OpenAI API key** (required)
- **PostgreSQL 16** (for SQL storage and conversation memory)
- **Google Cloud account** (optional, for DocAI)

### Setup

1. **Clone the repository:**
```bash
git clone <repository-url>
cd Medicai
```

2. **Create virtual environment:**
```bash
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac
```

3. **Install the package:**
```bash
# Install in development mode with all dependencies
pip install -e .

# Or install from requirements
pip install -r requirements.txt

# API dependencies
pip install "uvicorn[standard]" fastapi python-multipart
```

4. **Configure environment variables:**
Create a `.env` file in the project root:
```bash
# OpenAI Configuration (Required)
OPENAI_API_KEY=sk-your-api-key-here
DEFAULT_TEXT_MODEL=gpt-4o
DEFAULT_VISION_MODEL=gpt-4o

# PostgreSQL Configuration (Required for API and agent memory)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/medicai

# Google Cloud (Optional)
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=eu
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000

# Logging
LOG_LEVEL=INFO
```

5. **Start PostgreSQL:**
```bash
docker-compose up -d
```

This starts PostgreSQL on `localhost:5432` with database `medicai`.

## 🚀 Quick Start

### 1. Start the API Server

```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at:
- **API Base**: http://localhost:8000
- **Interactive Docs**: http://localhost:8000/docs
- **OpenAPI Schema**: http://localhost:8000/openapi.json

### 2. Upload and Process Documents

**Using cURL:**
```bash
curl -X POST "http://localhost:8000/api/patients/patient1/documents:upload" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@path/to/lab_report.pdf"
```

**Using Python:**
```python
import requests

with open("lab_report.pdf", "rb") as f:
    response = requests.post(
        "http://localhost:8000/api/patients/patient1/documents:upload",
        files={"file": f}
    )

print(response.json())
# {
#   "patient_id": "patient1",
#   "doc_id": "abc123...",
#   "document_type": "lab",
#   "stored_processed_path": "data/processed/patient1_lab_abc123.json"
# }
```

### 3. Chat with the AI Agent

**Start a conversation:**
```bash
curl -X POST "http://localhost:8000/api/consultations/consult_123/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "patient1",
    "text": "What are the latest abnormal lab results?"
  }'
```

**Get conversation history:**
```bash
curl "http://localhost:8000/api/consultations/consult_123/messages"
```

**Python example:**
```python
import requests

# Chat with the agent
response = requests.post(
    "http://localhost:8000/api/consultations/consult_123/chat",
    json={
        "patient_id": "patient1",
        "text": "Summarize recent lab results and imaging"
    }
)

print(response.json()["reply"])

# Get full conversation history
history = requests.get(
    "http://localhost:8000/api/consultations/consult_123/messages"
).json()

for msg in history["messages"]:
    print(f"{msg['role']}: {msg['content']}")
```

### 4. Get Patient Analytics

**Abnormal labs:**
```bash
curl "http://localhost:8000/api/patients/patient1/labs:abnormal"
```

**Lab trend analysis:**
```bash
curl "http://localhost:8000/api/patients/patient1/labs:trend?test_name=CRP"
```

**Radiology conclusions:**
```bash
curl "http://localhost:8000/api/patients/patient1/radiology:conclusions"
```

**Patient snapshot:**
```bash
curl "http://localhost:8000/api/patients/patient1/snapshot"
```

**Consultation prep:**
```bash
curl -X POST "http://localhost:8000/api/patients/patient1/prep"
```

### 5. Process Documents via CLI

```bash
# Process a single document (image or PDF)
python -m medicai.ingestion.router_pipeline data/raw/patient1/lab_bio.jpeg

# Process all documents in a patient folder
python -m medicai.ingestion.router_pipeline data/raw/patient1/
```

**Output**: Structured JSON files in `data/processed/`

## 🌐 API Reference

### Chat & Consultations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/consultations/{id}/chat` | POST | Send message to AI agent |
| `/api/consultations/{id}/messages` | GET | Get conversation history |
| `/api/consultations/{id}:reset` | POST | Clear conversation memory |

### Patient Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patients/{id}/snapshot` | GET | Overall patient summary |
| `/api/patients/{id}/prep` | POST | Generate consultation prep |

### Documents

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patients/{id}/documents:upload` | POST | Upload medical document |

### Analytics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patients/{id}/labs:abnormal` | GET | Get abnormal lab results |
| `/api/patients/{id}/labs:trend` | GET | Get lab value trends |
| `/api/patients/{id}/radiology:conclusions` | GET | Get radiology conclusions |

### Health Check

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | API health status |

## 💬 Conversation Memory

The AI agent maintains persistent conversation history using PostgreSQL. Each conversation is identified by a `consultation_id`:

```python
# Call 1: Store information
POST /api/consultations/c123/chat
{
  "patient_id": "p1",
  "text": "Remember that this consultation is about anemia"
}

# Call 2: Agent recalls the context
POST /api/consultations/c123/chat
{
  "patient_id": "p1",
  "text": "What is this consultation about?"
}
# Response: "This consultation is about anemia..."

# Call 3: Different consultation_id = no memory
POST /api/consultations/c456/chat
{
  "patient_id": "p1",
  "text": "What is this consultation about?"
}
# Response: No memory of anemia
```

**Memory Management:**
- Conversations are stored per `consultation_id`
- History persists across server restarts
- Use `POST /{consultation_id}:reset` to clear memory
- Use `GET /{consultation_id}/messages` to retrieve history

## 📚 Python SDK Usage

### Build RAG Index for Patient

```python
from medicai.rag.indexer import build_index_for_patient

# Create FAISS index for semantic search
vectorstore = build_index_for_patient("patient1")
```

### Query Patient Data

```python
from medicai.agent.patient_tools import (
    get_abnormal_labs,
    get_lab_trend,
    get_radiology_conclusions,
    get_patient_snapshot
)

# Get all abnormal lab results
abnormal = get_abnormal_labs("patient1")

# Track a specific lab value over time
trend = get_lab_trend("patient1", "CRP")

# Get radiology report conclusions
radiology = get_radiology_conclusions("patient1")

# Get overall patient snapshot
snapshot = get_patient_snapshot("patient1")
```

### 4. Generate Consultation Prep Summary

```python
from medicai.agent.consultation_prep import generate_consultation_prep
from medicai.config import config

summary = generate_consultation_prep(
    str(config.DATA_PROCESSED_DIR),
    "patient1"
)
print(summary)
```

### 5. Use AI Clinical Agent

```python
from medicai.agent.core_agent import create_medical_agent

# Create agent with patient tools
agent = create_medical_agent()

# Ask clinical questions
result = agent.run({
    "patient_id": "patient1",
    "question": "Summarize abnormal labs and recent imaging findings."
})
```

## 📄 Document Processing

### Supported Document Types

| Type | Description | Extraction Method |
|------|-------------|-------------------|
| **Lab Reports** | Blood tests, urine analysis, biochemistry panels | GPT-4o text/vision |
| **Radiology Reports** | X-ray, CT, MRI, ultrasound reports | GPT-4o text/vision |
| **Prescriptions** | Medication prescriptions (ordonnances) | GPT-4o text/vision |
| **Clinical Notes** | Consultation notes, discharge summaries | GPT-4o text/vision |

### Processing Pipeline

1. **Classification**: Document type identified using GPT-4o
2. **Extraction**: Type-specific extraction with structured prompts
3. **Validation**: Pydantic schema validation
4. **Storage**: Save to JSON + PostgreSQL (if configured)
5. **Indexing**: SQL indexing for structured data

### Document Schema

All documents follow a standardized schema:

```python
{
  "schema_version": "1.0",
  "patient_id": "patient1",
  "doc_id": "34e02a8ed168117c",  # SHA-256 hash
  "document_type": "lab",
  "source": {
    "file_path": "data/raw/patient1/lab_bio.jpeg",
    "file_type": "image",
    "processed_at": "2025-12-22T10:30:00",
    "model_used": "gpt-4o"
  },
  "metadata": {
    "date_of_service": "2025-10-10",
    "panel_name": "BIOCHIMIE SANGUINE"
  },
  "text": "Human-readable summary...",
  "structured": {
    "panel_name": "BIOCHIMIE SANGUINE",
    "tests": [
      {
        "name": "CRP",
        "value": 2.1,
        "unit": "mg/L",
        "ref_low": null,
        "ref_high": 5.0,
        "flag": "normal",
        "source_text": "CRP: 2.1 mg/L (< 5.0)"
      }
    ]
  }
}
```

## 🤖 AI Clinical Agent

### Available Tools

The clinical agent has access to the following tools:

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_abnormal_labs` | Get all abnormal lab results | `patient_id` |
| `get_lab_trend` | Track lab value over time | `patient_id`, `test_name` |
| `get_radiology_conclusions` | Get imaging report conclusions | `patient_id` |
| `get_patient_snapshot` | Overall patient summary | `patient_id` |
| `patient_rag_search` | Semantic search in documents | `patient_id`, `query`, `k` |
| `consultation_prep` | Generate consultation summary | `patient_id` |

### Agent Safety Features

- ✅ **Data Summarization Only**: No diagnosis or treatment recommendations
- ✅ **Date References**: Always mentions document dates
- ✅ **Missing Data Handling**: Explicitly states when data is incomplete
- ✅ **Clinical Decision Warning**: Refuses inappropriate medical advice requests
- ✅ **Temperature 0**: Deterministic outputs for consistency

### Example Agent Usage

```python
from medicai.agent.core_agent import create_medical_agent

agent = create_medical_agent(model_name="gpt-4o-mini", temperature=0.0)

# Example questions the agent can answer:
questions = [
    "What are the patient's most recent abnormal lab values?",
    "Has the CRP been trending up or down over the past 3 months?",
    "Summarize the last radiology report findings.",
    "What should I review before this patient's consultation?",
    "Are there any concerning patterns in the lab results?"
]

for question in questions:
    result = agent.run({
        "patient_id": "patient1",
        "question": question
    })
    print(f"\nQ: {question}")
    print(f"A: {result}")
```

## 📊 Database Schema

### Tables

**`documents`** - All processed documents
```sql
- doc_id (PK)
- patient_id
- document_type
- date_of_service
- source_file_path
- processed_at
- payload (JSONB)
```

**`lab_results`** - Structured lab data
```sql
- id (PK)
- doc_id (FK)
- patient_id
- date_of_service
- panel_name
- test_name
- value
- unit
- ref_low, ref_high
- flag (low/normal/high)
```

**`radiology_reports`** - Structured radiology data
```sql
- id (PK)
- doc_id (FK)
- patient_id
- date_of_service
- type_examen
- contexte_clinique
- conclusion
```

## 🔬 Lab Report Features

### Extraction
- Test names with French medical terminology support
- Numeric values with unit detection
- Reference ranges (low-high bounds)
- Automatic abnormality flagging

### Trend Analysis
- Time-series tracking of lab values
- Automatic trend detection (increasing/decreasing/stable)
- Comparison of latest vs previous results
- Detection of newly abnormal or resolved abnormal values

### Example Lab Data

```python
{
  "name": "CRP",
  "value": 8.5,
  "unit": "mg/L",
  "ref_low": null,
  "ref_high": 5.0,
  "flag": "high",  # Automatically detected
  "source_text": "CRP: 8.5 mg/L (< 5.0)"
}
```

## 🏥 Radiology Report Features

### Extraction
- Contexte clinique (clinical context)
- Technique d'examen (examination technique)
- Résultats (findings)
- Conclusion (conclusion/impression)

### Example Radiology Data

```python
{
  "type_examen": "TDM ABDOMINALE",
  "contexte_clinique": "Douleurs abdominales",
  "technique_examen": "Scanner abdomino-pelvien avec injection",
  "resultats": "Foie de taille normale...",
  "conclusion": "Examen normal"
}
```

## 🔍 RAG (Retrieval-Augmented Generation)

### Building Vector Indexes

```python
from medicai.rag.indexer import build_index_for_patient

# Build FAISS index for a patient
vectorstore = build_index_for_patient(
    patient_id="patient1",
    save_path="data/vectorstores"
)
```

### Semantic Search

```python
from medicai.rag.retriever import rag_search

# Search patient documents
results = rag_search(
    patient_id="patient1",
    query="infections respiratoires récentes",
    k=5  # top 5 results
)

for doc in results:
    print(f"Document: {doc['doc_id']}")
    print(f"Date: {doc['date_of_service']}")
    print(f"Content: {doc['content'][:200]}...")
```

## 🧪 Testing

Run the test suite:

```bash
# Install dev dependencies
pip install -r requirements-dev.txt

# Run all tests
pytest

# Run with coverage
pytest --cov=medicai --cov-report=html

# Run specific test file
pytest tests/test_lab_extract.py
```

## 📝 Development Tools

### Code Quality

```bash
# Format code with Black
black src/

# Lint with Ruff
ruff check src/
```

## 🐳 Docker Support

Start PostgreSQL with Docker Compose:

```bash
# Start database
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop database
docker-compose down
```

## 📊 Example Workflows

### Complete Document Processing Workflow

```python
from pathlib import Path
from medicai.ingestion.router_pipeline import process_document
from medicai.storage.indexer_sql import index_all
from medicai.rag.indexer import build_index_for_patient

# 1. Process all documents for a patient
patient_dir = Path("data/raw/patient1")
for doc_path in patient_dir.glob("*"):
    if doc_path.is_file():
        process_document(str(doc_path))

# 2. Index in PostgreSQL (optional)
from medicai.storage.postgres import get_conn
with get_conn() as conn:
    index_all(conn, patient_id="patient1")

# 3. Build RAG index
vectorstore = build_index_for_patient("patient1")

print("✅ Patient documents fully processed and indexed")
```

### Clinical Analysis Workflow

```python
from medicai.agent.consultation_prep import generate_consultation_prep
from medicai.agent.patient_tools import get_abnormal_labs, get_lab_trend
from medicai.config import config

patient_id = "patient1"

# 1. Get consultation prep summary
prep = generate_consultation_prep(
    str(config.DATA_PROCESSED_DIR),
    patient_id
)
print("📋 Consultation Prep:")
print(prep)

# 2. Check abnormal labs
abnormal = get_abnormal_labs(patient_id)
print("\n⚠️ Abnormal Labs:")
for lab in abnormal:
    print(f"  - {lab['name']}: {lab['value']} {lab['unit']} [{lab['flag']}]")

# 3. Track specific values
crp_trend = get_lab_trend(patient_id, "CRP")
print("\n📈 CRP Trend:")
for point in crp_trend:
    print(f"  {point['date']}: {point['value']} {point['unit']}")
```

## 🔒 Security & Privacy

### Data Protection
- **Local Storage**: All data stored locally by default
- **No Cloud Storage**: Documents not sent to cloud unless explicitly configured
- **HIPAA Considerations**: Ensure compliance with local healthcare regulations
- **API Key Security**: Store OpenAI keys securely, never commit to version control

### Best Practices
1. Use environment variables for sensitive configuration
2. Restrict file system permissions on `data/` directories
3. Use secure PostgreSQL connections in production
4. Implement access controls for multi-user deployments
5. Regular security audits of dependencies

## 🛠️ Troubleshooting

### Common Issues

**OpenAI API Key Not Found**
```bash
# Set environment variable
export OPENAI_API_KEY=sk-your-key-here  # Linux/Mac
$env:OPENAI_API_KEY="sk-your-key-here"  # Windows PowerShell
```

**PostgreSQL Connection Failed**
```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart database
docker-compose restart db

# Check connection
psql postgresql://postgres:postgres@localhost:5432/medicai
```

**Module Import Errors**
```bash
# Ensure package is installed in development mode
pip install -e .

# Or add src to PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:$(pwd)/src"  # Linux/Mac
$env:PYTHONPATH="$env:PYTHONPATH;$(pwd)\src"  # Windows PowerShell
```

**FAISS Installation Issues**
```bash
# Use CPU version
pip install faiss-cpu

# For GPU support (requires CUDA)
pip install faiss-gpu
```

**API Server Issues**
```bash
# Check if port 8000 is already in use
netstat -ano | findstr :8000  # Windows
lsof -i :8000  # Linux/Mac

# Run on a different port
uvicorn app.main:app --reload --port 8001

# Check API health
curl http://localhost:8000/health
```

## 🗺️ Roadmap

### Current Status ✅
- [x] Document classification (lab, radiology, prescription, clinical_note)
- [x] Lab report extraction with structured data
- [x] Radiology report extraction
- [x] JSON and PostgreSQL storage
- [x] FAISS-based RAG retrieval
- [x] LangGraph AI agent with clinical tools
- [x] Consultation prep summary generation
- [x] Lab trend analysis
- [x] **FastAPI REST API with full CRUD operations**
- [x] **Document upload and processing via API**
- [x] **Conversational AI chat with persistent memory**
- [x] **PostgreSQL-backed conversation history**
- [x] **Analytics endpoints (labs, radiology, trends)**
- [x] **Interactive API documentation (OpenAPI/Swagger)**
- [x] **Interactive API documentation (OpenAPI/Swagger)**

### Planned Features 🚀
- [ ] Authentication and authorization (JWT, API keys)
- [ ] Role-based access control (RBAC)
- [ ] Real-time notifications via WebSockets
- [ ] Batch document processing
- [ ] Advanced RAG search with filters
- [ ] Prescription extraction enhancement
- [ ] Clinical note structured extraction
- [ ] Multi-patient dashboard UI
- [ ] Longitudinal health analytics
- [ ] Export to standard formats (FHIR, HL7)
- [ ] Web UI for document upload and review
- [ ] Multi-language support (English, Spanish)
- [ ] Integration with EHR systems
- [ ] Audit logging and compliance tracking

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow PEP 8 style guidelines
- Add unit tests for new features
- Update documentation for API changes
- Use type hints for function signatures
- Write descriptive commit messages

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **OpenAI**: GPT-4o for document extraction
- **LangChain**: Agent framework and tools
- **FAISS**: Vector similarity search
- **Pydantic**: Data validation and schemas
- **PostgreSQL**: Structured data storage

## 📧 Contact

For questions, issues, or suggestions:
- Open an issue on GitHub
- Contact the development team

## 📚 Additional Resources

### Documentation
- [LangChain Documentation](https://python.langchain.com/)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [FAISS Documentation](https://github.com/facebookresearch/faiss)
- [Pydantic Documentation](https://docs.pydantic.dev/)

### Related Projects
- Medical NLP libraries
- Healthcare data standards (FHIR, HL7)
- Clinical decision support systems

---

**⚠️ Medical Disclaimer**: This software is for research and development purposes only. It is not intended for clinical use without proper validation, regulatory approval, and integration with certified medical systems. Always consult qualified healthcare professionals for medical decisions.

**Built with ❤️ for Healthcare Innovation**

