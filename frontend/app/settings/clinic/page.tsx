'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { settingsApi, DaySchedule } from '@/lib/api/settings';

export default function ClinicSettingsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [clinicInfo, setClinicInfo] = useState({
    name: '',
    address1: '',
    address2: '',
    postalCode: '',
    city: '',
    country: 'Maroc',
    timezone: 'Africa/Casablanca',
    defaultConsultationDuration: '20',
    dateFormat: 'dd/MM/yyyy',
    currency: 'MAD',
  });

  const [schedule, setSchedule] = useState<DaySchedule[]>([
    { day: 'monday', dayLabel: 'Lundi', enabled: true, start: '09:00', end: '18:00' },
    { day: 'tuesday', dayLabel: 'Mardi', enabled: true, start: '09:00', end: '18:00' },
    { day: 'wednesday', dayLabel: 'Mercredi', enabled: true, start: '09:00', end: '18:00' },
    { day: 'thursday', dayLabel: 'Jeudi', enabled: true, start: '09:00', end: '18:00' },
    { day: 'friday', dayLabel: 'Vendredi', enabled: true, start: '09:00', end: '18:00' },
    { day: 'saturday', dayLabel: 'Samedi', enabled: true, start: '09:00', end: '13:00' },
    { day: 'sunday', dayLabel: 'Dimanche', enabled: false, start: '09:00', end: '18:00' },
  ]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsFetching(true);
      const [clinicData, scheduleData] = await Promise.all([
        settingsApi.getClinicSettings(),
        settingsApi.getClinicSchedule(),
      ]);
      
      setClinicInfo({
        name: clinicData.name || '',
        address1: clinicData.address1 || '',
        address2: clinicData.address2 || '',
        postalCode: clinicData.postal_code || '',
        city: clinicData.city || '',
        country: clinicData.country || 'Maroc',
        timezone: clinicData.timezone || 'Africa/Casablanca',
        defaultConsultationDuration: String(clinicData.default_consultation_duration || 20),
        dateFormat: clinicData.date_format || 'dd/MM/yyyy',
        currency: clinicData.currency || 'MAD',
      });
      
      if (scheduleData.schedule && scheduleData.schedule.length > 0) {
        setSchedule(scheduleData.schedule);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const handleScheduleToggle = (day: string) => {
    setSchedule((prev) =>
      prev.map((s) =>
        s.day === day ? { ...s, enabled: !s.enabled } : s
      )
    );
  };

  const handleScheduleTimeChange = (day: string, field: 'start' | 'end', value: string) => {
    setSchedule((prev) =>
      prev.map((s) =>
        s.day === day ? { ...s, [field]: value } : s
      )
    );
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        settingsApi.updateClinicSettings({
          name: clinicInfo.name,
          address1: clinicInfo.address1,
          address2: clinicInfo.address2,
          postal_code: clinicInfo.postalCode,
          city: clinicInfo.city,
          country: clinicInfo.country,
          timezone: clinicInfo.timezone,
          default_consultation_duration: parseInt(clinicInfo.defaultConsultationDuration, 10),
          date_format: clinicInfo.dateFormat,
          currency: clinicInfo.currency,
        }),
        settingsApi.updateClinicSchedule(schedule),
      ]);
      toast.success('Paramètres du cabinet enregistrés');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const timeOptions = Array.from({ length: 24 * 2 }, (_, i) => {
    const hour = Math.floor(i / 2);
    const minute = i % 2 === 0 ? '00' : '30';
    return `${hour.toString().padStart(2, '0')}:${minute}`;
  });

  if (isFetching) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#111]">Cabinet</h1>
          <p className="text-sm text-[#666] mt-0.5">
            Gérez les informations et les horaires de votre cabinet.
          </p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--medicai-green)]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#111]">Cabinet</h1>
        <p className="text-sm text-[#666] mt-0.5">
          Gérez les informations et les horaires de votre cabinet.
        </p>
      </div>

      {/* Clinic Info */}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <div className="uppercase text-[10px] font-semibold text-[#999] tracking-wide mb-3">
          Informations du cabinet
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#333] mb-1">
              Nom du cabinet
            </label>
            <Input
              className="h-9 border-[#E5E5E5]"
              value={clinicInfo.name}
              onChange={(e) => setClinicInfo({ ...clinicInfo, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#333] mb-1.5">
                Adresse ligne 1
              </label>
              <Input
                className="h-10 border-[#E5E5E5]"
                value={clinicInfo.address1}
                onChange={(e) => setClinicInfo({ ...clinicInfo, address1: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333] mb-1.5">
                Adresse ligne 2
              </label>
              <Input
                className="h-10 border-[#E5E5E5]"
                value={clinicInfo.address2}
                onChange={(e) => setClinicInfo({ ...clinicInfo, address2: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#333] mb-1.5">
                Code postal
              </label>
              <Input
                className="h-10 border-[#E5E5E5]"
                value={clinicInfo.postalCode}
                onChange={(e) => setClinicInfo({ ...clinicInfo, postalCode: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333] mb-1.5">
                Ville
              </label>
              <Input
                className="h-10 border-[#E5E5E5]"
                value={clinicInfo.city}
                onChange={(e) => setClinicInfo({ ...clinicInfo, city: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333] mb-1.5">
                Pays
              </label>
              <Select
                value={clinicInfo.country}
                onValueChange={(value) => setClinicInfo({ ...clinicInfo, country: value })}
              >
                <SelectTrigger className="h-10 border-[#E5E5E5]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Maroc">Maroc</SelectItem>
                  <SelectItem value="Algérie">Algérie</SelectItem>
                  <SelectItem value="Tunisie">Tunisie</SelectItem>
                  <SelectItem value="France">France</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Business Hours */}
      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6">
        <div className="uppercase text-[11px] font-semibold text-[#999] tracking-wide mb-4">
          Horaires d'ouverture
        </div>
        
        <div className="space-y-0">
          {schedule.map((day, index) => (
            <div
              key={day.day}
              className={`flex items-center justify-between py-3 ${
                index < schedule.length - 1 ? 'border-b border-[#E5E5E5]' : ''
              }`}
            >
              <div className="flex items-center gap-3 w-32">
                <Switch
                  checked={day.enabled}
                  onCheckedChange={() => handleScheduleToggle(day.day)}
                />
                <span className={`text-sm ${day.enabled ? 'text-[#333]' : 'text-[#999]'}`}>
                  {day.dayLabel}
                </span>
              </div>
              
              {day.enabled ? (
                <div className="flex items-center gap-2">
                  <Select
                    value={day.start}
                    onValueChange={(value) => handleScheduleTimeChange(day.day, 'start', value)}
                  >
                    <SelectTrigger className="h-9 w-24 border-[#E5E5E5] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[#999]">—</span>
                  <Select
                    value={day.end}
                    onValueChange={(value) => handleScheduleTimeChange(day.day, 'end', value)}
                  >
                    <SelectTrigger className="h-9 w-24 border-[#E5E5E5] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className="text-sm text-[#999]">Fermé</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Regional Settings */}
      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6">
        <div className="uppercase text-[11px] font-semibold text-[#999] tracking-wide mb-4">
          Paramètres régionaux
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#333] mb-1.5">
              Fuseau horaire
            </label>
            <Select
              value={clinicInfo.timezone}
              onValueChange={(value) => setClinicInfo({ ...clinicInfo, timezone: value })}
            >
              <SelectTrigger className="h-10 border-[#E5E5E5]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Africa/Casablanca">Casablanca (GMT+1)</SelectItem>
                <SelectItem value="Africa/Algiers">Alger (GMT+1)</SelectItem>
                <SelectItem value="Europe/Paris">Paris (GMT+1)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#333] mb-1.5">
              Format de date
            </label>
            <Select
              value={clinicInfo.dateFormat}
              onValueChange={(value) => setClinicInfo({ ...clinicInfo, dateFormat: value })}
            >
              <SelectTrigger className="h-10 border-[#E5E5E5]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dd/MM/yyyy">JJ/MM/AAAA</SelectItem>
                <SelectItem value="MM/dd/yyyy">MM/JJ/AAAA</SelectItem>
                <SelectItem value="yyyy-MM-dd">AAAA-MM-JJ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#333] mb-1.5">
              Durée consultation par défaut
            </label>
            <Select
              value={clinicInfo.defaultConsultationDuration}
              onValueChange={(value) => setClinicInfo({ ...clinicInfo, defaultConsultationDuration: value })}
            >
              <SelectTrigger className="h-10 border-[#E5E5E5]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="20">20 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#333] mb-1.5">
              Devise
            </label>
            <Select
              value={clinicInfo.currency}
              onValueChange={(value) => setClinicInfo({ ...clinicInfo, currency: value })}
            >
              <SelectTrigger className="h-10 border-[#E5E5E5]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MAD">MAD (Dirham)</SelectItem>
                <SelectItem value="EUR">EUR (Euro)</SelectItem>
                <SelectItem value="DZD">DZD (Dinar)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={isLoading} 
          className="h-10 px-6 bg-black hover:bg-neutral-800 text-white"
        >
          {isLoading ? 'Enregistrement...' : 'Enregistrer les modifications'}
        </Button>
      </div>
    </div>
  );
}
