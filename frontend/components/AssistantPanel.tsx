'use client';

/**
 * AssistantPanel Component
 * 
 * Full-featured voice assistant with database access.
 * Uses LiveKit for realtime STT → LLM → TTS pipeline.
 * 
 * Features:
 * - Push-to-talk or VAD (hands-free) voice interaction
 * - Full patient database access via function calls
 * - Real-time transcript display
 * - Works without a specific consultation context
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  LocalParticipant,
  RemoteParticipant,
} from 'livekit-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
  AlertCircle,
  MessageSquare,
  Bot,
  User,
  Settings,
  Phone,
  PhoneOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TranscriptSegment {
  id: string;
  speaker: 'doctor' | 'agent';
  text: string;
  timestamp: string;
}

interface AssistantPanelProps {
  className?: string;
  onTranscriptUpdate?: (transcript: TranscriptSegment[]) => void;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function AssistantPanel({
  className,
  onTranscriptUpdate,
}: AssistantPanelProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [language, setLanguage] = useState<'fr' | 'ar' | 'en'>('fr');
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  // Notify parent of transcript changes
  useEffect(() => {
    onTranscriptUpdate?.(transcript);
  }, [transcript, onTranscriptUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const getToken = () => {
    return localStorage.getItem('medicai_token') || '';
  };

  const getApiUrl = () => {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  };

  const connect = useCallback(async () => {
    try {
      setStatus('connecting');
      setError(null);
      setTranscript([]);

      const apiUrl = getApiUrl();
      const authToken = getToken();
      
      console.log('[AssistantPanel] Connecting to:', `${apiUrl}/api/voice/assistant/token`);
      console.log('[AssistantPanel] Auth token present:', !!authToken);

      // Get LiveKit token from backend (assistant-only endpoint)
      const response = await fetch(`${apiUrl}/api/voice/assistant/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[AssistantPanel] Token error:', response.status, errorData);
        throw new Error(errorData.detail || `Failed to get voice token (${response.status})`);
      }

      const { token, url, room_name } = await response.json();

      // Create and connect to LiveKit room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // Setup event listeners
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        switch (state) {
          case ConnectionState.Connected:
            setStatus('connected');
            break;
          case ConnectionState.Disconnected:
            setStatus('disconnected');
            break;
          case ConnectionState.Reconnecting:
            setStatus('connecting');
            break;
        }
      });

      // Handle transcription events
      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        const speaker = participant?.identity?.startsWith('doctor') ? 'doctor' : 'agent';
        
        segments.forEach((segment) => {
          if (segment.text?.trim()) {
            setTranscript((prev) => {
              // Update existing segment or add new
              const existingIdx = prev.findIndex((s) => s.id === segment.id);
              
              const newSegment: TranscriptSegment = {
                id: segment.id || `${Date.now()}-${Math.random()}`,
                speaker: speaker as 'doctor' | 'agent',
                text: segment.text,
                timestamp: new Date().toISOString(),
              };

              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = newSegment;
                return updated;
              }

              return [...prev, newSegment];
            });
          }
        });
      });

      // Track agent speaking state and attach audio for playback
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio && !participant.isLocal) {
          console.log('[AssistantPanel] Agent audio track subscribed, attaching for playback');
          
          // Attach the audio track to an audio element for playback
          const audioElement = track.attach();
          audioElement.id = 'agent-audio';
          document.body.appendChild(audioElement);
          
          track.on('unmuted', () => setAgentSpeaking(true));
          track.on('muted', () => setAgentSpeaking(false));
        }
      });

      // Remove audio element when track is unsubscribed
      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio && !participant.isLocal) {
          console.log('[AssistantPanel] Agent audio track unsubscribed, detaching');
          track.detach().forEach((el) => el.remove());
        }
      });

      // Connect to room
      await room.connect(url, token);
      
      // Enable mic by default
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMicEnabled(true);

      setStatus('connected');
      toast.success('Assistant connecté');
    } catch (err: any) {
      console.error('[AssistantPanel] Connection error:', err);
      const errorMsg = err.message || 'Erreur de connexion';
      setError(errorMsg);
      setStatus('error');
      toast.error(`Assistant: ${errorMsg}`);
    }
  }, [language]);

  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    // Clean up any attached audio elements
    const agentAudio = document.getElementById('agent-audio');
    if (agentAudio) {
      agentAudio.remove();
    }
    setStatus('disconnected');
    setIsMicEnabled(false);
    setAgentSpeaking(false);
  }, []);

  const toggleMic = useCallback(async () => {
    if (!roomRef.current) return;
    
    const enabled = !isMicEnabled;
    await roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
    setIsMicEnabled(enabled);
  }, [isMicEnabled]);

  const statusConfig = {
    disconnected: { color: 'bg-gray-100', text: 'Déconnecté', icon: PhoneOff },
    connecting: { color: 'bg-yellow-100', text: 'Connexion...', icon: Loader2 },
    connected: { color: 'bg-green-100 text-green-700', text: 'Connecté', icon: Phone },
    error: { color: 'bg-red-100 text-red-700', text: 'Erreur', icon: AlertCircle },
  };

  const StatusIcon = statusConfig[status].icon;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Assistant Medicai
          </CardTitle>
          <Badge className={cn('capitalize', statusConfig[status].color)}>
            <StatusIcon
              className={cn(
                'h-3 w-3 mr-1',
                status === 'connecting' && 'animate-spin'
              )}
            />
            {statusConfig[status].text}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Posez vos questions sur les patients, résultats de labo, médicaments...
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4">
        {/* Language selector */}
        <div className="flex items-center gap-3">
          <Select
            value={language}
            onValueChange={(v) => setLanguage(v as 'fr' | 'ar' | 'en')}
            disabled={status === 'connected'}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">🇫🇷 Français</SelectItem>
              <SelectItem value="ar">🇲🇦 العربية</SelectItem>
              <SelectItem value="en">🇬🇧 English</SelectItem>
            </SelectContent>
          </Select>

          {status === 'disconnected' || status === 'error' ? (
            <Button onClick={connect} className="flex-1">
              <Phone className="h-4 w-4 mr-2" />
              Démarrer
            </Button>
          ) : status === 'connected' ? (
            <Button onClick={disconnect} variant="destructive" className="flex-1">
              <PhoneOff className="h-4 w-4 mr-2" />
              Terminer
            </Button>
          ) : (
            <Button disabled className="flex-1">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Connexion...
            </Button>
          )}
        </div>

        {/* Mic controls when connected */}
        {status === 'connected' && (
          <div className="flex items-center justify-center gap-4">
            <Button
              variant={isMicEnabled ? 'default' : 'outline'}
              size="lg"
              onClick={toggleMic}
              className={cn(
                'h-16 w-16 rounded-full',
                isMicEnabled && 'bg-red-500 hover:bg-red-600'
              )}
            >
              {isMicEnabled ? (
                <Mic className="h-6 w-6" />
              ) : (
                <MicOff className="h-6 w-6" />
              )}
            </Button>

            {agentSpeaking && (
              <div className="flex items-center gap-2 text-primary">
                <Volume2 className="h-5 w-5 animate-pulse" />
                <span className="text-sm">L'assistant parle...</span>
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Transcript */}
        <div className="flex-1 min-h-0">
          <h3 className="text-sm font-medium mb-2">Conversation</h3>
          <div
            ref={scrollRef}
            className="h-[300px] border rounded-md p-3 overflow-y-auto bg-muted/30"
          >
            {transcript.length === 0 ? (
              <p className="text-muted-foreground text-sm italic text-center mt-8">
                {status === 'connected'
                  ? 'Parlez pour poser une question...'
                  : 'Cliquez "Démarrer" pour commencer'}
              </p>
            ) : (
              <div className="space-y-3">
                {transcript.map((segment) => (
                  <div
                    key={segment.id}
                    className={cn(
                      'flex gap-2',
                      segment.speaker === 'doctor' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {segment.speaker === 'agent' && (
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-3 w-3 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                        segment.speaker === 'doctor'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      )}
                    >
                      {segment.text}
                    </div>
                    {segment.speaker === 'doctor' && (
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <User className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Suggestions */}
        {status === 'connected' && transcript.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Exemples de questions:</p>
            <div className="flex flex-wrap gap-2">
              {[
                'Résumé du patient',
                'Derniers résultats de labo',
                'Médicaments actuels',
                'Changements depuis la dernière visite',
              ].map((suggestion) => (
                <Badge
                  key={suggestion}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                >
                  {suggestion}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AssistantPanel;
