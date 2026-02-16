'use client';

/**
 * VoiceControl Component
 * 
 * Unified voice interface with two modes:
 * - Assistant (Ask): Push-to-talk voice Q/A about patients
 * - Scribe (Record): Continuous transcription for notes
 * 
 * Uses LiveKit for realtime transport and text streams.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Room, 
  RoomEvent, 
  ConnectionState,
  RemoteParticipant,
  Track,
  TrackPublication,
  TranscriptionSegment as LKTranscriptionSegment,
  Participant,
} from 'livekit-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Mic,
  MicOff,
  Radio,
  Square,
  Volume2,
  VolumeX,
  Settings,
  X,
  Loader2,
  AlertCircle,
  MessageSquare,
  FileText,
  Languages,
} from 'lucide-react';
import { voiceApi } from '@/lib/api/voice';
import type {
  VoiceMode,
  VoiceLanguage,
  TranscriptSegment,
  VoiceTokenResponse,
} from '@/types/voice';
import { cn } from '@/lib/utils';

interface VoiceControlProps {
  consultationId: string;
  patientId?: string;
  onTranscriptUpdate?: (segments: TranscriptSegment[]) => void;
  onSummaryGenerated?: (summary: string) => void;
  className?: string;
}

type UIConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export function VoiceControl({
  consultationId,
  patientId,
  onTranscriptUpdate,
  onSummaryGenerated,
  className,
}: VoiceControlProps) {
  // State
  const [mode, setMode] = useState<VoiceMode>('assistant');
  const [language, setLanguage] = useState<VoiceLanguage>('fr');
  const [connectionState, setConnectionState] = useState<UIConnectionState>('disconnected');
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [scribeSummary, setScribeSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  
  // Refs
  const roomRef = useRef<Room | null>(null);
  const tokenDataRef = useRef<VoiceTokenResponse | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);
  
  // Notify parent of transcript updates
  useEffect(() => {
    onTranscriptUpdate?.(transcript);
  }, [transcript, onTranscriptUpdate]);
  
  // Recording timer
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecordingDuration(0);
    }
    
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);
  
  // Format duration as mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Handle text streams from LiveKit (transcriptions)
  const handleTextStream = useCallback((
    reader: ReadableStreamDefaultReader<string>,
    participantIdentity: string,
    topic: string,
  ) => {
    const readChunks = async () => {
      let fullText = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          fullText += value;
          
          // Parse transcription data if it's JSON
          try {
            const data = JSON.parse(fullText);
            const speaker = participantIdentity.startsWith('doctor') ? 'doctor' : 'agent';
            
            setTranscript(prev => {
              // Check if we should update existing or add new
              const existingIdx = prev.findIndex(
                s => s.id === data.id || (!s.is_final && s.speaker === speaker)
              );
              
              const segment: TranscriptSegment = {
                id: data.id || `${Date.now()}-${Math.random()}`,
                speaker: speaker as 'doctor' | 'agent',
                text: data.text || fullText,
                is_final: data.is_final ?? true,
                timestamp: new Date().toISOString(),
              };
              
              if (existingIdx >= 0 && !prev[existingIdx].is_final) {
                // Update interim
                const newTranscript = [...prev];
                newTranscript[existingIdx] = segment;
                return newTranscript;
              }
              
              return [...prev, segment];
            });
            
            fullText = ''; // Reset for next message
          } catch {
            // Not JSON, treat as plain text chunk
            if (topic === 'lk.transcription') {
              setTranscript(prev => {
                const speaker = participantIdentity.startsWith('doctor') ? 'doctor' : 'agent';
                return [...prev, {
                  id: `${Date.now()}-${Math.random()}`,
                  speaker: speaker as 'doctor' | 'agent',
                  text: value,
                  is_final: true,
                  timestamp: new Date().toISOString(),
                }];
              });
            }
          }
        }
      } catch (err) {
        console.error('Error reading text stream:', err);
      }
    };
    
    readChunks();
  }, []);
  
  // Connect to LiveKit room
  const connect = useCallback(async () => {
    try {
      setConnectionState('connecting');
      setError(null);
      setTranscript([]);  // Clear transcript on new connection
      setScribeSummary(null);
      
      // Get token from backend
      const tokenData = await voiceApi.getToken({
        consultation_id: consultationId,
        mode,
        language,
      });
      
      tokenDataRef.current = tokenData;
      
      // Create room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      
      roomRef.current = room;
      
      // Set up event handlers
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        setConnectionState(state as UIConnectionState);
        
        if (state === ConnectionState.Connected) {
          toast.success(mode === 'assistant' ? 'Assistant connecté' : 'Scribe prêt');
        } else if (state === ConnectionState.Disconnected) {
          setIsMicEnabled(false);
          setIsRecording(false);
        }
      });
      
      room.on(RoomEvent.TrackSubscribed, (
        track: Track,
        publication: TrackPublication,
        participant: RemoteParticipant
      ) => {
        // Handle agent audio track (assistant mode)
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach();
          audioElement.play().catch(console.error);
          setAgentSpeaking(true);
        }
      });
      
      room.on(RoomEvent.TrackUnsubscribed, (track: Track) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach();
          setAgentSpeaking(false);
        }
      });
      
      // Handle transcription events (primary method from LiveKit Agents)
      room.on(RoomEvent.TranscriptionReceived, (
        segments: LKTranscriptionSegment[],
        participant?: Participant
      ) => {
        console.log('Transcription received:', segments, 'from:', participant?.identity);
        
        segments.forEach((segment) => {
          const speaker = participant?.identity?.startsWith('doctor') ? 'doctor' : 'agent';
          
          setTranscript(prev => {
            // Check if we should update existing segment by ID
            const existingIdx = prev.findIndex(s => s.id === segment.id);
            
            const newSegment: TranscriptSegment = {
              id: segment.id || `${Date.now()}-${Math.random()}`,
              speaker: speaker as 'doctor' | 'agent',
              text: segment.text,
              is_final: segment.final,
              timestamp: new Date().toISOString(),
            };
            
            if (existingIdx >= 0) {
              // Update existing segment
              const updated = [...prev];
              updated[existingIdx] = newSegment;
              return updated;
            }
            
            // Add new segment
            return [...prev, newSegment];
          });
        });
      });
      
      // Register text stream handler for transcriptions (alternative method)
      // Note: In newer livekit-client, the handler receives TextStreamReader which may have different API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof room.registerTextStreamHandler === 'function') {
        try {
          room.registerTextStreamHandler('lk.transcription', async (reader: any, info: any) => {
            try {
              // Handle different reader types
              if (reader && typeof reader.read === 'function') {
                // ReadableStreamDefaultReader style
                handleTextStream(reader, info?.participantIdentity || 'unknown', 'lk.transcription');
              } else if (reader && typeof reader.readAll === 'function') {
                // LiveKit TextStreamReader style - read all at once
                const text = await reader.readAll();
                if (text) {
                  const speaker = info?.participantIdentity?.startsWith('doctor') ? 'doctor' : 'agent';
                  setTranscript(prev => [...prev, {
                    id: `${Date.now()}-${Math.random()}`,
                    speaker: speaker as 'doctor' | 'agent',
                    text: text,
                    is_final: true,
                    timestamp: new Date().toISOString(),
                  }]);
                }
              } else if (reader && reader.text) {
                // Direct text property
                const speaker = info?.participantIdentity?.startsWith('doctor') ? 'doctor' : 'agent';
                setTranscript(prev => [...prev, {
                  id: `${Date.now()}-${Math.random()}`,
                  speaker: speaker as 'doctor' | 'agent',
                  text: reader.text,
                  is_final: true,
                  timestamp: new Date().toISOString(),
                }]);
              } else {
                console.warn('Unknown text stream reader format:', reader);
              }
            } catch (err) {
              console.error('Error processing text stream:', err);
            }
          });
        } catch (err) {
          console.warn('registerTextStreamHandler not available or failed:', err);
        }
      }
      
      room.on(RoomEvent.Disconnected, () => {
        setConnectionState('disconnected');
        setIsMicEnabled(false);
        setIsRecording(false);
      });
      
      room.on(RoomEvent.MediaDevicesError, (err: Error) => {
        setError(`Erreur micro: ${err.message}`);
        toast.error('Impossible d\'accéder au microphone');
      });
      
      // Connect to room
      await room.connect(tokenData.url, tokenData.token);
      
      setConnectionState('connected');
      
      // Auto-enable mic for assistant mode (full chat experience)
      if (mode === 'assistant') {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          setIsMicEnabled(true);
        } catch (micErr) {
          console.error('Failed to auto-enable mic:', micErr);
          toast.error('Activez le micro manuellement');
        }
      }
      
    } catch (err: unknown) {
      console.error('Failed to connect:', err);
      const errorMessage = err instanceof Error ? err.message : 'Échec de connexion';
      setError(errorMessage);
      setConnectionState('failed');
      toast.error('Échec de connexion au serveur vocal');
    }
  }, [consultationId, mode, language, handleTextStream]);
  
  // Disconnect from room
  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      // Stop mic first
      if (isMicEnabled) {
        await roomRef.current.localParticipant?.setMicrophoneEnabled(false);
      }
      
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    
    setConnectionState('disconnected');
    setIsMicEnabled(false);
    setIsRecording(false);
    setAgentSpeaking(false);
  }, [isMicEnabled]);
  
  // Toggle microphone
  const toggleMic = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;
    
    try {
      const newState = !isMicEnabled;
      await roomRef.current.localParticipant.setMicrophoneEnabled(newState);
      setIsMicEnabled(newState);
      
      if (mode === 'scribe') {
        setIsRecording(newState);
      }
    } catch (err: any) {
      console.error('Mic toggle error:', err);
      toast.error('Erreur microphone');
    }
  }, [isMicEnabled, mode]);
  
  // Push-to-talk handlers (assistant mode)
  const startPTT = useCallback(async () => {
    if (mode !== 'assistant' || !roomRef.current?.localParticipant) return;
    
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(true);
      setIsMicEnabled(true);
      setIsPushToTalk(true);
    } catch (err) {
      console.error('PTT start error:', err);
    }
  }, [mode]);
  
  const stopPTT = useCallback(async () => {
    if (mode !== 'assistant' || !roomRef.current?.localParticipant) return;
    
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(false);
      setIsMicEnabled(false);
      setIsPushToTalk(false);
    } catch (err) {
      console.error('PTT stop error:', err);
    }
  }, [mode]);
  
  // Stop scribe session and generate summary
  const stopScribe = useCallback(async () => {
    try {
      // Stop recording
      if (roomRef.current?.localParticipant) {
        await roomRef.current.localParticipant.setMicrophoneEnabled(false);
      }
      setIsRecording(false);
      setIsMicEnabled(false);
      setIsGeneratingSummary(true);
      
      toast.loading('Génération du résumé...');
      
      // Call stop endpoint
      const result = await voiceApi.stopSession({
        consultation_id: consultationId,
        generate_summary: true,
      });
      
      toast.dismiss();
      setIsGeneratingSummary(false);
      
      if (result.summary) {
        toast.success('Résumé généré');
        setScribeSummary(result.summary);
        onSummaryGenerated?.(result.summary);
      } else {
        // If no summary from server, generate a simple one from transcript
        if (transcript.length > 0) {
          const simpleText = transcript.map(s => s.text).join(' ');
          setScribeSummary(`Transcription (${transcript.length} segments):\n\n${simpleText}`);
        }
      }
      
      // Disconnect but don't clear transcript
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      setConnectionState('disconnected');
      setAgentSpeaking(false);
      
    } catch (err: unknown) {
      toast.dismiss();
      setIsGeneratingSummary(false);
      
      // Even on error, show the transcript as summary
      if (transcript.length > 0) {
        const simpleText = transcript.map(s => s.text).join(' ');
        setScribeSummary(`Transcription (${transcript.length} segments):\n\n${simpleText}`);
        toast.success('Transcription sauvegardée');
      } else {
        toast.error('Erreur lors de l\'arrêt');
      }
      
      console.error('Stop scribe error:', err);
      
      // Still disconnect
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      setConnectionState('disconnected');
    }
  }, [consultationId, onSummaryGenerated, transcript]);
  
  // Keyboard handlers for PTT
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && mode === 'assistant' && connectionState === 'connected' && !isPushToTalk) {
        e.preventDefault();
        startPTT();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && mode === 'assistant' && isPushToTalk) {
        e.preventDefault();
        stopPTT();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [mode, connectionState, isPushToTalk, startPTT, stopPTT]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);
  
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  
  return (
    <div className={cn('flex flex-col', className)}>
      {/* Main Control Bar */}
      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
        {/* Mode Toggle */}
        <div className="flex items-center gap-1 bg-transparent rounded-md p-1">
          <Button
            variant={mode === 'assistant' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              if (!isConnected) {
                setMode('assistant');
                setTranscript([]);  // Clear transcript on mode change
                setScribeSummary(null);
              }
            }}
            disabled={isConnected}
            className="h-7 px-2 text-xs"
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Ask
          </Button>
          <Button
            variant={mode === 'scribe' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              if (!isConnected) {
                setMode('scribe');
                setTranscript([]);  // Clear transcript on mode change
                setScribeSummary(null);
              }
            }}
            disabled={isConnected}
            className="h-7 px-2 text-xs"
          >
            <FileText className="h-3 w-3 mr-1" />
            Record
          </Button>
        </div>
        
        <Separator orientation="vertical" className="h-6" />
        
        {/* Connection / Control */}
        {!isConnected ? (
          <Button
            onClick={connect}
            disabled={isConnecting}
            size="sm"
            className="gap-1"
          >
            {isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {isConnecting ? 'Connexion...' : 'Démarrer'}
          </Button>
        ) : (
          <>
            {mode === 'assistant' ? (
              // Assistant: Full chat mode with always-on mic (VAD handles turn-taking)
              <div className="flex items-center gap-">
                <Button
                  onClick={toggleMic}
                  variant={isMicEnabled ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'gap-1 transition-all',
                    isMicEnabled && 'bg-green-500 hover:bg-green-600'
                  )}
                >
                  {isMicEnabled ? (
                    <Radio className="h-4 w-4 animate-pulse" />
                  ) : (
                    <MicOff className="h-4 w-4" />
                  )}
                  {isMicEnabled ? 'Écoute...' : 'Activer micro'}
                </Button>
              </div>
            ) : (
              // Scribe: Record toggle
              <>
                {isRecording ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="animate-pulse gap-1">
                      <Radio className="h-1 w-1" />
                      REC {formatDuration(recordingDuration)}
                    </Badge>
                    <Button
                      onClick={stopScribe}
                      variant="destructive"
                      size="sm"
                      className="gap-1"
                    >
                      <Square className="h-1 w-1 fill-current" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={toggleMic}
                    variant="default"
                    size="sm"
                    className="gap-1 bg-red-500 hover:bg-red-600"
                  >
                    <Radio className="h-4 w-4" />
                    Enregistrer
                  </Button>
                )}
              </>
            )}

            {/* Agent speaking indicator 
            {agentSpeaking && (
              <Badge variant="secondary" className="gap-1">
                <Volume2 className="h-3 w-3 animate-pulse" />
                Agent
              </Badge>
            )}*/}
            
            {/* Disconnect */}
            <Button
              onClick={disconnect}
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
        
        {/* Settings 
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSettings(true)}
          className="h-7 w-7 p-0 ml-auto"
        >
          <Settings className="h-4 w-4" />
        </Button>
        */}
      </div>
      
      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 mt-2 p-2 bg-destructive/10 text-destructive rounded text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      
      {/* Transcript display */}
      {transcript.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-muted-foreground mb-1">Transcription en direct</div>
          <ScrollArea className="h-32 rounded border bg-muted/30">
            <div ref={transcriptRef} className="p-2 space-y-1 text-sm">
              {transcript.map((segment, idx) => (
                <div
                  key={segment.id || idx}
                  className={cn(
                    'p-1 rounded',
                    segment.speaker === 'doctor' 
                      ? 'bg-muted text-foreground'
                      : 'bg-[var(--medicai-green-light)] text-[var(--medicai-green-dark)]',
                    !segment.is_final && 'opacity-60 italic'
                  )}
                >
                  <span className="font-medium text-xs mr-1">
                    {segment.speaker === 'doctor' ? '👨‍⚕️' : '🤖'}
                  </span>
                  {segment.text}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
      
      {/* Scribe Summary display */}
      {scribeSummary && mode === 'scribe' && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-muted-foreground">Résumé de la transcription</div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(scribeSummary);
                  toast.success('Copié dans le presse-papier');
                }}
              >
                Copier
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setScribeSummary(null);
                  setTranscript([]);
                }}
              >
                Effacer
              </Button>
            </div>
          </div>
          <ScrollArea className="h-40 rounded border bg-green-500/5">
            <div className="p-3 text-sm whitespace-pre-wrap">
              {scribeSummary}
            </div>
          </ScrollArea>
        </div>
      )}
      
      {/* Generating summary indicator */}
      {isGeneratingSummary && (
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Génération du résumé...
        </div>
      )}
      
      {/* Hint text */}
      {isConnected && mode === 'assistant' && isMicEnabled && (
        <div className="text-xs text-muted-foreground mt-1 text-center">
          Parlez naturellement - l&apos;assistant détecte automatiquement quand vous parlez
        </div>
      )}
      
      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Paramètres Voix</DialogTitle>
            <DialogDescription>
              Configurez les options de transcription et d'assistant vocal.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Language Selection */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Langue</span>
              </div>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as VoiceLanguage)}
                disabled={isConnected}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Mode explanation */}
            <div className="p-3 bg-muted rounded-lg text-sm space-y-2">
              <div className="font-medium">Modes disponibles:</div>
              <div className="space-y-1 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Ask (Assistant):</span>{' '}
                  Conversation naturelle avec accès complet aux données patients
                </div>
                <div>
                  <span className="font-medium text-foreground">Record (Scribe):</span>{' '}
                  Transcription continue avec résumé structuré à la fin
                </div>
              </div>
            </div>
            
            {/* Privacy notice */}
            <div className="p-3 bg-muted rounded-lg text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="text-muted-foreground">
                  Les données audio sont traitées par des services IA tiers 
                  (Deepgram, OpenAI, Cartesia). Assurez-vous d'avoir le 
                  consentement du patient.
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default VoiceControl;
