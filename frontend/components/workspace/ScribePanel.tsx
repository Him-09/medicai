'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Mic,
  MicOff,
  Square,
  Loader2,
  FileText,
  Clock,
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TranscriptSegment {
  id: string;
  text: string;
  is_final: boolean;
  timestamp: string;
}

interface SOAPSummary {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  raw_transcript: string;
  generated_at: string;
}

interface ScribePanelProps {
  consultationId: string;
  language?: 'fr' | 'ar' | 'en';
  onTranscriptChange?: (transcript: string) => void;
  onSOAPGenerated?: (soap: SOAPSummary) => void;
}

type ScribeStatus = 'idle' | 'connecting' | 'recording' | 'processing' | 'error';

export function ScribePanel({
  consultationId,
  language = 'fr',
  onTranscriptChange,
  onSOAPGenerated,
}: ScribePanelProps) {
  const [status, setStatus] = useState<ScribeStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [soap, setSOAP] = useState<SOAPSummary | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interimText]);

  // Notify parent of transcript changes
  useEffect(() => {
    const fullText = transcript
      .filter((s) => s.is_final)
      .map((s) => s.text)
      .join(' ');
    onTranscriptChange?.(fullText);
  }, [transcript, onTranscriptChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  const getToken = () => {
    return localStorage.getItem('medicai_token') || '';
  };

  const startRecording = useCallback(async () => {
    try {
      setStatus('connecting');
      setError(null);
      setTranscript([]);
      setInterimText('');
      setSOAP(null);
      setDuration(0);

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Setup audio analyzer for level meter
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      // Audio level monitoring
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      const updateLevel = () => {
        if (analyzerRef.current && status === 'recording') {
          analyzerRef.current.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(avg / 255);
          requestAnimationFrame(updateLevel);
        }
      };

      // Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.hostname}:8000/api/scribe/ws/${consultationId}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send start command with auth
        ws.send(
          JSON.stringify({
            type: 'start',
            language,
            token: getToken(),
          })
        );
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'started':
            setStatus('recording');
            // Start duration timer
            timerRef.current = setInterval(() => {
              setDuration((d) => d + 1);
            }, 1000);
            // Start audio level monitoring
            requestAnimationFrame(updateLevel);
            // Start sending audio
            startMediaRecorder(stream, ws);
            break;

          case 'transcript':
            if (data.is_final) {
              setTranscript((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  text: data.text,
                  is_final: true,
                  timestamp: data.timestamp,
                },
              ]);
              setInterimText('');
            } else {
              setInterimText(data.text);
            }
            break;

          case 'status':
            if (data.message === 'Generating summary...') {
              setStatus('processing');
            }
            break;

          case 'summary':
            setStatus('idle');
            if (data.soap) {
              setSOAP(data.soap);
              onSOAPGenerated?.(data.soap);
            }
            break;

          case 'error':
            setError(data.message);
            setStatus('error');
            toast.error(`Erreur scribe: ${data.message}`);
            break;
        }
      };

      ws.onerror = () => {
        setError('Erreur de connexion WebSocket');
        setStatus('error');
      };

      ws.onclose = () => {
        if (status === 'recording') {
          setStatus('idle');
        }
      };
    } catch (err: any) {
      console.error('Scribe start error:', err);
      setError(err.message || 'Impossible de démarrer le scribe');
      setStatus('error');
      toast.error('Impossible d\'accéder au microphone');
    }
  }, [consultationId, language, onSOAPGenerated, status]);

  const startMediaRecorder = (stream: MediaStream, ws: WebSocket) => {
    // Use webm/opus which Deepgram accepts
    const options = { mimeType: 'audio/webm;codecs=opus' };
    
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      // Fallback
      const fallbackMime = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : 'audio/mp4';
      options.mimeType = fallbackMime;
    }

    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(event.data);
      }
    };

    // Send audio every 250ms for low latency
    mediaRecorder.start(250);
  };

  const stopRecording = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Stop audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyzerRef.current = null;
    setAudioLevel(0);

    // Send stop command to WebSocket
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
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copyTranscript = () => {
    const text = transcript.map((s) => s.text).join(' ');
    navigator.clipboard.writeText(text);
    toast.success('Transcription copiée');
  };

  const copySOAP = () => {
    if (!soap) return;
    const text = `SUBJECTIF:\n${soap.subjective}\n\nOBJECTIF:\n${soap.objective}\n\nÉVALUATION:\n${soap.assessment}\n\nPLAN:\n${soap.plan}`;
    navigator.clipboard.writeText(text);
    toast.success('Note SOAP copiée');
  };

  const statusConfig = {
    idle: { color: 'bg-gray-100', text: 'Prêt', icon: Mic },
    connecting: { color: 'bg-yellow-100', text: 'Connexion...', icon: Loader2 },
    recording: { color: 'bg-red-100', text: 'Enregistrement', icon: Mic },
    processing: { color: 'bg-blue-100', text: 'Génération résumé...', icon: Loader2 },
    error: { color: 'bg-red-100', text: 'Erreur', icon: AlertCircle },
  };

  const StatusIcon = statusConfig[status].icon;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Mode Scribe
          </CardTitle>
          <div className="flex items-center gap-2">
            {status === 'recording' && (
              <Badge variant="outline" className="font-mono">
                <Clock className="h-3 w-3 mr-1" />
                {formatDuration(duration)}
              </Badge>
            )}
            <Badge className={cn('capitalize', statusConfig[status].color)}>
              <StatusIcon
                className={cn(
                  'h-3 w-3 mr-1',
                  (status === 'connecting' || status === 'processing') && 'animate-spin'
                )}
              />
              {statusConfig[status].text}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Controls */}
        <div className="flex items-center gap-3">
          {status === 'idle' || status === 'error' ? (
            <Button
              onClick={startRecording}
              className="flex-1 bg-red-500 hover:bg-red-600"
              size="lg"
            >
              <Mic className="h-5 w-5 mr-2" />
              Démarrer l'enregistrement
            </Button>
          ) : status === 'recording' ? (
            <Button
              onClick={stopRecording}
              variant="destructive"
              className="flex-1"
              size="lg"
            >
              <Square className="h-5 w-5 mr-2" />
              Arrêter
            </Button>
          ) : (
            <Button disabled className="flex-1" size="lg">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              {status === 'connecting' ? 'Connexion...' : 'Génération en cours...'}
            </Button>
          )}
        </div>

        {/* Audio level indicator */}
        {status === 'recording' && (
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-75"
              style={{ width: `${Math.min(audioLevel * 100 * 2, 100)}%` }}
            />
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Live Transcript */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Transcription</h3>
            {transcript.length > 0 && (
              <Button variant="ghost" size="sm" onClick={copyTranscript}>
                <Copy className="h-3 w-3 mr-1" />
                Copier
              </Button>
            )}
          </div>
          
          <div
            ref={scrollRef}
            className="flex-1 border rounded-md p-3 overflow-y-auto bg-muted/30 min-h-[150px]"
          >
            {transcript.length === 0 && !interimText ? (
              <p className="text-muted-foreground text-sm italic">
                {status === 'recording'
                  ? 'En attente de parole...'
                  : 'La transcription apparaîtra ici'}
              </p>
            ) : (
              <div className="space-y-1">
                {transcript.map((segment) => (
                  <span key={segment.id} className="text-sm">
                    {segment.text}{' '}
                  </span>
                ))}
                {interimText && (
                  <span className="text-sm text-muted-foreground italic">
                    {interimText}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SOAP Summary */}
        {soap && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--medicai-green-dark)]" />
                  Résumé SOAP
                </h3>
                <Button variant="ghost" size="sm" onClick={copySOAP}>
                  <Copy className="h-3 w-3 mr-1" />
                  Copier
                </Button>
              </div>
              
              <div className="grid gap-3 text-sm">
                <div className="p-2 rounded bg-[var(--soap-s)] border-l-2 border-[var(--soap-s-border)]">
                  <span className="font-medium text-foreground">S - Subjectif:</span>
                  <p className="text-muted-foreground mt-0.5">{soap.subjective}</p>
                </div>
                <div className="p-2 rounded bg-[var(--soap-o)] border-l-2 border-[var(--soap-o-border)]">
                  <span className="font-medium text-foreground">O - Objectif:</span>
                  <p className="text-muted-foreground mt-0.5">{soap.objective}</p>
                </div>
                <div className="p-2 rounded bg-[var(--soap-a)] border-l-2 border-[var(--soap-a-border)]">
                  <span className="font-medium text-foreground">A - Assessment:</span>
                  <p className="text-muted-foreground mt-0.5">{soap.assessment}</p>
                </div>
                <div className="p-2 rounded bg-[var(--soap-p)] border-l-2 border-[var(--soap-p-border)]">
                  <span className="font-medium text-foreground">P - Plan:</span>
                  <p className="text-muted-foreground mt-0.5">{soap.plan}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ScribePanel;
