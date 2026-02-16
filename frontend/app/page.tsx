'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  useDashboardStats, 
  useConsultations, 
  usePatients, 
  usePendingDocuments,
  useCurrentUser 
} from '@/lib/hooks';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import { 
  Search, 
  Plus, 
  FileText, 
  Users, 
  Stethoscope,
  Clock,
  ArrowRight,
  AlertCircle,
  ChevronRight,
  CalendarClock,
  Inbox,
  Activity,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: consultations, isLoading: consultationsLoading } = useConsultations();
  const { data: patients, isLoading: patientsLoading } = usePatients();
  const { data: pendingDocs, isLoading: pendingLoading } = usePendingDocuments(3);
  const { data: currentUser } = useCurrentUser();

  const doctorName = currentUser?.last_name || currentUser?.first_name || '';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Process consultations data
  const todaysConsultations = consultations?.filter(c => {
    if (!c.consultationTime) return false;
    return isToday(new Date(c.consultationTime));
  }).sort((a, b) => {
    const timeA = a.consultationTime ? new Date(a.consultationTime).getTime() : 0;
    const timeB = b.consultationTime ? new Date(b.consultationTime).getTime() : 0;
    return timeA - timeB;
  }) || [];

  const activeConsultations = consultations?.filter(c => c.status === 'active') || [];
  const urgentCount = activeConsultations.length;
  
  // Get next upcoming consultation (today, not started yet)
  const now = new Date();
  const nextConsultation = todaysConsultations.find(c => {
    if (c.status !== 'active') return false;
    const time = c.consultationTime ? new Date(c.consultationTime) : null;
    return time && time > now;
  }) || activeConsultations[0];

  // Get last session to continue
  const lastSession = activeConsultations[0];

  // Filter for search
  const searchResults = searchQuery.trim() ? {
    patients: patients?.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.patientId.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 3) || [],
    consultations: consultations?.filter(c =>
      c.patientName.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 2) || []
  } : null;

  // Handle search commands
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    
    if (query.startsWith('/')) {
      // Command mode
      if (query === '/new consult' || query === '/consultation') {
        router.push('/consultations');
      } else if (query === '/upload') {
        router.push('/patients');
      } else if (query === '/patients') {
        router.push('/patients');
      } else if (query === '/schedule') {
        router.push('/schedule');
      }
    } else if (searchResults?.patients?.length) {
      // Navigate to first patient match
      router.push(`/patients/${searchResults.patients[0].id}`);
    }
    setSearchQuery('');
    setShowSearchResults(false);
  };

  // Context-aware primary CTA
  const getPrimaryCTA = () => {
    if (urgentCount > 0) {
      return {
        label: `Reprendre consultation${urgentCount > 1 ? 's' : ''} active${urgentCount > 1 ? 's' : ''} (${urgentCount})`,
        action: () => router.push(`/consultations/${activeConsultations[0].id}`),
        variant: 'default' as const
      };
    }
    if (nextConsultation) {
      return {
        label: `Ouvrir ${nextConsultation.patientName}`,
        action: () => router.push(`/consultations/${nextConsultation.id}`),
        variant: 'default' as const
      };
    }
    if (pendingDocs && pendingDocs.count > 0) {
      return {
        label: `Examiner documents (${pendingDocs.count})`,
        action: () => router.push(`/patients/${pendingDocs.documents[0]?.patient_id}`),
        variant: 'default' as const
      };
    }
    return {
      label: 'Nouvelle consultation',
      action: () => router.push('/consultations'),
      variant: 'default' as const
    };
  };

  const primaryCTA = getPrimaryCTA();

  const isLoading = statsLoading || consultationsLoading || patientsLoading || pendingLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-start justify-center p-8 pt-16">
      <div className="w-full max-w-2xl space-y-10">
        {/* Welcome Message */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-normal text-foreground">
            {getGreeting()}{doctorName ? ` Dr. ${doctorName}` : ''}
          </h1>
          <p className="text-muted-foreground">
            Voici ce qui requiert votre attention aujourd'hui
          </p>
        </div>

        {/* Command/Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Rechercher patient, document, ou taper une commande..."
              className="pl-11 pr-20 h-12 text-base bg-background border-border"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(e.target.value.length > 0);
              }}
              onFocus={() => setShowSearchResults(searchQuery.length > 0)}
              onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
            />
            <kbd className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              Ctrl+K
            </kbd>
          </div>
          
          {/* Search Results Dropdown */}
          {showSearchResults && searchResults && (searchResults.patients.length > 0 || searchResults.consultations.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-lg shadow-lg z-50 overflow-hidden">
              {searchResults.patients.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-medium text-muted-foreground px-2 py-1">Patients</div>
                  {searchResults.patients.map((patient) => (
                    <button
                      key={patient.id}
                      type="button"
                      className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-muted text-left"
                      onClick={() => {
                        router.push(`/patients/${patient.id}`);
                        setSearchQuery('');
                        setShowSearchResults(false);
                      }}
                    >
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{patient.name}</span>
                      <span className="text-xs text-muted-foreground">{patient.patientId}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.consultations.length > 0 && (
                <>
                  {searchResults.patients.length > 0 && <Separator />}
                  <div className="p-2">
                    <div className="text-xs font-medium text-muted-foreground px-2 py-1">Consultations</div>
                    {searchResults.consultations.map((consultation) => (
                      <button
                        key={consultation.id}
                        type="button"
                        className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-muted text-left"
                        onClick={() => {
                          router.push(`/consultations/${consultation.id}`);
                          setSearchQuery('');
                          setShowSearchResults(false);
                        }}
                      >
                        <Stethoscope className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1">{consultation.patientName}</span>
                        <Badge variant={consultation.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                          {consultation.status}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <Separator />
              <div className="p-2 text-xs text-muted-foreground px-4">
                Commandes: <code className="bg-muted px-1 rounded">/new consult</code> <code className="bg-muted px-1 rounded">/upload</code> <code className="bg-muted px-1 rounded">/patients</code>
              </div>
            </div>
          )}
        </form>

        {/* Today Card - Single item based on priority */}
        <Card className="border shadow-sm overflow-hidden group">
          <CardContent className="p-0">
            {/* Show ONE thing at a time based on priority */}
            {urgentCount > 0 ? (
              // Active consultations (highest priority)
              <button
                className="w-full flex items-center justify-between p-4 py-2 group-hover:transition-colors text-left"
                onClick={() => router.push(`/consultations/${activeConsultations[0].id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Stethoscope className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">
                      {urgentCount} consultation{urgentCount > 1 ? 's' : ''} active{urgentCount > 1 ? 's' : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {activeConsultations[0]?.patientName} · {urgentCount > 1 && `+${urgentCount - 1} autre${urgentCount > 2 ? 's' : ''}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-border">
                    Urgent
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ) : nextConsultation ? (
              // Next scheduled consultation
              <button
                className="w-full flex items-center justify-between p-4 py-2 group-hover:transition-colors text-left cursor-pointer"
                onClick={() => router.push(`/consultations/${nextConsultation.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Stethoscope className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{nextConsultation.patientName}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(nextConsultation.consultationTime!), 'HH:mm')}
                      {nextConsultation.name && ` · ${nextConsultation.name}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs bg-[var(--medicai-green-light)] text-[var(--medicai-green-dark)] border-[var(--medicai-green)]">
                    Prochaine
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ) : pendingDocs && pendingDocs.count > 0 ? (
              // Pending documents to review
              <button
                className="w-full flex items-center justify-between p-4 py-2 group-hover:transition-colors text-left cursor-pointer"
                onClick={() => pendingDocs.documents[0] && router.push(`/patients/${pendingDocs.documents[0].patient_id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">
                      {pendingDocs.count} document{pendingDocs.count > 1 ? 's' : ''} à examiner
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {pendingDocs.documents[0]?.patient_name} · {pendingDocs.documents[0]?.summary || pendingDocs.documents[0]?.document_type}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Examiner
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ) : (
              // Empty state - no urgent tasks
              <div className="p-4 py-2 text-center cursor-pointer">
                <div className="p-2 rounded-full bg-muted inline-flex mb-3">
                  <CalendarClock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium">Aucune tâche urgente</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Votre agenda est libre pour le moment
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Primary CTA */}
        <div className="flex flex-col items-center gap-3">
          <Button 
            size="lg"
            className="px-8 py-6 text-base font-medium cursor-pointer" 
            onClick={primaryCTA.action}
          >
            {primaryCTA.label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {/* Continue last session */}
          {lastSession && activeConsultations.length > 0 && (
            <button
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              onClick={() => router.push(`/consultations/${lastSession.id}`)}
            >
              <Clock className="h-3 w-3" />
              Reprendre: {lastSession.patientName} · Consultation en cours
            </button>
          )}
        </div>

        {/* Quick Actions Row 
        <div className="flex items-center justify-center gap-6">
          <button
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
            onClick={() => router.push('/schedule')}
          >
            <div className="p-2.5 rounded-lg bg-muted group-hover:bg-muted/80 transition-colors">
              <Plus className="h-4 w-4" />
            </div>
            <span className="text-xs">Planifier</span>
          </button>
          <button
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
            onClick={() => router.push('/patients')}
          >
            <div className="p-2.5 rounded-lg bg-muted group-hover:bg-muted/80 transition-colors">
              <Users className="h-4 w-4" />
            </div>
            <span className="text-xs">Patients</span>
          </button>
          <button
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
            onClick={() => router.push('/consultations')}
          >
            <div className="p-2.5 rounded-lg bg-muted group-hover:bg-muted/80 transition-colors">
              <Stethoscope className="h-4 w-4" />
            </div>
            <span className="text-xs">Consultations</span>
          </button>
          <button
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group relative"
            onClick={() => pendingDocs && pendingDocs.count > 0 && pendingDocs.documents[0] ? router.push(`/patients/${pendingDocs.documents[0].patient_id}`) : router.push('/patients')}
          >
            <div className="p-2.5 rounded-lg bg-muted group-hover:bg-muted/80 transition-colors relative">
              <Inbox className="h-4 w-4" />
              {pendingDocs && pendingDocs.count > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary text-primary-foreground text-[10px] font-medium rounded-full flex items-center justify-center">
                  {pendingDocs.count > 9 ? '9+' : pendingDocs.count}
                </span>
              )}
            </div>
            <span className="text-xs">Inbox</span>
          </button>
        </div>
        */}
      </div>
    </div>
  );
}