CREATE TABLE IF NOT EXISTS voice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id TEXT NOT NULL,
    patient_id TEXT,
    doctor_id UUID NOT NULL REFERENCES users(id),

    room_name TEXT NOT NULL,

    mode TEXT NOT NULL CHECK (mode IN ('assistant', 'scribe')),

    language TEXT NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'ar', 'en')),

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
CREATE INDEX IF NOT EXISTS idx_voice_sessions_started_at
    ON voice_sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS voice_transcript_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES voice_sessions(id) ON DELETE CASCADE,
    consultation_id TEXT NOT NULL,

    speaker TEXT NOT NULL CHECK (speaker IN ('doctor', 'patient', 'agent')),

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
CREATE INDEX IF NOT EXISTS idx_voice_segments_order
    ON voice_transcript_segments(session_id, sequence_num);

COMMENT ON TABLE voice_sessions IS
    'Voice interaction sessions for Assistant (voice Q/A) and Scribe (transcription) modes';
COMMENT ON TABLE voice_transcript_segments IS
    'Individual transcript segments from voice sessions';
COMMENT ON COLUMN voice_sessions.mode IS
    'assistant: STT→LLM→TTS voice Q/A, scribe: STT-only transcription';
COMMENT ON COLUMN voice_sessions.language IS
    'Primary language: fr=French, ar=Arabic, en=English';
COMMENT ON COLUMN voice_transcript_segments.speaker IS
    'doctor: physician input, patient: (future), agent: AI assistant responses';
