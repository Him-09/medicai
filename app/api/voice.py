"""
Voice Modes API Routes for MedicAI.

Provides endpoints for:
- Issuing LiveKit tokens with agent dispatch (auto-dispatches voice agent)
- Managing voice room lifecycle
- Storing/retrieving voice transcripts
- Triggering post-scribe summarization

Implements two modes:
- Assistant: STT → LLM → TTS (voice Q/A about patients)
- Scribe: STT only (continuous transcription for notes)
"""

import json
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Literal, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from app.auth import get_current_user
from app.audit import audit_event
from medicai.storage.postgres import get_conn
from medicai.storage.consultation_store import get_consultation as db_get_consultation

load_dotenv()

# Configure logging
logger = logging.getLogger("medicai-voice")

# LiveKit configuration
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

router = APIRouter(prefix="/api/voice", tags=["voice"])


# ============================================================================
# Schemas
# ============================================================================

class VoiceTokenRequest(BaseModel):
    """Request to create a voice room token."""
    consultation_id: str = Field(..., description="Consultation ID to associate voice with")
    mode: Literal["assistant", "scribe"] = Field(
        default="assistant",
        description="Voice mode: 'assistant' for voice Q/A, 'scribe' for transcription only"
    )
    language: Literal["fr", "ar", "en"] = Field(
        default="fr",
        description="Primary language: 'fr' (French), 'ar' (Arabic), 'en' (English)"
    )


class VoiceTokenResponse(BaseModel):
    """Voice room token response."""
    token: str
    room_name: str
    url: str
    mode: str
    language: str
    consultation_id: str
    expires_in_seconds: int = 3600


class TranscriptSegment(BaseModel):
    """A single transcript segment."""
    id: str
    consultation_id: str
    speaker: str  # "doctor", "patient", "agent"
    text: str
    timestamp: datetime
    is_final: bool
    language: Optional[str] = None


class VoiceSessionSummary(BaseModel):
    """Summary of a voice session after stop."""
    consultation_id: str
    total_segments: int
    total_duration_seconds: Optional[float] = None
    full_transcript: str
    summary: Optional[str] = None


class StopVoiceRequest(BaseModel):
    """Request to stop and finalize a voice session."""
    consultation_id: str
    generate_summary: bool = Field(
        default=True,
        description="Whether to generate an AI summary of the transcript (scribe mode)"
    )


# ============================================================================
# Database Functions - Transcript Storage
# ============================================================================

def init_voice_tables():
    """Initialize voice-related database tables."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS voice_sessions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    consultation_id TEXT NOT NULL,
                    patient_id TEXT,
                    doctor_id UUID NOT NULL,
                    room_name TEXT NOT NULL,
                    mode TEXT NOT NULL CHECK (mode IN ('assistant', 'scribe')),
                    language TEXT NOT NULL DEFAULT 'fr',
                    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'error')),
                    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    ended_at TIMESTAMPTZ,
                    duration_seconds FLOAT,
                    summary TEXT,
                    metadata JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                
                CREATE INDEX IF NOT EXISTS idx_voice_sessions_consultation 
                    ON voice_sessions(consultation_id);
                CREATE INDEX IF NOT EXISTS idx_voice_sessions_doctor 
                    ON voice_sessions(doctor_id);
                CREATE INDEX IF NOT EXISTS idx_voice_sessions_status 
                    ON voice_sessions(status);
                
                CREATE TABLE IF NOT EXISTS voice_transcript_segments (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    session_id UUID REFERENCES voice_sessions(id) ON DELETE CASCADE,
                    consultation_id TEXT NOT NULL,
                    speaker TEXT NOT NULL,
                    text TEXT NOT NULL,
                    is_final BOOLEAN NOT NULL DEFAULT TRUE,
                    language TEXT,
                    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    sequence_num SERIAL,
                    metadata JSONB
                );
                
                CREATE INDEX IF NOT EXISTS idx_voice_segments_session 
                    ON voice_transcript_segments(session_id);
                CREATE INDEX IF NOT EXISTS idx_voice_segments_consultation 
                    ON voice_transcript_segments(consultation_id);
                CREATE INDEX IF NOT EXISTS idx_voice_segments_timestamp 
                    ON voice_transcript_segments(timestamp);
            """)
            conn.commit()


def create_voice_session(
    consultation_id: str,
    patient_id: Optional[str],
    doctor_id: str,
    room_name: str,
    mode: str,
    language: str,
    clinic_id: Optional[str] = None,
) -> str:
    """Create a new voice session record."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Resolve clinic_id from users table if not provided
            if not clinic_id:
                cur.execute("SELECT clinic_id FROM users WHERE id = %s", (doctor_id,))
                row = cur.fetchone()
                clinic_id = str(row[0]) if row and row[0] else None
            cur.execute("""
                INSERT INTO voice_sessions 
                    (consultation_id, patient_id, doctor_id, room_name, mode, language, clinic_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (consultation_id, patient_id, doctor_id, room_name, mode, language, clinic_id))
            session_id = str(cur.fetchone()[0])
            conn.commit()
            return session_id


def store_transcript_segment(
    session_id: str,
    consultation_id: str,
    speaker: str,
    text: str,
    is_final: bool = True,
    language: Optional[str] = None,
    metadata: Optional[Dict] = None,
    clinic_id: Optional[str] = None,
):
    """Store a transcript segment."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Resolve clinic_id from voice_sessions if not provided
            if not clinic_id:
                cur.execute("SELECT clinic_id FROM voice_sessions WHERE id = %s", (session_id,))
                row = cur.fetchone()
                clinic_id = str(row[0]) if row and row[0] else None
            cur.execute("""
                INSERT INTO voice_transcript_segments 
                    (session_id, consultation_id, speaker, text, is_final, language, metadata, clinic_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (session_id, consultation_id, speaker, text, is_final, language,
                  json.dumps(metadata) if metadata else None, clinic_id))
            conn.commit()


def get_session_transcript(consultation_id: str) -> list:
    """Get all transcript segments for a consultation."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, speaker, text, is_final, language, timestamp, sequence_num
                FROM voice_transcript_segments
                WHERE consultation_id = %s
                ORDER BY timestamp ASC, sequence_num ASC
            """, (consultation_id,))
            rows = cur.fetchall()
            return [
                {
                    "id": str(row[0]),
                    "speaker": row[1],
                    "text": row[2],
                    "is_final": row[3],
                    "language": row[4],
                    "timestamp": row[5].isoformat() if row[5] else None,
                    "sequence_num": row[6],
                }
                for row in rows
            ]


def complete_voice_session(
    consultation_id: str,
    summary: Optional[str] = None,
) -> Optional[Dict]:
    """Mark a voice session as completed and optionally store summary."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get session info
            cur.execute("""
                SELECT id, started_at FROM voice_sessions 
                WHERE consultation_id = %s AND status = 'active'
                ORDER BY started_at DESC LIMIT 1
            """, (consultation_id,))
            row = cur.fetchone()
            if not row:
                return None
            
            session_id, started_at = row
            ended_at = datetime.now(timezone.utc)
            # Handle both timezone-aware and naive datetimes from DB
            if started_at and started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
            duration = (ended_at - started_at).total_seconds() if started_at else None
            
            cur.execute("""
                UPDATE voice_sessions
                SET status = 'completed',
                    ended_at = %s,
                    duration_seconds = %s,
                    summary = %s
                WHERE id = %s
                RETURNING id, consultation_id, mode, duration_seconds
            """, (ended_at, duration, summary, session_id))
            updated = cur.fetchone()
            conn.commit()
            
            if updated:
                return {
                    "session_id": str(updated[0]),
                    "consultation_id": updated[1],
                    "mode": updated[2],
                    "duration_seconds": updated[3],
                }
            return None


def get_active_session(consultation_id: str) -> Optional[Dict]:
    """Get active voice session for a consultation."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, room_name, mode, language, started_at
                FROM voice_sessions
                WHERE consultation_id = %s AND status = 'active'
                ORDER BY started_at DESC LIMIT 1
            """, (consultation_id,))
            row = cur.fetchone()
            if row:
                return {
                    "session_id": str(row[0]),
                    "room_name": row[1],
                    "mode": row[2],
                    "language": row[3],
                    "started_at": row[4].isoformat() if row[4] else None,
                }
            return None


# ============================================================================
# Token Generation
# ============================================================================

def make_consultation_token(
    *,
    room_name: str,
    doctor_identity: str,
    doctor_name: str,
    mode: str,
    consultation_id: str,
    patient_id: Optional[str],
    language: str,
) -> str:
    """
    Create a LiveKit access token with agent dispatch metadata.
    
    The token includes RoomConfiguration with RoomAgentDispatch that tells
    LiveKit to automatically dispatch the 'medicai-voice' agent when the
    doctor joins the room.
    """
    try:
        from livekit.api import AccessToken, VideoGrants, RoomAgentDispatch, RoomConfiguration
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="LiveKit SDK not installed. Run: pip install livekit-api"
        )
    
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise HTTPException(
            status_code=500,
            detail="LiveKit credentials not configured. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET."
        )
    
    # Metadata passed to the agent on dispatch
    metadata = json.dumps({
        "mode": mode,
        "consultation_id": consultation_id,
        "patient_id": patient_id,
        "language": language,
        "app": "medicai",
    })
    
    token = (
        AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(doctor_identity)
        .with_name(doctor_name)
        .with_grants(VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
        ))
        .with_room_config(RoomConfiguration(
            agents=[RoomAgentDispatch(
                agent_name="medicai-voice",
                metadata=metadata,
            )]
        ))
        .to_jwt()
    )
    return token


# ============================================================================
# API Routes
# ============================================================================

class AssistantTokenRequest(BaseModel):
    """Request for assistant-only token (no consultation required)."""
    language: Literal["fr", "ar", "en"] = Field(default="fr")


@router.post("/assistant/token", response_model=VoiceTokenResponse)
async def create_assistant_token(
    request: AssistantTokenRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Create a LiveKit token for the voice assistant (without consultation context).
    
    This endpoint is for the general-purpose voice assistant on the welcome screen
    that has full database access but isn't tied to a specific consultation.
    """
    # Generate a unique session ID for this assistant interaction
    import uuid
    session_id = f"assistant-{uuid.uuid4().hex[:12]}"
    room_name = f"medicai-assistant-{session_id}"
    
    # Initialize tables if needed
    try:
        init_voice_tables()
    except Exception:
        pass
    
    # Create voice session without patient/consultation
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO voice_sessions 
                        (consultation_id, doctor_id, room_name, mode, language, clinic_id)
                    VALUES (%s, %s, %s, 'assistant', %s, %s)
                    RETURNING id
                """, (session_id, user["id"], room_name, request.language, user["clinic_id"]))
                db_session_id = str(cur.fetchone()[0])
                conn.commit()
    except Exception as e:
        logger.warning(f"Failed to create voice session: {e}")
        db_session_id = session_id
    
    # Generate token
    token = make_consultation_token(
        room_name=room_name,
        doctor_identity=f"doctor-{user['id']}",
        doctor_name=user.get("email", "Doctor"),
        mode="assistant",
        consultation_id=session_id,
        patient_id=None,  # No specific patient - assistant has full DB access
        language=request.language,
    )
    
    # Audit log
    audit_event(
        user["id"],
        "VOICE_ASSISTANT_START",
        metadata={
            "session_id": session_id,
            "language": request.language,
        }
    )
    
    return VoiceTokenResponse(
        token=token,
        room_name=room_name,
        url=LIVEKIT_URL,
        mode="assistant",
        language=request.language,
        consultation_id=session_id,
    )


@router.post("/token", response_model=VoiceTokenResponse)
async def create_voice_token(
    request: VoiceTokenRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Create a LiveKit room token for voice interaction.
    
    This endpoint:
    1. Validates the consultation exists
    2. Creates a voice session record
    3. Generates a LiveKit token with agent dispatch metadata
    
    The token automatically dispatches the 'medicai-voice' agent when used.
    """
    # Validate consultation exists
    consultation = db_get_consultation(request.consultation_id)
    if not consultation:
        raise HTTPException(404, "Consultation not found")
    
    patient_id = consultation.get("patient_id")
    
    # Room name format: medicai-voice-{consultation_id}
    room_name = f"medicai-voice-{request.consultation_id}"
    
    # Check for existing active session
    existing = get_active_session(request.consultation_id)
    if existing:
        # Return existing session token
        token = make_consultation_token(
            room_name=existing["room_name"],
            doctor_identity=f"doctor-{user['id']}",
            doctor_name=user.get("email", "Doctor"),
            mode=existing["mode"],
            consultation_id=request.consultation_id,
            patient_id=patient_id,
            language=existing["language"],
        )
        return VoiceTokenResponse(
            token=token,
            room_name=existing["room_name"],
            url=LIVEKIT_URL,
            mode=existing["mode"],
            language=existing["language"],
            consultation_id=request.consultation_id,
        )
    
    # Initialize tables if needed
    try:
        init_voice_tables()
    except Exception:
        pass  # Tables already exist
    
    # Create new voice session
    session_id = create_voice_session(
        consultation_id=request.consultation_id,
        patient_id=patient_id,
        doctor_id=user["id"],
        room_name=room_name,
        mode=request.mode,
        language=request.language,
        clinic_id=user["clinic_id"],
    )
    
    # Generate token
    token = make_consultation_token(
        room_name=room_name,
        doctor_identity=f"doctor-{user['id']}",
        doctor_name=user.get("email", "Doctor"),
        mode=request.mode,
        consultation_id=request.consultation_id,
        patient_id=patient_id,
        language=request.language,
    )
    
    # Audit log
    audit_event(
        user["id"],
        "VOICE_SESSION_START",
        patient_id=patient_id,
        metadata={
            "consultation_id": request.consultation_id,
            "mode": request.mode,
            "language": request.language,
            "session_id": session_id,
        }
    )
    
    return VoiceTokenResponse(
        token=token,
        room_name=room_name,
        url=LIVEKIT_URL,
        mode=request.mode,
        language=request.language,
        consultation_id=request.consultation_id,
    )


@router.post("/stop", response_model=VoiceSessionSummary)
async def stop_voice_session(
    request: StopVoiceRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Stop and finalize a voice session.
    
    For scribe mode, this can optionally generate an AI summary of the transcript.
    """
    # Check if there's an active session first
    active_session = get_active_session(request.consultation_id)
    if not active_session:
        raise HTTPException(404, "No active voice session found for this consultation")
    
    # Get transcript (may be empty if recording was short)
    segments = get_session_transcript(request.consultation_id)
    
    # Build full transcript text
    full_transcript = "\n".join([
        f"[{s['speaker']}]: {s['text']}" 
        for s in segments 
        if s.get("is_final", True)
    ])
    
    summary = None
    if request.generate_summary and full_transcript.strip():
        # Generate AI summary using OpenAI
        try:
            from openai import OpenAI
            client = OpenAI()
            
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a medical scribe assistant. Summarize the following "
                            "consultation transcript into structured clinical notes. "
                            "Include: Chief Complaint, HPI, Key Findings, Assessment, Plan. "
                            "Be concise and use medical terminology appropriately. "
                            "Output in the same language as the transcript."
                        )
                    },
                    {"role": "user", "content": full_transcript}
                ],
                max_tokens=1000,
            )
            summary = response.choices[0].message.content
        except Exception as e:
            # Log error but don't fail
            print(f"Failed to generate summary: {e}")
    
    # Complete the session
    result = complete_voice_session(request.consultation_id, summary)
    
    # Audit log
    audit_event(
        user["id"],
        "VOICE_SESSION_STOP",
        metadata={
            "consultation_id": request.consultation_id,
            "segments_count": len(segments),
            "summary_generated": summary is not None,
        }
    )
    
    return VoiceSessionSummary(
        consultation_id=request.consultation_id,
        total_segments=len(segments),
        total_duration_seconds=result.get("duration_seconds") if result else None,
        full_transcript=full_transcript,
        summary=summary,
    )


@router.get("/transcript/{consultation_id}")
async def get_transcript(
    consultation_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Get the transcript for a consultation's voice session."""
    segments = get_session_transcript(consultation_id)
    return {
        "consultation_id": consultation_id,
        "segments": segments,
        "total_segments": len(segments),
    }


@router.get("/session/{consultation_id}")
async def get_voice_session(
    consultation_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Get the active voice session status for a consultation."""
    session = get_active_session(consultation_id)
    if not session:
        return {"active": False, "consultation_id": consultation_id}
    
    return {
        "active": True,
        "consultation_id": consultation_id,
        **session,
    }


@router.post("/transcript/segment")
async def add_transcript_segment(
    segment: TranscriptSegment,
):
    """
    Add a transcript segment (used by the agent worker).
    
    This endpoint is called by the voice agent to persist transcripts.
    No auth required - internal use only.
    """
    session = get_active_session(segment.consultation_id)
    if not session:
        # Create a dummy session if none exists
        pass
    
    if session:
        store_transcript_segment(
            session_id=session["session_id"],
            consultation_id=segment.consultation_id,
            speaker=segment.speaker,
            text=segment.text,
            is_final=segment.is_final,
            language=segment.language,
        )
    
    return {"status": "ok", "segment_id": segment.id}


# ============================================================================
# Internal Agent API Endpoints (no auth required)
# These endpoints are for the voice agent worker to access patient data
# ============================================================================

from medicai.storage.file_store import FileStore

# Initialize FileStore for patient data access
_file_store = None

def get_file_store():
    global _file_store
    if _file_store is None:
        _file_store = FileStore()
    return _file_store


@router.get("/internal/patient/{patient_id}/snapshot")
async def internal_get_patient_snapshot(patient_id: str):
    """
    Get patient snapshot for voice agent.
    No authentication required - internal use only.
    """
    try:
        store = get_file_store()
        # Use load_by_patient to get all documents
        documents = store.load_by_patient(patient_id)
        
        if not documents:
            return {"error": "Patient not found", "patient_id": patient_id}
        
        # Build snapshot from documents
        snapshot = {
            "patient_id": patient_id,
            "demographics": {"name": patient_id, "age": "Unknown", "sex": "Unknown"},
            "active_conditions": [],
            "current_medications": [],
            "recent_labs": [],
        }
        
        for doc in documents:
            doc_dict = doc.model_dump() if hasattr(doc, 'model_dump') else dict(doc)
            doc_type = doc_dict.get("document_type", "")
            
            if doc_type == "lab":
                # Lab documents have structured.tests array
                structured = doc_dict.get("structured", {})
                tests = structured.get("tests", [])
                if isinstance(tests, list):
                    for t in tests[:10]:
                        if isinstance(t, dict):
                            snapshot["recent_labs"].append({
                                "name": t.get("name", "Lab"),
                                "value": t.get("value", ""),
                                "unit": t.get("unit", ""),
                                "flag": t.get("flag", ""),
                                "date": doc_dict.get("metadata", {}).get("date_of_service", ""),
                            })
            elif doc_type == "prescription":
                # Prescription documents have medications array
                structured = doc_dict.get("structured", {})
                meds = structured.get("medications", doc_dict.get("medications", []))
                if isinstance(meds, list):
                    for m in meds:
                        if isinstance(m, dict):
                            snapshot["current_medications"].append({
                                "name": m.get("name", m.get("medication", "Medication")),
                                "dosage": m.get("dosage", m.get("dose", "")),
                                "frequency": m.get("frequency", ""),
                            })
        
        return snapshot
    except Exception as e:
        return {"error": str(e)}


@router.get("/internal/patient/{patient_id}/documents")
async def internal_get_patient_documents(patient_id: str):
    """
    Get patient documents for voice agent.
    No authentication required - internal use only.
    """
    try:
        store = get_file_store()
        documents = store.load_by_patient(patient_id)
        # Convert to dicts for JSON serialization
        return [{"documents": [doc.model_dump() if hasattr(doc, 'model_dump') else dict(doc) for doc in documents]}]
    except Exception as e:
        return {"error": str(e)}


@router.get("/internal/patients")
async def internal_get_all_patients():
    """
    Get all patients for voice agent.
    No authentication required - internal use only.
    """
    try:
        # Try to get patients from database first (with actual names)
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT patient_id, name, dob, sex, status
                        FROM patients
                        WHERE status = 'active'
                        ORDER BY name
                    """)
                    rows = cur.fetchall()
                    
                    if rows:
                        patients = []
                        for row in rows:
                            patients.append({
                                "id": row[0],
                                "name": row[1] or row[0],  # Fallback to ID if name is null
                                "date_of_birth": str(row[2]) if row[2] else None,
                                "sex": row[3],
                                "status": row[4]
                            })
                        return {"patients": patients}
        except Exception as db_error:
            logger.warning(f"Could not get patients from DB: {db_error}")
        
        # Fallback: Get from file store (legacy)
        store = get_file_store()
        all_docs = store.list_all()
        patient_ids = set()
        for doc in all_docs:
            doc_dict = doc.model_dump() if hasattr(doc, 'model_dump') else dict(doc)
            pid = doc_dict.get("patient_id")
            if pid:
                patient_ids.add(pid)
        
        patients = [{"id": pid, "name": pid} for pid in sorted(patient_ids)]
        return {"patients": patients}
    except Exception as e:
        return {"error": str(e)}


@router.get("/internal/consultation/{consultation_id}")
async def internal_get_consultation(consultation_id: str):
    """
    Get consultation details for voice agent.
    No authentication required - internal use only.
    """
    try:
        consultation = db_get_consultation(consultation_id)
        if consultation:
            return consultation
        return {"error": "Consultation not found"}
    except Exception as e:
        return {"error": str(e)}


@router.get("/internal/patient/{patient_id}/labs/abnormal")
async def internal_get_abnormal_labs(patient_id: str, days: int = 90):
    """
    Get abnormal lab results for voice agent.
    No authentication required - internal use only.
    """
    try:
        store = get_file_store()
        documents = store.load_by_patient(patient_id)
        
        abnormal_labs = []
        for doc in documents:
            doc_dict = doc.model_dump() if hasattr(doc, 'model_dump') else dict(doc)
            if doc_dict.get("document_type", "").lower() == "lab":
                # Lab documents have structured.tests array
                structured = doc_dict.get("structured", {})
                tests = structured.get("tests", [])
                date = doc_dict.get("metadata", {}).get("date_of_service", "")
                
                if isinstance(tests, list):
                    for test in tests:
                        if isinstance(test, dict):
                            flag = str(test.get("flag", "")).lower()
                            # Check for abnormal flags (low, high, etc.)
                            if flag in ("low", "high", "h", "l", "abnormal", "critical"):
                                abnormal_labs.append({
                                    "name": test.get("name", "Unknown"),
                                    "value": test.get("value", ""),
                                    "unit": test.get("unit", ""),
                                    "flag": "H" if flag in ("high", "h") else "L",
                                    "date": date,
                                    "reference_range": f"{test.get('ref_low', '')} - {test.get('ref_high', '')}",
                                })
        
        return {"abnormal_labs": abnormal_labs}
    except Exception as e:
        return {"error": str(e)}


@router.get("/internal/patient/{patient_id}/medications")
async def internal_get_medications(patient_id: str):
    """
    Get patient medications for voice agent.
    No authentication required - internal use only.
    """
    try:
        store = get_file_store()
        documents = store.load_by_patient(patient_id)
        
        medications = []
        for doc in documents:
            doc_dict = doc.model_dump() if hasattr(doc, 'model_dump') else dict(doc)
            if doc_dict.get("document_type") == "prescription":
                meds = doc_dict.get("medications", [])
                if isinstance(meds, list):
                    for m in meds:
                        if isinstance(m, dict):
                            medications.append({
                                "name": m.get("name", "Medication"),
                                "dosage": m.get("dosage", ""),
                                "frequency": m.get("frequency", ""),
                            })
        
        return {"medications": medications}
    except Exception as e:
        return {"error": str(e)}


@router.get("/internal/patient/{patient_id}/consultations")
async def internal_get_patient_consultations(patient_id: str, limit: int = 5):
    """
    Get patient consultations for voice agent.
    No authentication required - internal use only.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, patient_id, chief_complaint, summary, created_at
                    FROM consultations
                    WHERE patient_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (patient_id, limit))
                rows = cur.fetchall()
                
                consultations = []
                for row in rows:
                    consultations.append({
                        "id": str(row[0]),
                        "patient_id": row[1],
                        "chief_complaint": row[2],
                        "summary": row[3],
                        "created_at": row[4].isoformat() if row[4] else None,
                    })
                
                return {"consultations": consultations}
    except Exception as e:
        return {"error": str(e)}


@router.get("/internal/patient/{patient_id}/changes")
async def internal_get_patient_changes(
    patient_id: str,
    since: str = "last_visit",
    current_consultation_id: Optional[str] = None
):
    """
    Get patient changes since last visit for voice agent.
    No authentication required - internal use only.
    """
    try:
        store = get_file_store()
        
        # Get all documents using load_by_patient
        documents = store.load_by_patient(patient_id)
        
        # Return recent items as "changes"
        changes = {
            "new_labs": [],
            "medication_changes": [],
            "new_documents": [],
        }
        
        for doc in documents[:10]:  # Recent 10 docs
            doc_dict = doc.model_dump() if hasattr(doc, 'model_dump') else dict(doc)
            doc_type = doc_dict.get("document_type", "").lower()
            
            if doc_type == "lab":
                structured = doc_dict.get("structured", {})
                tests = structured.get("tests", [])
                date = doc_dict.get("metadata", {}).get("date_of_service", "")
                if isinstance(tests, list):
                    for test in tests[:5]:
                        if isinstance(test, dict):
                            changes["new_labs"].append({
                                "name": test.get("name", "Lab"),
                                "value": test.get("value", ""),
                                "unit": test.get("unit", ""),
                                "flag": test.get("flag", ""),
                                "date": date,
                            })
            else:
                changes["new_documents"].append({
                    "type": doc_type,
                    "title": doc_dict.get("metadata", {}).get("panel_name", doc_type),
                    "date": doc_dict.get("metadata", {}).get("date_of_service", ""),
                })
        
        return {"changes": changes}
    except Exception as e:
        return {"error": str(e)}
