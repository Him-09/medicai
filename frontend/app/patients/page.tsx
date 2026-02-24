'use client';

import { useState, useMemo } from 'react';
import { usePatients, useCreatePatient, useUpdatePatient, useCreateConsultation, useConsultations } from '@/lib/hooks';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Plus, RotateCcw, ArrowRight, Calendar, FileText, AlertCircle, Clock, CalendarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { differenceInMonths, differenceInDays, format, parseISO, addDays, isBefore, startOfDay } from 'date-fns';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

export default function PatientsPage() {
  const router = useRouter();
  const { data: patients, isLoading } = usePatients();
  const { data: consultations } = useConsultations();
  const { mutate: createPatient, isPending } = useCreatePatient();
  const { mutate: updatePatient } = useUpdatePatient();
  const { mutate: createConsultation, isPending: isCreatingConsultation } = useCreateConsultation();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [consultationDialogOpen, setConsultationDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [consultationName, setConsultationName] = useState<string>('');
  const [consultationDate, setConsultationDate] = useState<Date>(new Date());
  const [consultationTime, setConsultationTime] = useState<string>('09:00');
  const [error, setError] = useState<string>('');

  const [formData, setFormData] = useState({
    name: '',
    dob: '',
    sex: '' as '' | 'M' | 'F',
    email: '',
    phone: '',
    address: '',
    medical_history: '',
    allergies: '',
    active_problems: '',
  });

  const calculateAge = (dob: string) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const getNextAction = (patient: any) => {

    if (patient.pendingDocumentsCount && patient.pendingDocumentsCount > 0) {
      return {
        type: 'pending',
        text: `${patient.pendingDocumentsCount} doc${patient.pendingDocumentsCount > 1 ? 's' : ''} à réviser`,
        urgent: true,
      };
    }

    if (patient.lastConsultation && patient.lastConsultation !== '-') {
      try {
        const lastVisit = parseISO(patient.lastConsultation);
        const monthsAgo = differenceInMonths(new Date(), lastVisit);
        if (monthsAgo >= 6) {
          return {
            type: 'followup',
            text: `Pas de visite depuis ${monthsAgo} mois`,
            urgent: monthsAgo >= 12,
          };
        }
      } catch {

      }
    }

    return null;
  };

  const formatLastConsultation = (dateStr: string | undefined) => {
    if (!dateStr || dateStr === '-') return 'Jamais';
    try {
      const date = parseISO(dateStr);

      if (isNaN(date.getTime())) return 'Jamais';
      const daysAgo = differenceInDays(new Date(), date);
      if (isNaN(daysAgo)) return 'Jamais';
      if (daysAgo === 0) return "Aujourd'hui";
      if (daysAgo === 1) return 'Hier';
      if (daysAgo < 7) return `Il y a ${daysAgo}j`;
      if (daysAgo < 30) return `Il y a ${Math.floor(daysAgo / 7)} sem`;
      if (daysAgo < 365) return `Il y a ${Math.floor(daysAgo / 30)} mois`;
      return `Il y a ${Math.floor(daysAgo / 365)} an${Math.floor(daysAgo / 365) > 1 ? 's' : ''}`;
    } catch {
      return 'Jamais';
    }
  };

  const parseSearchQuery = (query: string) => {
    const filters: { text: string; hasPending?: boolean; isArchived?: boolean; lastVisitMonths?: number } = { text: '' };

    const parts = query.split(/\s+/);
    const textParts: string[] = [];

    parts.forEach(part => {
      if (part.toLowerCase() === 'has:pending') {
        filters.hasPending = true;
      } else if (part.toLowerCase() === 'status:archived') {
        filters.isArchived = true;
      } else if (part.toLowerCase().startsWith('last:>')) {
        const months = parseInt(part.slice(6).replace('m', ''));
        if (!isNaN(months)) filters.lastVisitMonths = months;
      } else {
        textParts.push(part);
      }
    });

    filters.text = textParts.join(' ');
    return filters;
  };

  const handleNewPatient = () => {
    if (!formData.name || !formData.dob) {
      setError('Le nom et la date de naissance sont requis');
      return;
    }

    setError('');

    const processedData = {
      ...formData,
      sex: formData.sex || undefined,
      allergies: formData.allergies ? formData.allergies.split(',').map(a => a.trim()).filter(Boolean) : [],
      active_problems: formData.active_problems ? formData.active_problems.split(',').map(p => p.trim()).filter(Boolean) : [],
    };

    createPatient(processedData, {
      onSuccess: (data) => {
        setDialogOpen(false);
        setFormData({
          name: '',
          dob: '',
          sex: '',
          email: '',
          phone: '',
          address: '',
          medical_history: '',
          allergies: '',
          active_problems: '',
        });
        router.push(`/patients/${data.patient_id}`);
      },
      onError: (error: any) => {
        setError(error.message || 'Échec de la création du patient');
      },
    });
  };

  const filteredPatients = useMemo(() => {
    if (!patients) return [];

    const searchFilters = parseSearchQuery(searchQuery);

    let filtered = patients.filter((patient) => {

      if (searchFilters.text) {
        const matchesSearch = patient.name.toLowerCase().includes(searchFilters.text.toLowerCase()) ||
                              patient.patientId?.toLowerCase().includes(searchFilters.text.toLowerCase());
        if (!matchesSearch) return false;
      }

      if (searchFilters.hasPending && (!patient.pendingDocumentsCount || patient.pendingDocumentsCount === 0)) {
        return false;
      }
      if (searchFilters.isArchived && patient.status !== 'archived') {
        return false;
      }
      if (searchFilters.lastVisitMonths && patient.lastConsultation && patient.lastConsultation !== '-') {
        try {
          const lastVisit = parseISO(patient.lastConsultation);
          const monthsAgo = differenceInMonths(new Date(), lastVisit);
          if (monthsAgo < searchFilters.lastVisitMonths) return false;
        } catch {

        }
      }

      const matchesFilter = filter === 'all' || patient.status === filter;

      return matchesFilter;
    });

    return filtered.sort((a, b) => {

      const actionA = getNextAction(a);
      const actionB = getNextAction(b);
      if (actionA?.urgent && !actionB?.urgent) return -1;
      if (actionB?.urgent && !actionA?.urgent) return 1;

      if (a.lastConsultation && b.lastConsultation && a.lastConsultation !== '-' && b.lastConsultation !== '-') {
        try {
          const dateA = parseISO(a.lastConsultation);
          const dateB = parseISO(b.lastConsultation);
          return dateB.getTime() - dateA.getTime();
        } catch {
          return 0;
        }
      }
      if (a.lastConsultation && a.lastConsultation !== '-') return -1;
      if (b.lastConsultation && b.lastConsultation !== '-') return 1;

      return 0;
    });
  }, [patients, searchQuery, filter]);

  const handlePatientClick = (patientId: string) => {
    router.push(`/patients/${patientId}`);
  };

  const handleNewConsultation = (e: React.MouseEvent, patient: any) => {
    e.stopPropagation();

    const hasActiveConsultation = consultations?.some(
      (c) => c.patientId === `#${patient.id}` && c.status === 'active'
    );

    if (hasActiveConsultation) {
      toast.error('Ce patient a déjà une consultation active. Veuillez la terminer avant d\'en créer une nouvelle.');
      return;
    }

    setSelectedPatient(patient);
    setConsultationName('');
    setConsultationDate(new Date());
    setConsultationTime('09:00');
    setError('');
    setConsultationDialogOpen(true);
  };

  const handleCreateConsultation = () => {
    if (!selectedPatient) return;

    const [hours, minutes] = consultationTime.split(':').map(Number);
    const dateTime = new Date(consultationDate);
    dateTime.setHours(hours, minutes, 0, 0);

    setError('');
    createConsultation(
      { patientId: selectedPatient.id, name: consultationName || undefined, consultationTime: dateTime },
      {
        onSuccess: (data) => {
          setConsultationDialogOpen(false);
          setSelectedPatient(null);
          setConsultationName('');
          toast.success('Consultation créée');
          router.push(`/consultations/${data.consultation_id}`);
        },
        onError: (error: any) => {
          setError(error.message || 'Échec de la création. Vérifiez que le serveur est en cours d\'exécution.');
        },
      }
    );
  };

  const handleRestorePatient = (patientId: string, patientName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updatePatient(
      {
        id: patientId,
        data: { status: 'active' },
      },
      {
        onSuccess: () => {
          toast.success(`${patientName} a été réactivé`);
        },
        onError: (error: any) => {
          toast.error(error.message || 'Échec de la restauration');
        },
      }
    );
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
        <h1 className="text-3xl font-semibold">Patients</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau patient
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[85vh] p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>Nouveau Patient</DialogTitle>
              <DialogDescription>
                Ajoutez un nouveau patient. Les champs marqués * sont obligatoires.
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[calc(85vh-180px)] px-6">
              <div className="space-y-4 py-0">
                {error && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                    {error}
                  </div>
                )}

                {}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Informations de base</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1 ml-1">
                      <Label htmlFor="name">Nom complet *</Label>
                      <Input
                        id="name"
                        placeholder="Mohamed Alami"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dob">Date de naissance *</Label>
                      <Input
                        id="dob"
                        type="date"
                        value={formData.dob}
                        onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sex">Sexe</Label>
                      <Select value={formData.sex} onValueChange={(value: 'M' | 'F') => setFormData({ ...formData, sex: value })}>
                        <SelectTrigger id="sex">
                          <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M">Masculin</SelectItem>
                          <SelectItem value="F">Féminin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Contact</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 ml-1">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="patient@email.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 mr-1">
                      <Label htmlFor="phone">Téléphone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+212 6XX XX XX XX"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1 mx-1">
                    <Label htmlFor="address">Adresse</Label>
                    <Input
                      id="address"
                      placeholder="Rue, Ville"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                </div>

                <Separator />

                {}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Informations cliniques</h3>
                  <div className="space-y-1 mx-1">
                    <Label htmlFor="allergies">Allergies</Label>
                    <Input
                      id="allergies"
                      placeholder="Pénicilline, Latex, Arachides (séparées par virgules)"
                      value={formData.allergies}
                      onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1 mx-1">
                    <Label htmlFor="active_problems">Pathologies actives</Label>
                    <Input
                      id="active_problems"
                      placeholder="HTA, Diabète type 2 (séparées par virgules)"
                      value={formData.active_problems}
                      onChange={(e) => setFormData({ ...formData, active_problems: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1 mx-1">
                    <Label htmlFor="medical_history">Antécédents</Label>
                    <Textarea
                      id="medical_history"
                      placeholder="Antécédents médicaux, chirurgicaux, familiaux..."
                      rows={4}
                      value={formData.medical_history}
                      onChange={(e) => setFormData({ ...formData, medical_history: e.target.value })}
                      className="resize-none"
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setError('');
                }}
                disabled={isPending}
              >
                Annuler
              </Button>
              <Button onClick={handleNewPatient} disabled={isPending}>
                {isPending ? 'Création...' : 'Créer le patient'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {}
      <div className="space-y-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un patient..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {}
         {

}
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full">
        <TabsList>
          <TabsTrigger value="all">Tout</TabsTrigger>
          <TabsTrigger value="active">Actifs</TabsTrigger>
          <TabsTrigger value="archived">Archivés</TabsTrigger>
        </TabsList>
      </Tabs>

      {}
      {filteredPatients.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground border rounded-md">
          Aucun patient trouvé
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPatients.map((patient) => {
            const initials = patient.name
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .toUpperCase();

            const age = calculateAge(patient.dob);
            const nextAction = getNextAction(patient);

            return (
              <div
                key={patient.id}
                className="border border-[#EAEAEA] rounded-xl p-4 bg-white group"
              >
                {}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarFallback className="text-sm">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{patient.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {age ? `${age} ans` : patient.dob}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={patient.status === 'active' ? 'default' : 'secondary'}
                    className={cn(
                      "text-xs flex-shrink-0",
                      patient.status === 'active' && "bg-[var(--medicai-green-light)] text-black-600 border-[var(--medicai-green)]"
                    )}
                  >
                    {patient.status === 'active' ? 'Actif' : 'Archivé'}
                  </Badge>
                </div>

                {}
                {

}

                {}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatLastConsultation(patient.lastConsultation)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <span>{patient.documentsCount || 0} docs</span>
                  </div>
                </div>

                {}
                <div className={cn(
                  "text-xs px-2 py-1.5 rounded-md mb-3 h-[28px]",
                  nextAction ? "flex items-center gap-1.5" : "invisible",
                  nextAction?.urgent ? "bg-muted text-gray-700" : "bg-muted text-gray-700"
                )}>
                  {nextAction && (
                    <>
                      {nextAction.type === 'pending' ? (
                        <FileText className="h-3 w-3 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                      )}
                      <span>{nextAction.text}</span>
                    </>
                  )}
                </div>

                {}
                <div className="flex items-center gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={(e) => handleNewConsultation(e, patient)}
                    disabled={isCreatingConsultation || patient.status === 'archived'}
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    Consultation
                  </Button>
                  {patient.status === 'archived' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleRestorePatient(patient.id, patient.name, e)}
                      className="h-8 text-xs"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Réactiver
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => handlePatientClick(patient.id)}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      </div>

      {}
      <div className="mt-auto pt-6">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{filteredPatients.length} patient{filteredPatients.length > 1 ? 's' : ''}</span>
          <span className="text-xs">Trié par: Actions urgentes, puis dernière visite</span>
        </div>
      </div>

      {}
      <Dialog open={consultationDialogOpen} onOpenChange={setConsultationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle Consultation</DialogTitle>
            <DialogDescription>
              Créer une consultation pour {selectedPatient?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}

            {}

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
                  <CalendarComponent
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
              disabled={!selectedPatient || isCreatingConsultation}
              className="w-full"
            >
              {isCreatingConsultation ? 'Création...' : 'Créer la consultation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
