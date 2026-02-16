# MedicAI Voice Modes Implementation

This document describes the voice modes feature for MedicAI, enabling voice-based interaction during consultations.

## Overview

Two voice modes are available:
- **Assistant (Ask)**: Push-to-talk voice Q/A about patients - speaks back responses
- **Scribe (Record)**: Continuous transcription for notes - no voice replies

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Frontend      │────▶│   LiveKit Room   │◀────│   Agent Worker      │
│   (Doctor Web)  │     │   (Cloud/Self)   │     │   (Python Process)  │
└────────┬────────┘     └──────────────────┘     └──────────┬──────────┘
         │                                                   │
         │  HTTP API                                        │  HTTP API
         ▼                                                   ▼
┌─────────────────┐                                 ┌─────────────────┐
│   FastAPI       │◀───────────────────────────────│   Backend APIs  │
│   Backend       │                                 │   (Patient Data)│
└─────────────────┘                                 └─────────────────┘
```

### Components

1. **Frontend** (`frontend/components/workspace/voice-control.tsx`)
   - LiveKit client connection
   - Push-to-talk / recording controls
   - Real-time transcript display
   - Mode toggle (Ask/Record)

2. **Backend API** (`app/api/voice.py`)
   - Token generation with agent dispatch
   - Session management
   - Transcript storage
   - Summary generation (scribe mode)

3. **Agent Worker** (`agent/main.py`)
   - LiveKit Agents framework
   - STT (Deepgram) + LLM (OpenAI) + TTS (Cartesia)
   - Patient data tools via backend API
   - Transcript persistence

## Language Support

| Language | STT Model | TTS Support |
|----------|-----------|-------------|
| French (fr) | Deepgram Nova-3 | Cartesia Sonic |
| Arabic (ar) | Deepgram Whisper | Cartesia Sonic |
| English (en) | Deepgram Nova-3 | Cartesia Sonic |

**Note**: Arabic uses Deepgram's hosted Whisper model as Nova doesn't support Arabic.

## Setup

### 1. Environment Variables

Add to `.env`:

```bash
# LiveKit Server
LIVEKIT_URL=wss://your-livekit-instance.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# Deepgram (STT)
DEEPGRAM_API_KEY=your_deepgram_api_key

# Cartesia (TTS)
CARTESIA_API_KEY=your_cartesia_api_key

# Backend URL (for agent)
BACKEND_URL=http://localhost:8000
```

### 2. Install Dependencies

**Backend (API):**
```bash
pip install livekit-api httpx
```

**Agent Worker:**
```bash
pip install -r requirements-agent.txt
# Or with uv:
uv add "livekit-agents[openai,deepgram,cartesia,silero]~=1.3"
```

**Frontend:**
```bash
cd frontend
npm install livekit-client
```

### 3. Run Database Migration

```bash
psql -U postgres -d medicai -f migrations/005_voice_sessions_transcripts.sql
```

### 4. Start the Agent Worker

```bash
cd agent
python main.py dev  # Development mode with auto-reload
# Or for production:
python main.py start
```

## Usage

### In the Consultation Workspace

1. Click the **Voice** tab in the chat composer area
2. Select mode: **Ask** (assistant) or **Record** (scribe)
3. Click **Démarrer** to connect

**Assistant Mode:**
- Hold the button or press Space to speak
- Release to get AI response
- AI uses patient data tools for grounded answers

**Scribe Mode:**
- Click **Enregistrer** to start continuous recording
- Transcripts appear in real-time
- Click **Arrêter** to stop and generate summary

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/voice/token` | POST | Get LiveKit token with agent dispatch |
| `/api/voice/stop` | POST | Stop session & generate summary |
| `/api/voice/transcript/{id}` | GET | Get session transcript |
| `/api/voice/session/{id}` | GET | Get active session status |

## Technical Details

### Agent Dispatch

When a doctor requests a voice token, the backend includes `RoomConfiguration` with `RoomAgentDispatch` metadata:

```python
RoomConfiguration(
    agents=[RoomAgentDispatch(
        agent_name="medicai-voice",
        metadata=json.dumps({
            "mode": "assistant",  # or "scribe"
            "consultation_id": "...",
            "patient_id": "...",
            "language": "fr",
        })
    )]
)
```

This automatically dispatches the agent when the doctor joins the room.

### Patient Data Tools (Assistant Mode)

The agent has access to these tools for retrieving patient context:
- `get_patient_snapshot()` - Demographics, conditions, meds, recent labs
- `get_abnormal_labs(since_days)` - Abnormal lab results
- `get_medication_list()` - Current medications
- `get_recent_consultations(limit)` - Consultation history

### Transcript Persistence

Both modes persist transcripts to `voice_transcript_segments` table:
- `speaker`: 'doctor' | 'agent'
- `text`: Transcript text
- `is_final`: Whether segment is final
- `timestamp`: When segment was captured

## Security Considerations

1. **Authentication**: All voice endpoints require JWT authentication
2. **Access Control**: Doctors can only access their consultation's voice data
3. **Privacy Notice**: UI displays AI processing disclosure
4. **Audit Logging**: Session start/stop events are logged

## Troubleshooting

### "LiveKit credentials not configured"
- Ensure `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are set in `.env`

### "Deepgram Whisper rate limits" (Arabic)
- Whisper has stricter rate limits than Nova
- Consider batching for high-volume Arabic usage

### "No audio from agent" (Assistant mode)
- Check browser permissions for speaker output
- Verify Cartesia API key is valid
- Check agent worker logs for TTS errors

### Agent not connecting
- Verify agent worker is running: `python agent/main.py dev`
- Check LiveKit server is accessible
- Verify agent name matches: `medicai-voice`
