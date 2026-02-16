"""
MedicAI Voice Agent Worker

This is the LiveKit Agents worker that handles voice interactions.
It supports two modes:
- Assistant: STT → LLM → TTS (full voice chat with patient context)
- Scribe: STT only (continuous transcription for notes)

Run with:
    python -m agent.main dev
    # or for production:
    python -m agent.main start
"""

import asyncio
import json
import os
import logging
import httpx
from typing import Optional, Dict, Any
from dotenv import load_dotenv

from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    cli,
    room_io,
    AutoSubscribe,
)
from livekit.agents.llm import function_tool
from livekit.plugins import deepgram, openai, silero

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("medicai-voice")

# Backend API URL for data retrieval and transcript persistence
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
BACKEND_API_KEY = os.getenv("BACKEND_API_KEY", "")  # If needed for internal calls


# ============================================================================
# STT Provider Selection (Language-aware)
# ============================================================================

def build_stt(language: str):
    """
    Build STT plugin based on language.
    
    - French/English: Deepgram Nova-3 (streaming, low latency)
    - Arabic: OpenAI Whisper (Deepgram Whisper doesn't support streaming WebSocket)
    """
    if language == "ar":
        # Use OpenAI Whisper for Arabic - Deepgram Whisper is batch-only, not streaming
        logger.info("Using OpenAI Whisper for Arabic STT")
        return openai.STT(
            model="whisper-1",
            language="ar",
        )
    
    # Default: Deepgram Nova-3 for French/English (streaming, low latency)
    lang_code = "fr" if language == "fr" else "en-US"
    logger.info(f"Using Deepgram Nova-3 for {lang_code} STT")
    
    # Nova-3 uses keyterms (not keywords) for medical terminology prompting
    return deepgram.STT(
        model="nova-3",
        language=lang_code,
        punctuate=True,
        interim_results=True,
        keyterms=[
            "HbA1c", "ECG", "échographie", "IRM", "scanner",
            "hypertension", "diabète", "glycémie", "cholestérol",
            "créatinine", "hémoglobine", "leucocytes", "plaquettes",
            "metformine", "oméprazole", "amlodipine", "aspirine",
            "douleur", "fièvre", "toux", "dyspnée", "céphalée",
        ],
    )


def build_llm() -> openai.LLM:
    """Build LLM plugin for assistant mode."""
    return openai.LLM(model="gpt-4o-mini")


def build_tts(language: str) -> openai.TTS:
    """
    Build TTS plugin for voice responses.
    
    OpenAI TTS supports multiple languages automatically.
    Using 'nova' voice for a natural, friendly tone.
    """
    return openai.TTS(
        model="tts-1",  # or "tts-1-hd" for higher quality
        voice="nova",
    )


# ============================================================================
# Database/API Helper Functions
# ============================================================================

async def api_call(endpoint: str, params: Optional[Dict] = None, method: str = "GET", json_data: Optional[Dict] = None) -> Dict:
    """Make API call to backend using internal endpoints (no auth required)."""
    async with httpx.AsyncClient() as client:
        headers = {"Content-Type": "application/json"}
        
        # Use internal endpoint path
        url = f"{BACKEND_URL}{endpoint}"
        
        try:
            if method == "GET":
                response = await client.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=15.0,
                )
            else:
                response = await client.post(
                    url,
                    params=params,
                    json=json_data,
                    headers=headers,
                    timeout=15.0,
                )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"API call failed with status {e.response.status_code}: {e}")
            return {"error": f"HTTP {e.response.status_code}"}
        except Exception as e:
            logger.error(f"API call failed: {e}")
            return {"error": str(e)}


# ============================================================================
# Patient Data Tools (for Assistant mode with full database access)
# ============================================================================

# Store context for tools (will be set per-session)
_tool_context: Dict[str, Any] = {}


@function_tool()
async def get_patient_snapshot() -> str:
    """
    Get a summary of the patient's current health status.
    Returns demographics, active conditions, current medications, and recent labs.
    Use this first to get an overview of the patient.
    IMPORTANT: Requires a patient to be selected first. Use select_patient if needed.
    """
    patient_id = _tool_context.get("patient_id")
    if not patient_id:
        return "No patient selected. Please use select_patient first to select a patient by name, or use get_all_patients to see available patients."
    
    # Use internal endpoint (no auth required)
    data = await api_call(f"/api/voice/internal/patient/{patient_id}/snapshot")
    if "error" in data:
        return f"Could not retrieve patient data: {data['error']}"
    
    # Format snapshot for voice response
    lines = []
    if data.get("demographics"):
        demo = data["demographics"]
        lines.append(f"Patient: {demo.get('name', 'Unknown')}, "
                    f"{demo.get('age', '?')} years old, {demo.get('sex', '?')}")
    
    if data.get("active_conditions"):
        conditions = ", ".join(data["active_conditions"][:5])
        lines.append(f"Active conditions: {conditions}")
    
    if data.get("current_medications"):
        meds = ", ".join([m.get("name", "") for m in data["current_medications"][:5]])
        lines.append(f"Current medications: {meds}")
    
    if data.get("recent_labs"):
        labs = data["recent_labs"][:3]
        lab_summary = "; ".join([
            f"{l.get('name', '')}: {l.get('value', '')} {l.get('unit', '')}"
            for l in labs
        ])
        lines.append(f"Recent labs: {lab_summary}")
    
    return "\n".join(lines) if lines else "No patient data available."


@function_tool()
async def get_abnormal_labs(since_days: int = 90) -> str:
    """
    Get abnormal lab results for the patient.
    IMPORTANT: Requires a patient to be selected first. Use select_patient if needed.
    
    Args:
        since_days: Look back this many days (default 90)
    """
    patient_id = _tool_context.get("patient_id")
    if not patient_id:
        return "No patient selected. Please use select_patient first to select a patient by name."
    
    # Use internal endpoint (no auth required)
    data = await api_call(
        f"/api/voice/internal/patient/{patient_id}/labs/abnormal",
        params={"days": since_days}
    )
    
    if "error" in data:
        return f"Could not retrieve lab data: {data['error']}"
    
    abnormal = data.get("abnormal_labs", [])
    if not abnormal:
        return "No abnormal lab results in the specified period."
    
    lines = []
    for lab in abnormal[:10]:
        status = "↑ High" if lab.get("flag") == "H" else "↓ Low"
        lines.append(
            f"{lab.get('name', 'Unknown')}: {lab.get('value', '')} "
            f"{lab.get('unit', '')} ({status}) - {lab.get('date', '')}"
        )
    
    return "\n".join(lines)


@function_tool()
async def get_medication_list() -> str:
    """
    Get the patient's current medication list with dosages.
    IMPORTANT: Requires a patient to be selected first. Use select_patient if needed.
    """
    patient_id = _tool_context.get("patient_id")
    if not patient_id:
        return "No patient selected. Please use select_patient first to select a patient by name."
    
    # Use internal endpoint (no auth required)
    data = await api_call(f"/api/voice/internal/patient/{patient_id}/medications")
    
    if "error" in data:
        return f"Could not retrieve medications: {data['error']}"
    
    meds = data.get("medications", [])
    if not meds:
        return "No active medications on file."
    
    lines = []
    for med in meds[:15]:
        dosage = med.get("dosage", "")
        frequency = med.get("frequency", "")
        lines.append(f"- {med.get('name', 'Unknown')}: {dosage} {frequency}".strip())
    
    return "\n".join(lines)


@function_tool()
async def get_recent_consultations(limit: int = 5) -> str:
    """
    Get summaries of recent consultations for this patient.
    IMPORTANT: Requires a patient to be selected first. Use select_patient if needed.
    
    Args:
        limit: Maximum number of consultations to return (default 5)
    """
    patient_id = _tool_context.get("patient_id")
    if not patient_id:
        return "No patient selected. Please use select_patient first to select a patient by name."
    
    # Use internal endpoint (no auth required)
    data = await api_call(
        f"/api/voice/internal/patient/{patient_id}/consultations",
        params={"limit": limit}
    )
    
    if "error" in data:
        return f"Could not retrieve consultations: {data['error']}"
    
    consultations = data if isinstance(data, list) else data.get("consultations", [])
    if not consultations:
        return "No previous consultations found."
    
    lines = []
    for consult in consultations[:limit]:
        date = consult.get("created_at", consult.get("date", "Unknown date"))
        if isinstance(date, str) and "T" in date:
            date = date.split("T")[0]
        summary = consult.get("chief_complaint", consult.get("summary", "No summary"))
        if summary and len(summary) > 200:
            summary = summary[:200] + "..."
        lines.append(f"- {date}: {summary}")
    
    return "\n".join(lines)


@function_tool()
async def search_patient_documents(query: str, doc_type: Optional[str] = None) -> str:
    """
    Search through patient documents (labs, radiology, etc.).
    IMPORTANT: Requires a patient to be selected first. Use select_patient if needed.
    
    Args:
        query: Search query (e.g., "HbA1c", "chest xray", "glucose")
        doc_type: Optional filter by document type ("lab", "radiology", "note")
    """
    patient_id = _tool_context.get("patient_id")
    if not patient_id:
        return "No patient selected. Please use select_patient first to select a patient by name."
    
    # Get all documents using internal endpoint
    data = await api_call(f"/api/voice/internal/patient/{patient_id}/documents")
    
    if "error" in data:
        return f"Could not retrieve documents: {data['error']}"
    
    documents = data if isinstance(data, list) else data.get("documents", [])
    if not documents:
        return "No documents found for this patient."
    
    # Filter by type if specified
    if doc_type:
        documents = [d for d in documents if doc_type.lower() in d.get("type", "").lower()]
    
    # Simple search matching
    query_lower = query.lower()
    matches = []
    for doc in documents:
        doc_text = json.dumps(doc).lower()
        if query_lower in doc_text:
            matches.append(doc)
    
    if not matches:
        return f"No documents matching '{query}' found."
    
    # Format results
    lines = []
    for doc in matches[:5]:
        doc_type_str = doc.get("type", "Document")
        date = doc.get("date", doc.get("created_at", "Unknown date"))
        if isinstance(date, str) and "T" in date:
            date = date.split("T")[0]
        title = doc.get("title", doc.get("name", "Untitled"))
        
        # Include key findings if available
        findings = doc.get("findings", doc.get("results", ""))
        if isinstance(findings, list):
            findings = "; ".join(str(f) for f in findings[:3])
        elif isinstance(findings, dict):
            findings = "; ".join(f"{k}: {v}" for k, v in list(findings.items())[:3])
        
        summary = f"- [{doc_type_str}] {date}: {title}"
        if findings:
            summary += f" - {findings[:150]}"
        lines.append(summary)
    
    return "\n".join(lines)


@function_tool()
async def get_all_patients() -> str:
    """
    Get a list of all patients in the system.
    Use this when you need to look up a patient by name or see available patients.
    IMPORTANT: Call this first if no specific patient is mentioned.
    """
    # Use internal endpoint (no auth required)
    data = await api_call("/api/voice/internal/patients")
    
    if "error" in data:
        return f"Could not retrieve patients: {data['error']}"
    
    patients = data if isinstance(data, list) else data.get("patients", [])
    if not patients:
        return "No patients found in the system."
    
    lines = []
    for patient in patients[:20]:
        name = patient.get("name", patient.get("id", "Unknown"))
        pid = patient.get("id", "")
        dob = patient.get("date_of_birth", "")
        lines.append(f"- {name} (ID: {pid}){f' DOB: {dob}' if dob else ''}")
    
    total = len(patients)
    if total > 20:
        lines.append(f"... and {total - 20} more patients")
    
    return "\n".join(lines)


@function_tool()
async def select_patient(patient_name: str) -> str:
    """
    Select a patient by name to work with. Call this before accessing patient-specific data.
    
    Args:
        patient_name: The name (or partial name) of the patient to select
    """
    global _tool_context
    
    # Search for patient by name
    data = await api_call("/api/voice/internal/patients")
    
    if "error" in data:
        return f"Could not retrieve patients: {data['error']}"
    
    patients = data if isinstance(data, list) else data.get("patients", [])
    
    # Find matching patient
    patient_name_lower = patient_name.lower()
    matches = [p for p in patients if patient_name_lower in p.get("name", "").lower()]
    
    if not matches:
        return f"No patient found with name containing '{patient_name}'. Use get_all_patients to see available patients."
    
    if len(matches) > 1:
        names = ", ".join([p.get("name", "?") for p in matches[:5]])
        return f"Multiple patients found: {names}. Please be more specific."
    
    # Select the patient
    patient = matches[0]
    _tool_context["patient_id"] = patient.get("id")
    
    return f"Selected patient: {patient.get('name')} (ID: {patient.get('id')}). You can now access their data."


@function_tool()
async def get_changes_since_last_visit() -> str:
    """
    Get changes in patient data since the last consultation.
    This includes new lab results, medication changes, etc.
    IMPORTANT: Requires a patient to be selected first. Use select_patient if needed.
    """
    patient_id = _tool_context.get("patient_id")
    consultation_id = _tool_context.get("consultation_id")
    
    if not patient_id:
        return "No patient selected. Please use select_patient first to select a patient by name."
    
    # Use internal endpoint (no auth required)
    data = await api_call(
        f"/api/voice/internal/patient/{patient_id}/changes",
        params={"since": "last_visit", "current_consultation_id": consultation_id}
    )
    
    if "error" in data:
        return f"Could not retrieve changes: {data['error']}"
    
    changes = data.get("changes", data)
    if not changes:
        return "No changes since last visit."
    
    # Format changes for voice
    lines = []
    
    if changes.get("new_labs"):
        lines.append("New lab results:")
        for lab in changes["new_labs"][:5]:
            lines.append(f"  - {lab.get('name', 'Lab')}: {lab.get('value', '')} {lab.get('unit', '')}")
    
    if changes.get("medication_changes"):
        lines.append("Medication changes:")
        for med in changes["medication_changes"][:5]:
            lines.append(f"  - {med.get('name', 'Medication')}: {med.get('change', '')}")
    
    if changes.get("new_documents"):
        lines.append(f"New documents: {len(changes['new_documents'])} since last visit")
    
    return "\n".join(lines) if lines else "No significant changes since last visit."


# List of all tools for the assistant
ASSISTANT_TOOLS = [
    get_all_patients,
    select_patient,
    get_patient_snapshot,
    get_abnormal_labs,
    get_medication_list,
    get_recent_consultations,
    search_patient_documents,
    get_changes_since_last_visit,
]


# ============================================================================
# MedicAI Assistant Agent
# ============================================================================

class MedicaiScribe(Agent):
    """
    Minimal scribe agent for transcription-only mode.
    
    LiveKit 1.3.12 requires an agent even for STT-only mode.
    This agent has no tools and minimal instructions.
    """
    
    def __init__(self, language: str):
        if language == "fr":
            instructions = "Tu écoutes et transcris la consultation. Ne parle pas."
        elif language == "ar":
            instructions = "أنت تستمع وتنسخ الاستشارة. لا تتحدث."
        else:
            instructions = "You listen and transcribe the consultation. Do not speak."
        
        super().__init__(instructions=instructions)


class MedicaiAssistant(Agent):
    """
    Voice assistant agent for consultation support.
    
    Provides full voice chat about patients using tool calls to retrieve
    real patient data. Grounded in actual data to avoid hallucinations.
    Uses VAD (Voice Activity Detection) for natural conversation flow.
    """
    
    def __init__(self, patient_id: Optional[str], consultation_id: str, language: str):
        self.patient_id = patient_id
        self.consultation_id = consultation_id
        self.language = language
        
        # Set tool context for the function tools
        global _tool_context
        _tool_context = {
            "patient_id": patient_id,
            "consultation_id": consultation_id,
        }
        
        # System prompt based on language
        if language == "fr":
            patient_context = ""
            if not patient_id:
                patient_context = (
                    "\n\nNote: Aucun patient n'est sélectionné. "
                    "Utilise d'abord get_all_patients pour voir les patients disponibles, "
                    "puis select_patient pour sélectionner un patient par son nom.\n"
                )
            
            instructions = (
                "Tu es Medicai, un assistant clinique vocal pour le médecin.\n"
                "Tu as accès à la base de données patients via des outils.\n\n"
                "Règles:\n"
                "- Utilise les outils pour récupérer les données patients avant de répondre.\n"
                "- Si tu n'as pas les données, utilise l'outil approprié pour les obtenir.\n"
                "- Quand tu cites des résultats de labo ou d'imagerie, mentionne la date.\n"
                "- Garde tes réponses courtes et précises sauf si on te demande des détails.\n"
                "- Parle en français médical approprié.\n"
                "- Pour les chiffres et dosages, sois précis.\n\n"
                "Outils disponibles:\n"
                "- get_all_patients: Liste tous les patients disponibles\n"
                "- select_patient: Sélectionne un patient par son nom\n"
                "- get_patient_snapshot: Vue d'ensemble du patient sélectionné\n"
                "- get_abnormal_labs: Résultats de labo anormaux\n"
                "- get_medication_list: Liste des médicaments\n"
                "- get_recent_consultations: Consultations récentes\n"
                "- search_patient_documents: Rechercher dans les documents\n"
                "- get_changes_since_last_visit: Changements depuis dernière visite\n"
                + patient_context
            )
        elif language == "ar":
            patient_context = ""
            if not patient_id:
                patient_context = (
                    "\n\nملاحظة: لم يتم اختيار أي مريض. "
                    "استخدم أولاً get_all_patients لرؤية المرضى المتاحين، "
                    "ثم select_patient لاختيار مريض بالاسم.\n"
                )
            
            instructions = (
                "أنت مساعد طبي صوتي للطبيب اسمك Medicai.\n"
                "لديك وصول إلى قاعدة بيانات المرضى عبر الأدوات.\n\n"
                "القواعد:\n"
                "- استخدم الأدوات للحصول على بيانات المرضى قبل الإجابة.\n"
                "- إذا لم تكن لديك البيانات، استخدم الأداة المناسبة.\n"
                "- عند ذكر نتائج المختبر أو التصوير، اذكر التاريخ.\n"
                "- اجعل إجاباتك قصيرة ودقيقة إلا إذا طُلب منك التفاصيل.\n"
                + patient_context
            )
        else:
            patient_context = ""
            if not patient_id:
                patient_context = (
                    "\n\nNote: No patient is currently selected. "
                    "First use get_all_patients to see available patients, "
                    "then use select_patient to select a patient by name.\n"
                )
            
            instructions = (
                "You are Medicai, a clinical voice assistant for the doctor.\n"
                "You have access to the patient database via tools.\n\n"
                "Rules:\n"
                "- Use tools to retrieve patient data before answering.\n"
                "- If you don't have the data, use the appropriate tool to get it.\n"
                "- When referencing labs/radiology results, mention the date.\n"
                "- Keep answers short and precise unless asked for details.\n"
                "- For numbers and dosages, be precise.\n\n"
                "Available tools:\n"
                "- get_all_patients: List all available patients\n"
                "- select_patient: Select a patient by name\n"
                "- get_patient_snapshot: Patient overview (requires selected patient)\n"
                "- get_abnormal_labs: Abnormal lab results\n"
                "- get_medication_list: Current medications\n"
                "- get_recent_consultations: Recent consultations\n"
                "- search_patient_documents: Search documents\n"
                "- get_changes_since_last_visit: Changes since last visit\n"
                + patient_context
            )
        
        # Pass tools to parent constructor
        super().__init__(
            instructions=instructions,
            tools=ASSISTANT_TOOLS,
        )


# ============================================================================
# Transcript Persistence
# ============================================================================

async def persist_segment(
    consultation_id: str,
    speaker: str,
    text: str,
    is_final: bool,
    language: Optional[str] = None,
):
    """Persist a transcript segment to the backend."""
    if not text.strip():
        return
        
    async with httpx.AsyncClient() as client:
        try:
            headers = {"Content-Type": "application/json"}
            if BACKEND_API_KEY:
                headers["Authorization"] = f"Bearer {BACKEND_API_KEY}"
            
            await client.post(
                f"{BACKEND_URL}/api/voice/transcript/segment",
                json={
                    "id": str(os.urandom(8).hex()),
                    "consultation_id": consultation_id,
                    "speaker": speaker,
                    "text": text,
                    "is_final": is_final,
                    "language": language,
                    "timestamp": None,  # Server will set
                },
                headers=headers,
                timeout=5.0,
            )
        except Exception as e:
            logger.error(f"Failed to persist transcript segment: {e}")


# ============================================================================
# Agent Entrypoint
# ============================================================================

async def entrypoint(ctx: JobContext):
    """
    Main agent entrypoint - dispatched by LiveKit when doctor joins.
    
    Reads mode from job metadata and starts appropriate session:
    - assistant: Full STT → LLM → TTS pipeline with VAD turn detection
    - scribe: STT only, transcripts streamed to frontend
    """
    # Parse metadata from agent dispatch
    meta: Dict[str, Any] = {}
    if ctx.job.metadata:
        try:
            meta = json.loads(ctx.job.metadata)
        except Exception as e:
            logger.warning(f"Failed to parse job metadata: {e}")
            meta = {"raw": ctx.job.metadata}
    
    mode = meta.get("mode", "assistant")
    consultation_id = meta.get("consultation_id", "unknown")
    patient_id = meta.get("patient_id")
    language = meta.get("language", "fr")
    
    logger.info(f"Starting voice agent - mode={mode}, lang={language}, "
                f"consultation={consultation_id}, patient={patient_id}")
    
    # CRITICAL: Connect and subscribe to audio tracks so STT can run
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("Connected to room with audio subscription")
    
    # Load VAD for turn detection (enables full chat without PTT)
    vad = silero.VAD.load()
    
    if mode == "scribe":
        # =====================================================================
        # SCRIBE MODE: STT only, no LLM/TTS - pure transcription
        # =====================================================================
        logger.info("Entering scribe mode (STT only, no agent brain)")
        
        # For scribe mode, we DON'T pass llm or tts - only STT
        session = AgentSession(
            stt=build_stt(language),
            vad=vad,
            # NO llm - prevents agent from generating responses
            # NO tts - no audio output
        )
        
        # Listen to transcription events and persist them
        @session.on("user_input_transcribed")
        def on_transcription(ev):
            try:
                # UserInputTranscribedEvent has transcript (str) and is_final (bool)
                text = ev.transcript
                is_final = ev.is_final
                
                if text.strip():
                    logger.info(f"[Scribe] Transcribed: {text[:50]}... (final={is_final})")
                    # Persist to database
                    asyncio.create_task(persist_segment(
                        consultation_id=consultation_id,
                        speaker="doctor",
                        text=text,
                        is_final=is_final,
                        language=language,
                    ))
            except Exception as e:
                logger.error(f"Transcription handler error: {e}")
        
        # Scribe agent has NO instructions to speak - it just listens
        # Using empty instructions ensures it won't try to respond
        scribe_agent = Agent(instructions="")
        
        # Use new RoomOptions API (RoomOutputOptions is deprecated)
        await session.start(
            agent=scribe_agent,
            room=ctx.room,
            room_options=room_io.RoomOptions(
                audio_input=True,  # Enable audio input from participants
                audio_output=False,  # No TTS output in scribe mode
                text_output=room_io.TextOutputOptions(sync_transcription=True),  # Forward transcripts
            ),
        )
        
        logger.info("Scribe session started")
        
        # Keep session alive until disconnected
        def on_disconnect():
            logger.info("Room disconnected, ending scribe session")
        
        ctx.room.on("disconnected", on_disconnect)
        
        # Wait indefinitely - session will end when room disconnects
        # connection_state is an int: 0=DISCONNECTED, 1=CONNECTED, 2=RECONNECTING
        while ctx.room.connection_state != 0:  # 0 = CONN_DISCONNECTED
            await asyncio.sleep(1)
        return
    
    # =========================================================================
    # ASSISTANT MODE: Full STT → LLM → TTS pipeline with VAD
    # =========================================================================
    logger.info("Entering assistant mode (STT + LLM + TTS)")
    
    session = AgentSession(
        stt=build_stt(language),
        llm=build_llm(),
        tts=build_tts(language),
        vad=vad,
        # Enable VAD turn detection for natural conversation (no PTT needed)
        turn_detection="vad",
    )
    
    # Persist user transcripts
    @session.on("user_input_transcribed")
    def on_user_input(ev):
        try:
            # UserInputTranscribedEvent has transcript (str) and is_final (bool)
            text = ev.transcript
            is_final = ev.is_final
            
            if text.strip() and is_final:
                logger.info(f"[Assistant] User said: {text[:50]}...")
                asyncio.create_task(persist_segment(
                    consultation_id=consultation_id,
                    speaker="doctor",
                    text=text,
                    is_final=True,
                    language=language,
                ))
        except Exception as e:
            logger.error(f"User input handler error: {e}")
    
    # Add more debug events for troubleshooting
    @session.on("agent_started_speaking")
    def on_agent_start(ev):
        logger.info(f"[Assistant] Agent started speaking")
    
    @session.on("agent_stopped_speaking")
    def on_agent_stop(ev):
        logger.info(f"[Assistant] Agent stopped speaking")
    
    @session.on("function_call_started")
    def on_function_start(ev):
        logger.info(f"[Assistant] Function call started: {ev.function_name if hasattr(ev, 'function_name') else ev}")
    
    @session.on("function_call_completed")
    def on_function_end(ev):
        logger.info(f"[Assistant] Function call completed: {ev.function_name if hasattr(ev, 'function_name') else ev}")
    
    # Persist agent responses
    @session.on("agent_speech_committed")
    def on_agent_speech(ev):
        try:
            text = ev.transcript if hasattr(ev, "transcript") else (ev.text if hasattr(ev, "text") else str(ev))
            
            if text and text.strip():
                logger.info(f"[Assistant] Agent said: {text[:50]}...")
                asyncio.create_task(persist_segment(
                    consultation_id=consultation_id,
                    speaker="agent",
                    text=text,
                    is_final=True,
                    language=language,
                ))
        except Exception as e:
            logger.error(f"Agent speech handler error: {e}")
    
    # Create assistant with patient context
    assistant = MedicaiAssistant(
        patient_id=patient_id,
        consultation_id=consultation_id,
        language=language,
    )
    
    # Use new RoomOptions API (RoomOutputOptions is deprecated)
    await session.start(
        agent=assistant,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=True,  # Enable audio input from participants
            audio_output=True,  # Enable TTS output
            text_output=room_io.TextOutputOptions(sync_transcription=True),  # Forward transcripts
        ),
    )
    
    logger.info("Assistant session started")
    
    # Optional greeting - wrapped in try/except to not break session
    try:
        greetings = {
            "fr": "Je suis prêt. Posez-moi vos questions.",
            "ar": "أنا جاهز. اطرح أسئلتك.",
            "en": "I'm ready. Ask me your questions.",
        }
        greeting = greetings.get(language, greetings["en"])
        logger.info(f"Sending greeting: {greeting}")
        await session.say(greeting)
        logger.info("Greeting sent successfully")
    except Exception as e:
        logger.warning(f"Failed to send greeting (non-fatal): {e}")
    
    # Wait indefinitely - session will end when room disconnects  
    # connection_state is an int: 0=DISCONNECTED, 1=CONNECTED, 2=RECONNECTING
    while ctx.room.connection_state != 0:  # 0 = CONN_DISCONNECTED
        await asyncio.sleep(1)


# ============================================================================
# CLI Entry Point
# ============================================================================

if __name__ == "__main__":
    from livekit.agents import WorkerOptions
    
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="medicai-voice",
        )
    )
