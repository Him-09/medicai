'use client';

import { useConsultations, useCreateConsultation, usePatients, useUpdateConsultation, useCancelConsultation, useConsultationSummary } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Plus, 
  MoreVertical, 
  XCircle, 
  CalendarIcon, 
  ArrowRight,
  FileText,
  Clock,
  Search
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format, addDays, isToday, isYesterday, isTomorrow, differenceInDays, isBefore, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Activity, MessageSquare, AlertCircle, Stethoscope, Heart, Target, ClipboardList, Pill, ShieldAlert, StickyNote, CheckCircle2, ChevronRight } from 'lucide-react';

export default function ConsultationsPage() {
  const router = useRouter();
  const { data: consultations, isLoading } = useConsultations();
  const { data: patients } = usePatients();
  const { mutate: createConsultation, isPending } = useCreateConsultation();
  const { mutate: updateConsultation } = useUpdateConsultation();
  const { mutate: cancelConsultation } = useCancelConsultation();
  // Summary Sheet State
  const [summarySheetOpen, setSummarySheetOpen] = useState(false);
  const [viewingConsultationId, setViewingConsultationId] = useState<string | null>(null);
  
  // Fetch consultation summary when viewing
  const { data: consultationSummary, isLoading: summaryLoading } = useConsultationSummary(
    viewingConsultationId || '',
    { enabled: !!viewingConsultationId && summarySheetOpen }
  );
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'canceled'>('all');
  const [dateFilter, setDateFilter] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [reschedulingConsultation, setReschedulingConsultation] = useState<any>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [consultationName, setConsultationName] = useState<string>('');
  const [consultationDate, setConsultationDate] = useState<Date>(new Date());
  const [consultationTime, setConsultationTime] = useState<string>('09:00');
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [rescheduleTime, setRescheduleTime] = useState<string>('09:00');
  const [error, setError] = useState<string>('');

  // Format time in a more readable way
  const formatConsultationTime = (dateStr: string | undefined) => {
    if (!dateStr) return 'Non programmé';
    const date = new Date(dateStr);
    
    if (isToday(date)) {
      return `Aujourd'hui · ${format(date, 'HH:mm')}`;
    }
    if (isYesterday(date)) {
      return `Hier · ${format(date, 'HH:mm')}`;
    }
    if (isTomorrow(date)) {
      return `Demain · ${format(date, 'HH:mm')}`;
    }
    
    return `${format(date, 'd MMM')} · ${format(date, 'HH:mm')}`;
  };

  // Get patient info for consultation
  const getPatientInfo = (consultation: any) => {
    const patientId = consultation.patientId?.replace('#', '');
    return patients?.find(p => p.id === patientId);
  };

  // Calculate age from DOB
  const calculateAge = (dob: string) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  // Filter and sort consultations
  const filteredConsultations = useMemo(() => {
    if (!consultations) return [];
    
    let filtered = consultations.filter((consultation) => {
      // Status filter
      if (statusFilter !== 'all' && consultation.status !== statusFilter) {
        return false;
      }
      
      // Date filter
      if (dateFilter !== 'all' && consultation.consultationTime) {
        const consultDate = new Date(consultation.consultationTime);
        const now = new Date();
        const daysDiff = differenceInDays(consultDate, now);
        
        if (dateFilter === 'today' && !isToday(consultDate)) return false;
        if (dateFilter === '7d' && (daysDiff < -7 || daysDiff > 7)) return false;
        if (dateFilter === '30d' && (daysDiff < -30 || daysDiff > 30)) return false;
      }
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesPatient = consultation.patientName.toLowerCase().includes(query);
        const matchesName = consultation.name?.toLowerCase().includes(query);
        return matchesPatient || matchesName;
      }
      
      return true;
    });
    
    // Sort: Active first, then by time (upcoming first, then recent)
    return filtered.sort((a, b) => {
      // Active consultations first
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      
      // Then by consultation time
      const timeA = a.consultationTime ? new Date(a.consultationTime).getTime() : 0;
      const timeB = b.consultationTime ? new Date(b.consultationTime).getTime() : 0;
      
      // For active: upcoming first
      if (a.status === 'active' && b.status === 'active') {
        return timeA - timeB;
      }
      
      // For others: most recent first
      return timeB - timeA;
    });
  }, [consultations, statusFilter, dateFilter, searchQuery]);

  const handleCreateConsultation = () => {
    if (!selectedPatientId) return;
    
    const hasActiveConsultation = consultations?.some(
      (c) => c.patientId === `#${selectedPatientId}` && c.status === 'active'
    );
    
    if (hasActiveConsultation) {
      setError('Ce patient a déjà une consultation active. Veuillez la terminer avant d\'en créer une nouvelle.');
      return;
    }
    
    const [hours, minutes] = consultationTime.split(':').map(Number);
    const dateTime = new Date(consultationDate);
    dateTime.setHours(hours, minutes, 0, 0);
    
    setError('');
    createConsultation(
      { patientId: selectedPatientId, name: consultationName || undefined, consultationTime: dateTime },
      {
        onSuccess: (data) => {
          setDialogOpen(false);
          setSelectedPatientId('');
          setConsultationName('');
          setConsultationDate(new Date());
          setConsultationTime('09:00');
          router.push(`/consultations/${data.consultation_id}`);
        },
        onError: (error: any) => {
          console.error('Failed to create consultation:', error);
          setError(error.message || 'Échec de la création. Vérifiez que le serveur est en cours d\'exécution.');
        },
      }
    );
  };

  const handleReschedule = (consultation: any) => {
    setReschedulingConsultation(consultation);
    const consultDate = consultation.consultationTime ? new Date(consultation.consultationTime) : new Date();
    setRescheduleDate(consultDate);
    setRescheduleTime(format(consultDate, 'HH:mm'));
    setRescheduleDialogOpen(true);
  };

  const handleUpdateReschedule = () => {
    if (!reschedulingConsultation) return;
    
    const [hours, minutes] = rescheduleTime.split(':').map(Number);
    const dateTime = new Date(rescheduleDate);
    dateTime.setHours(hours, minutes, 0, 0);
    
    updateConsultation(
      { 
        id: reschedulingConsultation.id, 
        data: { consultation_time: dateTime } 
      },
      {
        onSuccess: () => {
          toast.success('Consultation reprogrammée');
          setRescheduleDialogOpen(false);
          setReschedulingConsultation(null);
        },
        onError: (error: any) => {
          toast.error(error.message || 'Échec de la reprogrammation');
        },
      }
    );
  };

  const handleCancelConsultation = (consultationId: string) => {
    cancelConsultation(consultationId, {
      onSuccess: () => {
        toast.success('Consultation annulée');
      },
      onError: (error: any) => {
        toast.error(error.message || 'Échec de l\'annulation');
      },
    });
  };

  const handleRowClick = (consultation: any) => {
    if (consultation.status === 'canceled') {
      toast.error('Cette consultation a été annulée et ne peut pas être ouverte.');
      return;
    }
    router.push(`/consultations/${consultation.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen p-8">
      <div className="flex-1 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Consultations</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle consultation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle Consultation</DialogTitle>
              <DialogDescription>
                Sélectionnez un patient pour démarrer une nouvelle consultation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-0">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Patient</label>
                <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients?.filter(p => p.status === 'active').map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.name} · {calculateAge(patient.dob)}ans
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Motif (Optionnel)</label>
                <input
                  type="text"
                  value={consultationName}
                  onChange={(e) => setConsultationName(e.target.value)}
                  placeholder="ex: Suivi diabète"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {['Suivi', 'Contrôle annuel', 'Nouvelle consultation', 'Résultats labo'].map((name) => (
                    <Button
                      key={name}
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => setConsultationName(name)}
                      className="text-xs"
                    >
                      {name}
                    </Button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <div className="flex gap-2 mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConsultationDate(new Date())}
                    className="flex-1"
                  >
                    Aujourd'hui
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConsultationDate(addDays(new Date(), 1))}
                    className="flex-1"
                  >
                    Demain
                  </Button>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !consultationDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {consultationDate ? format(consultationDate, 'd MMM yyyy') : <span>Choisir une date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={consultationDate}
                      onSelect={(date) => date && setConsultationDate(date)}
                      initialFocus
                      disabled={(date) => isBefore(startOfDay(date), startOfDay(new Date()))}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Heure</label>
                <Select value={consultationTime} onValueChange={setConsultationTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => {
                      const hour = i + 8;
                      return `${hour.toString().padStart(2, '0')}:00`;
                    }).map(time => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleCreateConsultation} 
                disabled={!selectedPatientId || isPending}
                className="w-full"
              >
                {isPending ? 'Création...' : 'Créer la consultation'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprogrammer</DialogTitle>
            <DialogDescription>
              Choisissez une nouvelle date et heure.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !rescheduleDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {rescheduleDate ? format(rescheduleDate, 'd MMM yyyy') : <span>Choisir</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={rescheduleDate}
                    onSelect={(date) => date && setRescheduleDate(date)}
                    initialFocus
                    disabled={(date) => isBefore(startOfDay(date), startOfDay(new Date()))}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Heure</label>
              <Select value={rescheduleTime} onValueChange={setRescheduleTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const hour = i + 8;
                    return `${hour.toString().padStart(2, '0')}:00`;
                  }).map(time => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleUpdateReschedule} className="w-full">
              Reprogrammer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par patient ou motif..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filters Row */}
      <div className="flex items-center justify-between gap-4">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="w-auto">
          <TabsList>
            <TabsTrigger value="all">Tout</TabsTrigger>
            <TabsTrigger value="active">Actives</TabsTrigger>
            <TabsTrigger value="completed">Terminées</TabsTrigger>
            <TabsTrigger value="canceled">Annulées</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Période:</span>
          <div className="flex gap-1">
            {[
              { value: 'today', label: "Aujourd'hui" },
              { value: '7d', label: '7j' },
              { value: '30d', label: '30j' },
              { value: 'all', label: 'Tout' },
            ].map((option) => (
              <Button
                key={option.value}
                variant={dateFilter === option.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDateFilter(option.value as any)}
                className="h-8 text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Consultations Cards Grid */}
      {filteredConsultations.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground border border-[#EAEAEA] rounded-xl">
          Aucune consultation trouvée
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredConsultations.map((consultation) => {
            const initials = consultation.patientName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase();
            
            const patient = getPatientInfo(consultation);
            const age = patient ? calculateAge(patient.dob) : null;
            const hasProblems = patient?.active_problems && patient.active_problems.length > 0;

            return (
              <div
                key={consultation.id}
                className="border border-[#EAEAEA] rounded-xl p-4 group"
              >
                {/* Header: Avatar + Name + Status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarFallback className="text-sm">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{consultation.patientName}</div>
                      <div className="text-xs text-muted-foreground">
                        {age && `${age} ans`}
                      </div>
                    </div>
                  </div>
                  <Badge 
                    variant={consultation.status === 'active' ? 'default' : 'outline'}
                    className={cn(
                      "text-xs flex-shrink-0",
                      consultation.status === 'active' && "bg-[var(--medicai-green-light)] text-black border-[var(--medicai-green)]",
                      consultation.status === 'completed' && "bg-[#F9F9F9] text-muted-foreground border-[#EAEAEA]",
                      consultation.status === 'canceled' && "bg-[#F9F9F9] text-muted-foreground border-[#EAEAEA] line-through"
                    )}
                  >
                    {consultation.status === 'active' && 'Active'}
                    {consultation.status === 'completed' && 'Terminée'}
                    {consultation.status === 'canceled' && 'Annulée'}
                  </Badge>
                </div>

                {/* Visit reason / Focus */}
                <div className="text-xs pl-1.5 py-1.5 rounded-md mb-3 bg-muted bg-[var(--medicai-green-light)] text-gray-700">
                  {consultation.name || (hasProblems ? `Suivi: ${patient?.active_problems?.slice(0, 2).join(', ')}` : 'Consultation')}
                </div>

                {/* Info row */}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatConsultationTime(consultation.consultationTime || consultation.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <span>{consultation.documentsCount} docs</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                  {consultation.status === 'canceled' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs opacity-50"
                      disabled
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Annulée
                    </Button>
                  ) : consultation.status === 'completed' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => {
                          setViewingConsultationId(consultation.id);
                          setSummarySheetOpen(true);
                          // Optionally, fetch summary here
                        }}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      Voir résumé
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => handleRowClick(consultation)}
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        Ouvrir
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleReschedule(consultation)}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            Reprogrammer
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleCancelConsultation(consultation.id)}
                            className="text-destructive"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Annuler
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      </div>

      {/* Footer - Always at bottom */}
      <div className="mt-auto pt-6">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{filteredConsultations.length} consultation{filteredConsultations.length > 1 ? 's' : ''}</span>
          <span className="text-xs">Trié par: Actives d'abord, puis par date</span>
        </div>
      </div>



    {/* Consultation Summary Sheet */}
    <Sheet open={summarySheetOpen} onOpenChange={(open: boolean) => {
      setSummarySheetOpen(open);
      if (!open) {
        setViewingConsultationId(null);
      }
    }}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] p-0 flex flex-col h-full overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-3">
            <Stethoscope className="h-5 w-5 text-foreground" />
            Résumé de consultation
          </SheetTitle>
          <SheetDescription>
            Synthèse clinique de la consultation
          </SheetDescription>
        </SheetHeader>
        
        <ScrollArea className="flex-1 min-h-0">
          {summaryLoading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : consultationSummary ? (
            <div className="p-6 space-y-4">
              {/* Date */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarIcon className="h-4 w-4" />
                <span>
                  {consultationSummary.created_at 
                    ? new Date(consultationSummary.created_at).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : 'Date non disponible'
                  }
                </span>
              </div>

              <Separator />

              {/* Render structured JSON (v2) or fallback to plain text (v1) */}
              {(() => {
                let parsed: any = null;
                try {
                  parsed = JSON.parse(consultationSummary.summary);
                } catch {
                  parsed = null;
                }

                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  // --- Structured V2 summary ---
                  return (
                    <div className="space-y-4">
                      {/* Visit Focus */}
                      {parsed.visit_focus && (
                        <div className="bg-[var(--medicai-green-light)] border border-[var(--medicai-green)]/40 rounded-lg p-4">
                          <h3 className="font-medium text-sm mb-1 flex items-center gap-2">
                            <Target className="h-4 w-4 text-foreground" />
                            Motif de consultation
                          </h3>
                          <p className="text-sm">{parsed.visit_focus}</p>
                        </div>
                      )}

                      {/* HPI */}
                      {parsed.hpi && (
                        <div className="border rounded-lg p-4 space-y-3">
                          <h3 className="font-medium text-sm flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            Histoire de la maladie
                          </h3>
                          {parsed.hpi.one_liner && (
                            <p className="text-sm text-foreground bg-muted/50 rounded p-2">{parsed.hpi.one_liner}</p>
                          )}
                          {parsed.hpi.symptoms && parsed.hpi.symptoms.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Symptômes</p>
                              <div className="flex flex-wrap gap-1.5">
                                {parsed.hpi.symptoms.map((s: any, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs font-normal">
                                    {s.name}{s.details ? ` — ${s.details}` : ''}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {parsed.hpi.red_flags && parsed.hpi.red_flags.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <ShieldAlert className="h-3 w-3" /> Signaux d'alarme
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {parsed.hpi.red_flags.map((rf: any, i: number) => (
                                  <Badge key={i} variant="outline" className={cn(
                                    "text-xs font-normal",
                                    rf.checked === true && "border-destructive/40 text-destructive",
                                    rf.checked === false && "border-border text-muted-foreground line-through"
                                  )}>
                                    {rf.checked === true ? '⚠ ' : rf.checked === false ? '✓ ' : ''}{rf.label}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {parsed.hpi.objective_highlights && parsed.hpi.objective_highlights.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Examens clés</p>
                              <ul className="space-y-0.5">
                                {parsed.hpi.objective_highlights.map((h: string, i: number) => (
                                  <li key={i} className="text-sm flex items-start gap-1.5">
                                    <ChevronRight className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                                    {h}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {parsed.hpi.since_last_visit && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Depuis la dernière visite</p>
                              {typeof parsed.hpi.since_last_visit === 'string' ? (
                                <p className="text-sm">{parsed.hpi.since_last_visit}</p>
                              ) : Array.isArray(parsed.hpi.since_last_visit) ? (
                                <ul className="space-y-0.5">
                                  {(parsed.hpi.since_last_visit as string[]).map((item: string, i: number) => (
                                    <li key={i} className="text-sm flex items-start gap-1.5">
                                      <ChevronRight className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          )}
                          {parsed.hpi.patient_goal && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <Heart className="h-3 w-3" /> Objectif patient
                              </p>
                              <p className="text-sm italic">{parsed.hpi.patient_goal}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Problems */}
                      {parsed.problems && parsed.problems.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="font-medium text-sm flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-muted-foreground" />
                            Problèmes ({parsed.problems.length})
                          </h3>
                          {parsed.problems.map((prob: any, idx: number) => (
                            <div key={idx} className="border rounded-lg p-4 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="font-medium text-sm">{prob.title}</h4>
                                {prob.urgency && (
                                  <Badge variant="outline" className="text-[10px] shrink-0">{prob.urgency}</Badge>
                                )}
                              </div>
                              {prob.assessment && (
                                <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">{prob.assessment}</p>
                              )}
                              {prob.evidence && prob.evidence.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Éléments de preuve</p>
                                  <ul className="space-y-0.5">
                                    {prob.evidence.map((e: string, i: number) => (
                                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                        <CheckCircle2 className="h-3 w-3 mt-0.5 text-[var(--medicai-green-dark)] shrink-0" />
                                        {e}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {prob.plan && Object.keys(prob.plan).length > 0 && (
                                <div className="space-y-2 pt-1">
                                  {Object.entries(prob.plan as Record<string, string[]>).map(([bucket, items]) => {
                                    const bucketLabels: Record<string, string> = {
                                      today: "Aujourd'hui",
                                      orders: "Ordonnances",
                                      treatment: "Traitement",
                                      follow_up: "Suivi",
                                      safety_net: "Sécurité",
                                    };
                                    return (
                                      <div key={bucket}>
                                        <p className="text-xs font-medium text-muted-foreground mb-0.5">
                                          {bucketLabels[bucket] || bucket}
                                        </p>
                                        <ul className="space-y-0.5">
                                          {(items as string[]).map((item: string, i: number) => (
                                            <li key={i} className="text-sm flex items-start gap-1.5">
                                              <span className="text-muted-foreground mt-0.5">•</span>
                                              {item}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Orders */}
                      {parsed.orders && Object.keys(parsed.orders).length > 0 && (
                        <div className="border rounded-lg p-4 space-y-2">
                          <h3 className="font-medium text-sm flex items-center gap-2">
                            <Pill className="h-4 w-4 text-muted-foreground" />
                            Ordonnances & Demandes
                          </h3>
                          {Object.entries(parsed.orders as Record<string, string[]>).map(([key, items]) => {
                            const orderLabels: Record<string, string> = {
                              rx_intents: "Prescriptions",
                              referral_intents: "Orientations",
                              followup_intents: "Suivis",
                              lab_imaging_intents: "Laboratoire / Imagerie",
                            };
                            return (
                              <div key={key}>
                                <p className="text-xs font-medium text-muted-foreground mb-0.5">
                                  {orderLabels[key] || key}
                                </p>
                                <ul className="space-y-0.5">
                                  {(items as string[]).map((item: string, i: number) => (
                                    <li key={i} className="text-sm flex items-start gap-1.5">
                                      <span className="text-muted-foreground mt-0.5">•</span>
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Generated documents / files */}
                      {parsed.documents && parsed.documents.length > 0 && (
                        <div className="border rounded-lg p-4 space-y-2">
                          <h3 className="font-medium text-sm flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            Documents générés ({parsed.documents.length})
                          </h3>
                          <div className="space-y-1">
                            {parsed.documents.map((doc: any, i: number) => {
                              const typeLabels: Record<string, string> = {
                                prescription: 'Ordonnance',
                                referral_letter: 'Lettre d\'orientation',
                                followup_plan: 'Plan de suivi',
                                lab_order: 'Demande d\'examens',
                                visit_note: 'Note de visite',
                              };
                              const statusLabels: Record<string, string> = {
                                draft: 'Brouillon',
                                reviewed: 'Revu',
                                signed: 'Signé',
                                sent: 'Envoyé',
                                delivered: 'Délivré',
                                failed: 'Échoué',
                              };
                              return (
                                <div key={i} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2 text-sm">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span>{typeLabels[doc.type] || doc.type}</span>
                                    {doc.channel && (
                                      <Badge variant="outline" className="text-[10px] h-4 px-1">{doc.channel}</Badge>
                                    )}
                                  </div>
                                  <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                                    {statusLabels[doc.status] || doc.status}
                                  </Badge>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Quick notes */}
                      {parsed.quick_notes && parsed.quick_notes.length > 0 && (
                        <div className="border rounded-lg p-4 space-y-2">
                          <h3 className="font-medium text-sm flex items-center gap-2">
                            <StickyNote className="h-4 w-4 text-muted-foreground" />
                            Notes rapides
                          </h3>
                          <ul className="space-y-1">
                            {parsed.quick_notes.map((n: string, i: number) => (
                              <li key={i} className="text-sm text-muted-foreground">{n}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                }

                // --- Legacy plain-text rendering (v1) ---
                if (consultationSummary.summary) {
                  return (
                    <div className="space-y-4">
                      {consultationSummary.summary.split('\n\n').map((section: string, idx: number) => {
                        const lines = section.split('\n');
                        const firstLine = lines[0] || '';
                        
                        if (firstLine.startsWith('Visit:')) {
                          return (
                            <div key={idx} className="bg-[var(--medicai-green-light)] border border-[var(--medicai-green)]/40 rounded-lg p-4">
                              <h3 className="font-medium text-sm mb-1 flex items-center gap-2">
                                <Target className="h-4 w-4" />
                                Motif de consultation
                              </h3>
                              <p className="text-sm">{firstLine.replace('Visit:', '').trim()}</p>
                            </div>
                          );
                        }
                        
                        if (firstLine.startsWith('HPI:')) {
                          return (
                            <div key={idx} className="border rounded-lg p-4">
                              <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                Histoire de la maladie
                              </h3>
                              <p className="text-sm">{firstLine.replace('HPI:', '').trim()}</p>
                              {lines.slice(1).filter((l: string) => l.trim()).map((line: string, i: number) => (
                                <p key={i} className="text-sm text-muted-foreground mt-1">{line}</p>
                              ))}
                            </div>
                          );
                        }
                        
                        if (firstLine.startsWith('Problem:')) {
                          return (
                            <div key={idx} className="border rounded-lg p-4">
                              <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                                {firstLine.replace('Problem:', '').trim()}
                              </h3>
                              <ul className="space-y-1">
                                {lines.slice(1).filter((l: string) => l.trim()).map((line: string, i: number) => (
                                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <span className="mt-0.5">•</span>
                                    <span>{line.replace(/^\s*-\s*/, '')}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        }
                        
                        return (
                          <div key={idx} className="bg-muted/50 rounded-lg p-4">
                            <p className="text-sm whitespace-pre-wrap">{section}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                return (
                  <div className="text-sm text-muted-foreground">
                    Aucun contenu de résumé disponible.
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4 opacity-50" />
              <p>Aucun résumé disponible</p>
              <p className="text-sm mt-1">La consultation n'a peut-être pas encore été complétée.</p>
            </div>
          )}
        </ScrollArea>

        <div className="px-6 py-4 border-t bg-background">
          <Button
            variant="outline"
            onClick={() => {
              setSummarySheetOpen(false);
              setViewingConsultationId(null);
            }}
            className="w-full"
          >
            Fermer
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  </div>
  );
}
