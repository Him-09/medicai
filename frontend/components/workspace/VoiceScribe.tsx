'use client';

/**
 * VoiceScribe - Ultra-compact scribe for workspace toolbar
 * 
 * Single button that expands into inline controls.
 * Uses popovers for transcript/SOAP to save space.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
  Square,
  Loader2,
  FileText,
  Copy,
  RotateCcw,
  CheckCircle2,
  X,
  MessageSquare,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SOAPSummary {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  raw_transcript: string;
  generated_at: string;
}

interface VoiceScribeProps {
  consultationId: string;
  language?: 'fr' | 'en';
  onTranscriptChange?: (transcript: string) => void;
  onSOAPGenerated?: (soap: SOAPSummary) => void;
  className?: string;
}

type ScribeStatus = 'idle' | 'connecting' | 'recording' | 'processing' | 'done' | 'error';

export function VoiceScribe({
  consultationId,
  language: initialLanguage = 'fr',
  onTranscriptChange,
  onSOAPGenerated,
  className,
}: VoiceScribeProps) {
  const [status, setStatus] = useState<ScribeStatus>('idle');
  const [transcript, setTranscript] = useState<string[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [soap, setSOAP] = useState<SOAPSummary | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [language, setLanguage] = useState(initialLanguage);
  const [isExpanded, setIsExpanded] = useState(false);
  const [panelOpacity, setPanelOpacity] = useState(0.95);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isRecordingRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fullText = transcript.join(' ');
    onTranscriptChange?.(fullText);
  }, [transcript, onTranscriptChange]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  const getToken = () => localStorage.getItem('medicai_token') || '';

  const startRecording = useCallback(async () => {
    try {
      setStatus('connecting');
      setTranscript([]);
      setInterimText('');
      setSOAP(null);
      setDuration(0);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      const updateLevel = () => {
        if (analyzerRef.current && isRecordingRef.current) {
          analyzerRef.current.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(avg / 255);
          requestAnimationFrame(updateLevel);
        }
      };

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.hostname}:8000/api/scribe/ws/${consultationId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'start', language, token: getToken() }));
        
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = async (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            const buffer = await e.data.arrayBuffer();
            ws.send(buffer);
          }
        };
        
        mediaRecorder.start(100);
        
        setStatus('recording');
        isRecordingRef.current = true;
        requestAnimationFrame(updateLevel);
        timerRef.current = setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'started') {
            console.log('Scribe session started:', data.session_id);
          } else if (data.type === 'transcript') {
            if (data.is_final) {
              setTranscript((prev) => [...prev, data.text]);
              setInterimText('');
            } else {
              setInterimText(data.text);
            }
          } else if (data.type === 'summary' || data.type === 'soap') {
            const soapData = data.soap;
            if (soapData) {
              setSOAP(soapData);
              onSOAPGenerated?.(soapData);
              setStatus('done');
              toast.success('SOAP généré');
            } else {
              setStatus('done');
            }
          } else if (data.type === 'status') {
            console.log('Scribe status:', data.message);
          } else if (data.type === 'error') {
            throw new Error(data.message);
          }
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      };

      ws.onerror = () => {
        setStatus('error');
        toast.error('Erreur de connexion');
      };

      ws.onclose = () => {
        if (status === 'recording') {
          setStatus('idle');
        }
      };
    } catch (err: any) {
      setStatus('error');
      toast.error(err.message || 'Erreur microphone');
    }
  }, [consultationId, language, onSOAPGenerated, status]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setStatus('processing');
      wsRef.current.send(JSON.stringify({ type: 'stop', generate_summary: true }));
    } else {
      setStatus('idle');
    }
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const copySOAP = () => {
    if (!soap) return;
    const text = `S: ${soap.subjective}\nO: ${soap.objective}\nA: ${soap.assessment}\nP: ${soap.plan}`;
    navigator.clipboard.writeText(text);
    toast.success('Copié');
  };

  const copyTranscript = () => {
    const text = transcript.join(' ');
    navigator.clipboard.writeText(text);
    toast.success('Copié');
  };

  const reset = () => {
    setStatus('idle');
    setTranscript([]);
    setInterimText('');
    setSOAP(null);
    setDuration(0);
    setIsExpanded(false);
  };

  const cycleLanguage = () => {
    const langs: ('fr' | 'en')[] = ['fr', 'en'];
    const idx = langs.indexOf(language);
    setLanguage(langs[(idx + 1) % langs.length]);
  };

  const langFlag = { fr: '🇫🇷', en: '🇬🇧' }[language];

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-full border bg-background shadow-md transition-all duration-200 overflow-hidden p-0.5',
          status === 'recording' && 'border-destructive/30 bg-destructive/5',
          status === 'done' && 'border-[var(--medicai-green)]/50 bg-[var(--medicai-green)]/10',
          className
        )}
      >
        {/* Main button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                if (status === 'recording') stopRecording();
                else if (status === 'idle' || status === 'error') setIsExpanded(!isExpanded);
              }}
              className={cn(
                'h-8 w-8 rounded-full shrink-0',
                status === 'recording' && 'text-destructive hover:text-destructive hover:bg-destructive/10',
                status === 'done' && 'text-[var(--medicai-green-dark)]',
                status === 'processing' && 'animate-pulse'
              )}
            >
              {status === 'connecting' || status === 'processing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : status === 'recording' ? (
                <div className="relative flex items-center justify-center">
                  <div
                    className="absolute rounded-full bg-destructive/30"
                    style={{ 
                      width: `${14 + audioLevel * 10}px`, 
                      height: `${14 + audioLevel * 10}px`,
                      transition: 'all 50ms'
                    }}
                  />
                  <Square className="h-3 w-3 relative z-10 fill-current" />
                </div>
              ) : status === 'done' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {status === 'recording' ? 'Stop' : status === 'done' ? 'SOAP prêt' : 'Scribe'}
          </TooltipContent>
        </Tooltip>

        {/* Idle expanded: Language + Start + Close */}
        {isExpanded && (status === 'idle' || status === 'error') && (
          <>
            <Button
              size="icon"
              variant="ghost"
              onClick={cycleLanguage}
              className="h-7 w-7 rounded-full shrink-0 text-xs"
            >
              {langFlag}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={startRecording}
                  className="h-7 w-7 rounded-full shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Mic className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Enregistrer</TooltipContent>
            </Tooltip>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsExpanded(false)}
              className="h-7 w-7 rounded-full shrink-0 text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </Button>
          </>
        )}

        {/* Recording: Duration + Transcript popover */}
        {status === 'recording' && (
          <>
            <span className="text-xs font-mono text-destructive px-1.5 tabular-nums">
              {formatDuration(duration)}
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-full shrink-0"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                side="top" 
                align="end" 
                className="w-72 p-0"
                style={{ opacity: panelOpacity }}
              >
                <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-muted/30">
                  <span className="text-[10px] font-medium flex-1">
                    Live <span className="text-destructive animate-pulse">●</span>
                  </span>
                  <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                  <Slider
                    value={[panelOpacity * 100]}
                    onValueChange={(v: number[]) => setPanelOpacity(v[0] / 100)}
                    min={30} max={100} step={5}
                    className="w-12"
                  />
                    <Button size="icon" variant="ghost" onClick={copyTranscript} className="h-6 w-6">
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div className="h-32 overflow-y-auto p-2 text-xs leading-relaxed">
                  {transcript.length === 0 && !interimText ? (
                    <p className="text-muted-foreground text-center py-4">En attente...</p>
                  ) : (
                    <>
                      {transcript.map((t, i) => <span key={i}>{t} </span>)}
                      {interimText && <span className="text-muted-foreground italic">{interimText}</span>}
                    </>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}

        {/* Done: Transcript + SOAP + Copy + Reset */}
        {status === 'done' && (
          <>
            {/* Transcript Popover */}
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full shrink-0">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Transcript</TooltipContent>
              </Tooltip>
              <PopoverContent side="top" align="end" className="w-72 p-0" style={{ opacity: panelOpacity }}>
                <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-muted/30">
                  <span className="text-[10px] font-medium flex-1">Transcription</span>
                  <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                  <Slider
                    value={[panelOpacity * 100]}
                    onValueChange={(v: number[]) => setPanelOpacity(v[0] / 100)}
                    min={30} max={100} step={5}
                    className="w-12"
                  />
                  <Button size="icon" variant="ghost" onClick={copyTranscript} className="h-6 w-6">
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div className="h-32 overflow-y-auto p-2 text-xs">
                  {transcript.join(' ') || 'Aucune transcription'}
                </div>
              </PopoverContent>
            </Popover>

            {/* SOAP Popover */}
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full shrink-0">
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">SOAP</TooltipContent>
              </Tooltip>
              <PopoverContent side="top" align="end" className="w-80 p-0" style={{ opacity: panelOpacity }}>
                <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-muted/30">
                  <span className="text-[10px] font-medium flex-1">Note SOAP</span>
                  <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                  <Slider
                    value={[panelOpacity * 100]}
                    onValueChange={(v: number[]) => setPanelOpacity(v[0] / 100)}
                    min={30} max={100} step={5}
                    className="w-12"
                  />
                  <Button size="icon" variant="ghost" onClick={copySOAP} className="h-6 w-6">
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                {soap ? (
                  <div className="max-h-48 overflow-y-auto p-1.5 space-y-1">
                    <div className="p-1.5 rounded bg-[var(--soap-s)] border-l-2 border-[var(--soap-s-border)]">
                      <span className="text-[10px] font-semibold text-foreground">S:</span>
                      <span className="text-[10px] ml-1">{soap.subjective}</span>
                    </div>
                    <div className="p-1.5 rounded bg-[var(--soap-o)] border-l-2 border-[var(--soap-o-border)]">
                      <span className="text-[10px] font-semibold text-foreground">O:</span>
                      <span className="text-[10px] ml-1">{soap.objective}</span>
                    </div>
                    <div className="p-1.5 rounded bg-[var(--soap-a)] border-l-2 border-[var(--soap-a-border)]">
                      <span className="text-[10px] font-semibold text-foreground">A:</span>
                      <span className="text-[10px] ml-1">{soap.assessment}</span>
                    </div>
                    <div className="p-1.5 rounded bg-[var(--soap-p)] border-l-2 border-[var(--soap-p-border)]">
                      <span className="text-[10px] font-semibold text-foreground">P:</span>
                      <span className="text-[10px] ml-1">{soap.plan}</span>
                    </div>
                  </div>
                ) : (
                  <p className="p-3 text-xs text-muted-foreground text-center">Pas de SOAP</p>
                )}
              </PopoverContent>
            </Popover>

            {/* Reset */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={reset}
                  className="h-7 w-7 rounded-full shrink-0 text-muted-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Nouveau</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

export default VoiceScribe;
