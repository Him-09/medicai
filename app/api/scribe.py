"""
Scribe Mode API - Simplified WebSocket-based transcription.

Architecture: Browser mic → WebSocket → Deepgram STT → UI
No LiveKit, no rooms - just direct audio streaming.

This is the MVP scribe for in-clinic desktop use.
"""

import asyncio
import json
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List
from contextlib import asynccontextmanager

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from app.auth import get_current_user
from medicai.storage.postgres import get_conn

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("medicai-scribe")

# Deepgram configuration
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")

router = APIRouter(prefix="/api/scribe", tags=["scribe"])


# ============================================================================
# Schemas
# ============================================================================

class ScribeSessionCreate(BaseModel):
    """Request to create a scribe session."""
    consultation_id: str
    language: str = Field(default="fr", description="Language: fr, ar, en")


class ScribeSessionResponse(BaseModel):
    """Response with session info."""
    session_id: str
    consultation_id: str
    websocket_url: str
    language: str


class TranscriptSegment(BaseModel):
    """A transcript segment."""
    id: str
    speaker: str
    text: str
    is_final: bool
    timestamp: str


class SOAPSummary(BaseModel):
    """SOAP note generated from transcript."""
    subjective: str
    objective: str
    assessment: str
    plan: str
    raw_transcript: str
    generated_at: str


# ============================================================================
# Database Functions
# ============================================================================

def create_scribe_session(
    consultation_id: str,
    doctor_id: str,
    language: str,
    clinic_id: str = None,
) -> str:
    """Create a new scribe session record."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Resolve clinic_id from users table if not provided
            if not clinic_id:
                cur.execute("SELECT clinic_id FROM users WHERE id = %s", (doctor_id,))
                row = cur.fetchone()
                clinic_id = str(row[0]) if row and row[0] else None
            cur.execute("""
                INSERT INTO voice_sessions 
                    (consultation_id, doctor_id, room_name, mode, language, clinic_id)
                VALUES (%s, %s, %s, 'scribe', %s, %s)
                RETURNING id
            """, (consultation_id, doctor_id, f"scribe-{consultation_id}", language, clinic_id))
            session_id = str(cur.fetchone()[0])
            conn.commit()
            return session_id


def store_scribe_segment(
    session_id: str,
    consultation_id: str,
    text: str,
    is_final: bool = True,
    language: Optional[str] = None,
    clinic_id: Optional[str] = None,
):
    """Store a transcript segment from scribe."""
    if not text.strip():
        return
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Resolve clinic_id from voice_sessions if not provided
            if not clinic_id:
                cur.execute("SELECT clinic_id FROM voice_sessions WHERE id = %s", (session_id,))
                row = cur.fetchone()
                clinic_id = str(row[0]) if row and row[0] else None
            cur.execute("""
                INSERT INTO voice_transcript_segments 
                    (session_id, consultation_id, speaker, text, is_final, language, clinic_id)
                VALUES (%s, %s, 'doctor', %s, %s, %s, %s)
            """, (session_id, consultation_id, text, is_final, language, clinic_id))
            conn.commit()


def get_scribe_transcript(consultation_id: str) -> List[Dict]:
    """Get all transcript segments for a consultation."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, speaker, text, is_final, language, timestamp
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
                }
                for row in rows
            ]


def complete_scribe_session(
    session_id: str,
    summary: Optional[str] = None,
) -> Optional[Dict]:
    """Mark scribe session as completed."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE voice_sessions
                SET status = 'completed',
                    ended_at = NOW(),
                    duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at)),
                    summary = %s
                WHERE id = %s
                RETURNING id, consultation_id, duration_seconds
            """, (summary, session_id))
            row = cur.fetchone()
            conn.commit()
            if row:
                return {
                    "session_id": str(row[0]),
                    "consultation_id": row[1],
                    "duration_seconds": row[2],
                }
            return None


# ============================================================================
# Deepgram Streaming Client
# ============================================================================

class DeepgramStreamer:
    """Handles streaming audio to Deepgram and receiving transcripts."""
    
    def __init__(
        self,
        language: str = "fr",
        on_transcript: callable = None,
        on_error: callable = None,
    ):
        self.language = language
        self.on_transcript = on_transcript
        self.on_error = on_error
        self._ws = None
        self._task = None
        self._closed = False
        
    async def connect(self):
        """Connect to Deepgram WebSocket."""
        import websockets
        
        if not DEEPGRAM_API_KEY:
            raise ValueError("DEEPGRAM_API_KEY not set")
        
        # Deepgram model selection based on language
        # Nova-2 supports French and English but NOT Arabic
        # Arabic is ONLY supported by Whisper models in Deepgram (both batch and streaming)
        if self.language == "ar":
            # Use Deepgram's Whisper model for Arabic - it supports streaming
            model = "whisper-large"
            lang_code = "ar"
        else:
            model = "nova-2"
            lang_code = {
                "fr": "fr",
                "en": "en-US",
            }.get(self.language, "fr")
        
        url = (
            f"wss://api.deepgram.com/v1/listen?"
            f"model={model}&"
            f"language={lang_code}&"
            f"punctuate=true&"
            f"interim_results=true&"
            f"endpointing=300&"
            f"vad_events=true"
        )
        
        logger.info(f"Connecting to Deepgram with model={model}, lang={lang_code}")
        
        # websockets 13+ uses additional_headers instead of extra_headers
        self._ws = await websockets.connect(
            url,
            additional_headers={"Authorization": f"Token {DEEPGRAM_API_KEY}"}
        )
        
        # Start listening for responses
        self._task = asyncio.create_task(self._listen())
        logger.info("Deepgram connection established")
        
    async def _listen(self):
        """Listen for Deepgram responses."""
        try:
            async for message in self._ws:
                if self._closed:
                    break
                    
                data = json.loads(message)
                
                # Handle transcript results
                if data.get("type") == "Results":
                    channel = data.get("channel", {})
                    alternatives = channel.get("alternatives", [])
                    if alternatives:
                        transcript = alternatives[0].get("transcript", "")
                        is_final = data.get("is_final", False)
                        
                        if transcript.strip() and self.on_transcript:
                            await self.on_transcript(transcript, is_final)
                            
                elif data.get("type") == "Error":
                    logger.error(f"Deepgram error: {data}")
                    if self.on_error:
                        await self.on_error(data.get("message", "Unknown error"))
                        
        except Exception as e:
            logger.error(f"Deepgram listen error: {e}")
            if self.on_error and not self._closed:
                await self.on_error(str(e))
                
    async def send_audio(self, audio_data: bytes):
        """Send audio chunk to Deepgram."""
        if self._ws and not self._closed:
            try:
                await self._ws.send(audio_data)
            except Exception as e:
                logger.error(f"Error sending audio: {e}")
                
    async def close(self):
        """Close Deepgram connection."""
        self._closed = True
        if self._ws:
            try:
                # Send close message to finalize
                await self._ws.send(json.dumps({"type": "CloseStream"}))
                await asyncio.sleep(0.5)  # Give time for final results
                await self._ws.close()
            except:
                pass
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


# ============================================================================
# SOAP Generation
# ============================================================================

async def generate_soap_summary(transcript: str, language: str = "fr") -> Dict:
    """Generate SOAP note from transcript using OpenAI."""
    import openai
    
    client = openai.AsyncOpenAI()
    
    system_prompt = """Tu es un assistant médical expert. À partir de la transcription d'une consultation médicale, génère une note SOAP structurée.

Format de sortie JSON:
{
    "subjective": "Motif de consultation, symptômes rapportés par le patient, historique...",
    "objective": "Signes vitaux, examen physique, observations cliniques...",
    "assessment": "Diagnostic principal, diagnostics différentiels...",
    "plan": "Traitements prescrits, examens demandés, suivi prévu..."
}

Règles:
- Extrais uniquement ce qui est explicitement mentionné
- Si une section n'a pas d'information, indique "Non mentionné"
- Reste factuel et concis
- Utilise la terminologie médicale appropriée"""

    if language == "ar":
        system_prompt = """أنت مساعد طبي خبير. من نص استشارة طبية، أنشئ ملاحظة SOAP منظمة.

تنسيق الإخراج JSON:
{
    "subjective": "سبب الاستشارة، الأعراض التي أبلغ عنها المريض...",
    "objective": "العلامات الحيوية، الفحص السريري...",
    "assessment": "التشخيص الرئيسي...",
    "plan": "العلاجات الموصوفة، الفحوصات المطلوبة..."
}"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Transcription de la consultation:\n\n{transcript}"},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        
        result = json.loads(response.choices[0].message.content)
        return {
            "subjective": result.get("subjective", "Non mentionné"),
            "objective": result.get("objective", "Non mentionné"),
            "assessment": result.get("assessment", "Non mentionné"),
            "plan": result.get("plan", "Non mentionné"),
            "raw_transcript": transcript,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"SOAP generation error: {e}")
        return {
            "subjective": "Erreur de génération",
            "objective": "",
            "assessment": "",
            "plan": "",
            "raw_transcript": transcript,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "error": str(e),
        }


# ============================================================================
# WebSocket Endpoint
# ============================================================================

@router.websocket("/ws/{consultation_id}")
async def scribe_websocket(
    websocket: WebSocket,
    consultation_id: str,
):
    """
    WebSocket endpoint for real-time scribe transcription.
    
    Protocol:
    1. Client connects with consultation_id
    2. Client sends JSON: {"type": "start", "language": "fr", "token": "jwt..."}
    3. Client sends binary audio chunks (webm/opus from MediaRecorder)
    4. Server sends JSON: {"type": "transcript", "text": "...", "is_final": bool}
    5. Client sends JSON: {"type": "stop"} to end session
    6. Server sends JSON: {"type": "summary", "soap": {...}} and closes
    """
    await websocket.accept()
    logger.info(f"Scribe WebSocket connected for consultation {consultation_id}")
    
    session_id = None
    language = "fr"
    deepgram = None
    transcript_buffer = []
    ws_clinic_id = None
    
    async def handle_transcript(text: str, is_final: bool):
        """Handle transcript from Deepgram."""
        nonlocal transcript_buffer
        
        # Send to client
        await websocket.send_json({
            "type": "transcript",
            "text": text,
            "is_final": is_final,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        
        # Store final segments
        if is_final and session_id:
            store_scribe_segment(
                session_id=session_id,
                consultation_id=consultation_id,
                text=text,
                is_final=True,
                language=language,
                clinic_id=ws_clinic_id,
            )
            transcript_buffer.append(text)
            
    async def handle_error(error: str):
        """Handle Deepgram error."""
        await websocket.send_json({
            "type": "error",
            "message": error,
        })
    
    try:
        while True:
            message = await websocket.receive()
            
            # Handle text messages (JSON commands)
            if "text" in message:
                data = json.loads(message["text"])
                msg_type = data.get("type")
                
                if msg_type == "start":
                    # Validate token (simplified - in production, verify JWT)
                    token = data.get("token")
                    if not token:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Authentication required",
                        })
                        continue
                    
                    language = data.get("language", "fr")
                    
                    # Create session in DB
                    # For simplicity, extract user_id from token or use placeholder
                    # In production, properly decode JWT
                    try:
                        import jwt
                        payload = jwt.decode(token, options={"verify_signature": False})
                        doctor_id = payload.get("sub", "unknown")
                        ws_clinic_id = payload.get("clinic_id")
                    except:
                        doctor_id = "unknown"
                        ws_clinic_id = None
                    
                    session_id = create_scribe_session(
                        consultation_id=consultation_id,
                        doctor_id=doctor_id,
                        language=language,
                        clinic_id=ws_clinic_id,
                    )
                    
                    # Connect to Deepgram
                    deepgram = DeepgramStreamer(
                        language=language,
                        on_transcript=handle_transcript,
                        on_error=handle_error,
                    )
                    await deepgram.connect()
                    
                    await websocket.send_json({
                        "type": "started",
                        "session_id": session_id,
                        "language": language,
                    })
                    logger.info(f"Scribe session started: {session_id}")
                    
                elif msg_type == "stop":
                    logger.info(f"Stopping scribe session {session_id}")
                    
                    # Close Deepgram
                    if deepgram:
                        await deepgram.close()
                    
                    # Generate SOAP summary
                    full_transcript = " ".join(transcript_buffer)
                    soap = None
                    
                    if full_transcript.strip() and data.get("generate_summary", True):
                        await websocket.send_json({
                            "type": "status",
                            "message": "Generating summary...",
                        })
                        soap = await generate_soap_summary(full_transcript, language)
                    
                    # Complete session in DB
                    if session_id:
                        summary_text = json.dumps(soap) if soap else None
                        complete_scribe_session(session_id, summary_text)
                    
                    # Send final summary
                    await websocket.send_json({
                        "type": "summary",
                        "soap": soap,
                        "transcript": full_transcript,
                        "session_id": session_id,
                    })
                    
                    await websocket.close()
                    break
                    
            # Handle binary messages (audio data)
            elif "bytes" in message:
                if deepgram:
                    await deepgram.send_audio(message["bytes"])
                    
    except WebSocketDisconnect:
        logger.info(f"Scribe WebSocket disconnected for {consultation_id}")
    except Exception as e:
        logger.error(f"Scribe WebSocket error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e),
            })
        except:
            pass
    finally:
        # Cleanup
        if deepgram:
            await deepgram.close()
        if session_id and transcript_buffer:
            # Save any remaining transcript
            full_transcript = " ".join(transcript_buffer)
            complete_scribe_session(session_id, full_transcript)


# ============================================================================
# REST Endpoints
# ============================================================================

@router.get("/transcript/{consultation_id}")
async def get_transcript(
    consultation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get transcript for a consultation."""
    segments = get_scribe_transcript(consultation_id)
    return {
        "consultation_id": consultation_id,
        "segments": segments,
        "total": len(segments),
    }


@router.post("/generate-soap/{consultation_id}")
async def generate_soap(
    consultation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Generate SOAP summary from existing transcript."""
    segments = get_scribe_transcript(consultation_id)
    if not segments:
        raise HTTPException(status_code=404, detail="No transcript found")
    
    full_transcript = " ".join(s["text"] for s in segments if s.get("is_final"))
    
    if not full_transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty")
    
    soap = await generate_soap_summary(full_transcript)
    return soap
