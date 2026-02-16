/**
 * Voice mode types for MedicAI
 */

export type VoiceMode = 'assistant' | 'scribe';
export type VoiceLanguage = 'fr' | 'ar' | 'en';

export interface VoiceTokenRequest {
  consultation_id: string;
  mode: VoiceMode;
  language: VoiceLanguage;
}

export interface VoiceTokenResponse {
  token: string;
  room_name: string;
  url: string;
  mode: VoiceMode;
  language: VoiceLanguage;
  consultation_id: string;
  expires_in_seconds: number;
}

export interface VoiceSession {
  active: boolean;
  consultation_id: string;
  session_id?: string;
  room_name?: string;
  mode?: VoiceMode;
  language?: VoiceLanguage;
  started_at?: string;
}

export interface TranscriptSegment {
  id: string;
  speaker: 'doctor' | 'patient' | 'agent';
  text: string;
  is_final: boolean;
  language?: string;
  timestamp?: string;
  sequence_num?: number;
}

export interface VoiceTranscript {
  consultation_id: string;
  segments: TranscriptSegment[];
  total_segments: number;
}

export interface VoiceSessionSummary {
  consultation_id: string;
  total_segments: number;
  total_duration_seconds?: number;
  full_transcript: string;
  summary?: string;
}

export interface StopVoiceRequest {
  consultation_id: string;
  generate_summary?: boolean;
}

// LiveKit connection state
export type ConnectionState = 
  | 'disconnected'
  | 'connecting' 
  | 'connected'
  | 'reconnecting'
  | 'failed';

// Voice control state
export interface VoiceState {
  mode: VoiceMode;
  language: VoiceLanguage;
  connectionState: ConnectionState;
  isMicEnabled: boolean;
  isRecording: boolean;  // For scribe mode - actively recording
  isPushToTalk: boolean; // For assistant mode - holding PTT
  transcript: TranscriptSegment[];
  agentSpeaking: boolean;
  error?: string;
}
