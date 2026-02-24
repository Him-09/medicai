'use client';

import { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useConsultations, usePatients, useCreateConsultation, useUpdateConsultation, useCancelConsultation, useClinicSchedule, useClinicSettings } from '@/lib/hooks';
import { format, isSameDay, parseISO, startOfDay, isToday, isPast, isBefore, getDay } from 'date-fns';
import { Clock, User, Plus, FileText, Calendar as CalendarIcon, MoreVertical, Edit, XCircle, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const dayMapping: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [reschedulingConsultation, setReschedulingConsultation] = useState<any>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('09:00');
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [rescheduleTime, setRescheduleTime] = useState<string>('09:00');

  const { data: consultations = [], isLoading: consultationsLoading } = useConsultations();
  const { data: patients = [], isLoading: patientsLoading } = usePatients();
  const { data: clinicSchedule = [], isLoading: scheduleLoading } = useClinicSchedule();
  const { data: clinicSettings, isLoading: settingsLoading } = useClinicSettings();
  const { mutate: createConsultation, isPending: isCreating } = useCreateConsultation();
  const { mutate: updateConsultation } = useUpdateConsultation();
  const { mutate: cancelConsultation } = useCancelConsultation();
  const router = useRouter();

  const consultationDuration = clinicSettings?.default_consultation_duration || 30;

  const selectedDaySchedule = useMemo(() => {
    const dayOfWeek = getDay(selectedDate);
    const dayKey = dayMapping[dayOfWeek];
    return clinicSchedule.find(s => s.day === dayKey);
  }, [selectedDate, clinicSchedule]);

  const isClinicOpen = selectedDaySchedule?.enabled ?? true;

  const timeSlots = useMemo(() => {
    if (!selectedDaySchedule || !selectedDaySchedule.enabled) {

      const slots: string[] = [];
      const duration = consultationDuration;
      for (let minutes = 8 * 60; minutes < 20 * 60; minutes += duration) {
        const hour = Math.floor(minutes / 60);
        const min = minutes % 60;
        slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
      }
      return slots;
    }

    const [startHour, startMin = 0] = selectedDaySchedule.start.split(':').map(Number);
    const [endHour, endMin = 0] = selectedDaySchedule.end.split(':').map(Number);
    const slots: string[] = [];

    const startTotalMinutes = startHour * 60 + startMin;
    const endTotalMinutes = endHour * 60 + endMin;
    const duration = consultationDuration;

    for (let minutes = startTotalMinutes; minutes < endTotalMinutes; minutes += duration) {
      const hour = Math.floor(minutes / 60);
      const min = minutes % 60;
      slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }

    return slots;
  }, [selectedDaySchedule, consultationDuration]);

  const consultationsWithDates = consultations
    .filter(c => c.status === 'active')
    .map(c => {
      const dateStr = c.consultationTime || c.createdAt;
      const date = new Date(dateStr);

      return {
        ...c,
        date,
      };
    });

  const selectedDateConsultations = consultationsWithDates
    .filter(c => isSameDay(c.date, selectedDate))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const datesWithConsultations = consultationsWithDates.map(c => startOfDay(c.date));

  const hasConsultation = (date: Date) => {
    return datesWithConsultations.some(d => isSameDay(d, date));
  };

  const isClinicClosed = (date: Date) => {
    const dayOfWeek = getDay(date);
    const dayKey = dayMapping[dayOfWeek];
    const schedule = clinicSchedule.find(s => s.day === dayKey);
    return schedule ? !schedule.enabled : false;
  };

  const getConsultationsForTimeSlot = (timeSlot: string) => {
    const [slotHour, slotMin] = timeSlot.split(':').map(Number);
    const slotStartMinutes = slotHour * 60 + slotMin;
    const slotEndMinutes = slotStartMinutes + consultationDuration;

    return selectedDateConsultations.filter(c => {

      const consultationMinutes = c.date.getHours() * 60 + c.date.getMinutes();

      return consultationMinutes >= slotStartMinutes && consultationMinutes < slotEndMinutes;
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isTimeSlotPast = (timeSlot: string) => {
    if (!isToday(selectedDate)) {
      return isPast(startOfDay(selectedDate));
    }
    const [slotHour, slotMin] = timeSlot.split(':').map(Number);
    const now = new Date();
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
    const slotTotalMinutes = slotHour * 60 + slotMin;

    return currentTotalMinutes >= slotTotalMinutes;
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
        data: {
          consultation_time: dateTime
        }
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

  if (consultationsLoading || patientsLoading || scheduleLoading || settingsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Chargement du planning...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {}
      <div className="w-80 bg-white border-r p-6 flex flex-col">
        <div className="mb-0">
          <h1 className="text-2xl font-semibold text-gray-900">Planning</h1>
          <p className="text-sm text-gray-600 mt-1">
            Voir et gérer vos consultations
          </p>
        </div>

        <Card className="flex-shrink-0 border-0 shadow-none">
          <CardContent className="p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              className="rounded-md"
              disabled={(date) => isBefore(startOfDay(date), startOfDay(new Date()))}
              modifiers={{
                scheduled: hasConsultation,
                closed: isClinicClosed,
              }}
              modifiersClassNames={{
                scheduled: 'font-bold text-[var(--medicai-green-dark)]',
                closed: 'text-gray-300 line-through',
              }}
            />
          </CardContent>
        </Card>

        {}
        {selectedDaySchedule && (
          <div className={cn(
            "mt-0 p-2 rounded-lg text-sm",
            isClinicOpen ? "bg-green-50 text-black" : "bg-red-50 text-red-700"
          )}>
            {isClinicOpen ? (
              <>
                <p className="font-medium">Cabinet ouvert: {selectedDaySchedule.start} - {selectedDaySchedule.end}</p>
              </>
            ) : (
              <>
                <p className="font-medium">Cabinet fermé</p>
                <p className="text-xs mt-0.5">Pas de consultations ce jour</p>
              </>
            )}
          </div>
        )}

        <div className="mt-2 p-2 bg-[var(--medicai-green-light)] rounded-lg">
          <p className="text-xs text-gray-600 mb-2">Consultations totales</p>
          <p className="text-2xl font-semibold text-gray-700">{consultations.length}</p>
          <p className="text-xs text-gray-500 mt-1">
            {selectedDateConsultations.length} on {format(selectedDate, 'MMM d')}
          </p>
        </div>
      </div>

      {}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isClinicOpen
                ? `${selectedDateConsultations.length} consultation${selectedDateConsultations.length !== 1 ? 's' : ''} prévue${selectedDateConsultations.length !== 1 ? 's' : ''}`
                : 'Cabinet fermé ce jour'
              }
            </p>
          </div>

          {!isClinicOpen ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">Cabinet fermé</h3>
              <p className="text-sm text-gray-500 mt-1">
                Le cabinet est fermé le {selectedDaySchedule?.dayLabel || format(selectedDate, 'EEEE')}.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Vous pouvez modifier vos horaires dans les <a href="/settings/clinic" className="text-[var(--medicai-green-dark)] hover:underline">paramètres du cabinet</a>.
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-4 gap-3 max-w-6xl mx-auto">
              {timeSlots.map(timeSlot => {
                const consultationsAtTime = getConsultationsForTimeSlot(timeSlot);
                const hasConsultations = consultationsAtTime.length > 0;
                const isPastSlot = isTimeSlotPast(timeSlot);

                return (
                  <Card
                    key={timeSlot}
                    className={cn(
                      "h-36 transition-all duration-200 relative",
                      hasConsultations && "bg-white hover:shadow-lg border-l-4 border-l-black",
                      !hasConsultations && !isPastSlot && "border-dashed hover:border-solid hover:bg-gray-50 cursor-pointer",
                      isPastSlot && "opacity-40 cursor-not-allowed bg-gray-50"
                    )}
                    onClick={() => {
                      if (!hasConsultations && !isPastSlot) {
                        setSelectedTime(timeSlot);
                        setScheduleDialogOpen(true);
                      }
                    }}
                  >
                    <CardContent className="px-3 py-0 h-full flex flex-col justify-between">
                      {}
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-gray-700">
                          {timeSlot}
                        </div>
                        {hasConsultations && consultationsAtTime[0] && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => {
                                const consultationId = consultationsAtTime[0].id;
                                if (consultationId) {
                                  router.push(`/consultations/${consultationId}`);
                                }
                              }}>
                                <FileText className="mr-2 h-4 w-4" />
                                Voir détails
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleReschedule(consultationsAtTime[0])}>
                                <Edit className="mr-2 h-4 w-4" />
                                Reprogrammer
                              </DropdownMenuItem>
                              {consultationsAtTime[0].status === 'active' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleCancelConsultation(consultationsAtTime[0].id)}
                                    className="text-destructive"
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Annuler
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>

                      {}
                      <div className="flex-1 flex items-center justify-center">
                        {hasConsultations ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            {consultationsAtTime.map(consultation => {
                              const patient = patients.find(p => p.patientId === consultation.patientId);
                              return (
                                <div key={consultation.id} className="flex flex-col items-center gap-2">
                                  <Avatar className="h-10 w-10">
                                    <AvatarFallback className="bg-[var(--medicai-green-light)] text-[var(--medicai-green-dark)] border-[var(--medicai-green-light)] font-semibold text-sm">
                                      {patient ? getInitials(patient.name) : getInitials(consultation.patientName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-xs text-gray-900 text-center">
                                    {(patient?.name || consultation.patientName).split(' ')[0]}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <Plus className={cn(
                            "w-6 h-6",
                            isPastSlot ? "text-gray-300" : "text-gray-400"
                          )} />
                        )}
                      </div>

                      {}
                      <div className={cn(
                        "text-[10px] font-medium text-center uppercase tracking-wide",
                        hasConsultations ? "text-[var(--medicai-green-dark)]" : "text-gray-500"
                      )}>
                        {isPastSlot ? 'Passé' : hasConsultations ? 'Voir' : 'Libre'}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planifier une consultation</DialogTitle>
            <DialogDescription>
              Sélectionner un patient et l'heure pour le {format(selectedDate, 'd MMMM yyyy')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Patient</label>
              <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map(patient => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name} - {patient.patientId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Heure</label>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map(time => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (selectedPatientId) {
                  // Check if patient already has an active consultation
                  const hasActiveConsultation = consultations.some(
                    (c) => c.patientId === `#${selectedPatientId}` && c.status === 'active'
                  );

                  if (hasActiveConsultation) {
                    toast.error('Ce patient a déjà une consultation active. Veuillez la terminer avant d\'en créer une nouvelle.');
                    return;
                  }

                  const [hours] = selectedTime.split(':').map(Number);
                  const slotConsultations = getConsultationsForTimeSlot(selectedTime);
                  if (slotConsultations.length > 0) {
                    toast.error(`Ce créneau (${selectedTime}) est déjà occupé par une autre consultation.`);
                    return;
                  }

                  const consultationDateTime = new Date(selectedDate);
                  consultationDateTime.setHours(hours, 0, 0, 0);

                  createConsultation(
                    { patientId: selectedPatientId, consultationTime: consultationDateTime },
                    {
                      onSuccess: () => {
                        toast.success('Consultation planifiée avec succès !');
                        setScheduleDialogOpen(false);
                        setSelectedPatientId('');
                        setSelectedTime('09:00');
                      },
                      onError: (error: any) => {
                        toast.error(error?.message || 'Échec de la planification');
                      },
                    }
                  );
                }
              }}
              disabled={!selectedPatientId || isCreating}
            >
              {isCreating ? 'Planification...' : 'Planifier'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprogrammer la consultation</DialogTitle>
            <DialogDescription>
              Sélectionner une nouvelle date et heure.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date de consultation</label>
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
                    {rescheduleDate ? format(rescheduleDate, 'd MMMM yyyy') : <span>Choisir une date</span>}
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
              <input
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleUpdateReschedule}
            >
              Reprogrammer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
