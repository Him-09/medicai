'use client';

/**
 * VoiceAssistant - Draggable voice assistant with transcript
 * 
 * A compact floating control that can be positioned anywhere.
 * Includes adjustable transparency transcript panel.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
} from 'livekit-client';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import {
  Mic,
  MicOff,
  Volume2,
  Loader2,
  Bot,
  X,
  MessageSquare,
  GripVertical,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TranscriptSegment {
  id: string;
  speaker: 'doctor' | 'agent';
  text: string;
  timestamp: string;
}

interface VoiceAssistantProps {
  className?: string;
  onTranscriptUpdate?: (transcript: TranscriptSegment[]) => void;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function VoiceAssistant({
  className,
  onTranscriptUpdate,
}: VoiceAssistantProps) {
  const pathname = usePathname();
  const isWelcomePage = pathname === '/' || pathname === '';
  
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptOpacity, setTranscriptOpacity] = useState(0.95);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  
  // Dragging state - welcome page: top-right, other pages: bottom-right
  const [position, setPosition] = useState({ x: 16, y: isWelcomePage ? 16 : 16 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  const roomRef = useRef<Room | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // On non-welcome pages, only visible when actively connected/connecting
  const isVisible = isWelcomePage || status !== 'disconnected';

  useEffect(() => {
    onTranscriptUpdate?.(transcript);
  }, [transcript, onTranscriptUpdate]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 200, dragRef.current.startPosX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.startPosY + dy)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const getToken = () => localStorage.getItem('medicai_token') || '';
  const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const connect = useCallback(async () => {
    try {
      setStatus('connecting');
      setTranscript([]);

      const response = await fetch(`${getApiUrl()}/api/voice/assistant/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ language }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Erreur (${response.status})`);
      }

      const { token, url } = await response.json();

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Connected) {
          setStatus('connected');
          setShowTranscript(true);
        }
        else if (state === ConnectionState.Disconnected) setStatus('disconnected');
        else if (state === ConnectionState.Reconnecting) setStatus('connecting');
      });

      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        const speaker = participant?.identity?.startsWith('doctor') ? 'doctor' : 'agent';
        segments.forEach((segment) => {
          if (segment.text?.trim()) {
            setTranscript((prev) => {
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

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio && !participant.isLocal) {
          const audioElement = track.attach();
          audioElement.id = 'agent-audio';
          document.body.appendChild(audioElement);
          track.on('unmuted', () => setAgentSpeaking(true));
          track.on('muted', () => setAgentSpeaking(false));
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio && !participant.isLocal) {
          track.detach().forEach((el) => el.remove());
        }
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMicEnabled(true);
      setStatus('connected');
      toast.success('Assistant connecté');
    } catch (err: any) {
      setStatus('error');
      toast.error(err.message || 'Erreur de connexion');
    }
  }, [language]);

  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    document.getElementById('agent-audio')?.remove();
    setStatus('disconnected');
    setIsMicEnabled(false);
    setAgentSpeaking(false);
    setIsExpanded(false);
    setShowTranscript(false);
  }, []);

  const toggleMic = useCallback(async () => {
    if (!roomRef.current) return;
    const enabled = !isMicEnabled;
    await roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
    setIsMicEnabled(enabled);
  }, [isMicEnabled]);

  const cycleLanguage = () => {
    const langs: ('fr' | 'en')[] = ['fr', 'en'];
    const idx = langs.indexOf(language);
    setLanguage(langs[(idx + 1) % langs.length]);
  };

  const langFlag = { fr: '🇫🇷', en: '🇬🇧' }[language];

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn("fixed z-50 transition-opacity duration-200", !isVisible && "opacity-0 pointer-events-none")}
        style={isWelcomePage 
          ? { right: position.x, top: position.y }
          : { right: 16, bottom: 16 }
        }
      >
        {/* Main Control Bar */}
        <div
          onMouseDown={isWelcomePage ? handleMouseDown : undefined}
          className={cn(
            'flex items-center gap-1 rounded-full shadow-lg border bg-background transition-all duration-300 overflow-hidden',
            isWelcomePage && 'cursor-move',
            isExpanded || status === 'connected' ? 'p-1' : 'p-0',
            isDragging && 'opacity-80',
            className
          )}
        >
          {/* Drag handle - only on welcome page */}
          {isWelcomePage && (isExpanded || status === 'connected') && (
            <div className="h-10 w-4 flex items-center justify-center text-muted-foreground/50">
              <GripVertical className="h-3 w-3" />
            </div>
          )}

          {/* Main trigger button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                onClick={() => {
                  if (status === 'connected') {
                    toggleMic();
                  } else {
                    setIsExpanded(!isExpanded);
                  }
                }}
                className={cn(
                  'h-10 w-10 rounded-full shrink-0 transition-all duration-200',
                  status === 'connected'
                    ? isMicEnabled
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-muted hover:bg-muted/80'
                    : status === 'connecting'
                    ? 'bg-muted animate-pulse'
                    : 'bg-primary hover:bg-primary/90',
                  agentSpeaking && 'ring-2 ring-[var(--medicai-green)] ring-offset-2'
                )}
              >
                {status === 'connecting' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : status === 'connected' ? (
                  isMicEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {status === 'connected' 
                ? (isMicEnabled ? 'Couper micro' : 'Activer micro')
                : 'Assistant vocal'}
            </TooltipContent>
          </Tooltip>

          {/* Expanded controls - disconnected */}
          {isExpanded && status !== 'connected' && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={cycleLanguage}
                    className="h-8 w-8 rounded-full shrink-0 text-sm"
                  >
                    {langFlag}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">{language.toUpperCase()}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    onClick={connect}
                    disabled={status === 'connecting'}
                    className="h-8 w-8 rounded-full shrink-0 bg-[var(--medicai-green)] hover:bg-[var(--medicai-green-dark)] text-foreground"
                  >
                    {status === 'connecting' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Démarrer</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsExpanded(false)}
                    className="h-8 w-8 rounded-full shrink-0 text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Fermer</TooltipContent>
              </Tooltip>
            </>
          )}

          {/* Connected controls */}
          {status === 'connected' && (
            <>
              {agentSpeaking && (
                <div className="h-8 w-8 flex items-center justify-center shrink-0">
                  <Volume2 className="h-4 w-4 text-[var(--medicai-green-dark)] animate-pulse" />
                </div>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={showTranscript ? 'default' : 'ghost'}
                    onClick={() => setShowTranscript(!showTranscript)}
                    className={cn('h-8 w-8 rounded-full shrink-0', showTranscript && 'bg-muted')}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Transcript</TooltipContent>
              </Tooltip>

              <div className="flex-1" /> {/* Spacer to push disconnect to right */}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={disconnect}
                    className="h-8 w-8 rounded-full shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Déconnecter</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        {/* Transcript Panel */}
        {showTranscript && status === 'connected' && (
          <div 
            className="mt-2 w-72 rounded-lg border shadow-lg overflow-hidden"
            style={{ 
              opacity: transcriptOpacity,
              backdropFilter: 'blur(8px)',
              backgroundColor: 'var(--background)',
            }}
          >
            {/* Header with opacity control */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
              <MessageSquare className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium flex-1">Conversation</span>
              <div className="flex items-center gap-2">
                <Eye className="h-3 w-3 text-muted-foreground" />
                <Slider
                  value={[transcriptOpacity * 100]}
                  onValueChange={(values: number[]) => setTranscriptOpacity(values[0] / 100)}
                  min={30}
                  max={100}
                  step={5}
                  className="w-16"
                />
              </div>
            </div>

            {/* Messages */}
            <div className="h-48 overflow-y-auto p-2 space-y-1.5">
              {transcript.length === 0 ? (
                <p className="text-muted-foreground text-xs text-center py-6">
                  Parlez pour commencer...
                </p>
              ) : (
                transcript.map((seg) => (
                  <div
                    key={seg.id}
                    className={cn(
                      'text-xs p-2 rounded-lg max-w-[85%]',
                      seg.speaker === 'doctor'
                        ? 'bg-primary text-primary-foreground ml-auto'
                        : 'bg-muted'
                    )}
                  >
                    {seg.text}
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default VoiceAssistant;
