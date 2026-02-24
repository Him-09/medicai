'use client';

import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { settingsApi, ReportStats, ReportStat, WeeklyData, DocumentTypeBreakdown } from '@/lib/api/settings';

export default function ReportsPage() {
  const [period, setPeriod] = useState('30days');
  const [isFetching, setIsFetching] = useState(true);
  const [stats, setStats] = useState<ReportStat[]>([
    { label: 'Consultations', value: '0', change: '0%', changeType: 'neutral' },
    { label: 'Documents traités', value: '0', change: '0%', changeType: 'neutral' },
    { label: 'Temps moyen/note', value: '0 min', change: '0%', changeType: 'neutral' },
    { label: 'Patients actifs', value: '0', change: '+0', changeType: 'neutral' },
  ]);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([
    { day: 'Lundi', consultations: 0, documents: 0 },
    { day: 'Mardi', consultations: 0, documents: 0 },
    { day: 'Mercredi', consultations: 0, documents: 0 },
    { day: 'Jeudi', consultations: 0, documents: 0 },
    { day: 'Vendredi', consultations: 0, documents: 0 },
    { day: 'Samedi', consultations: 0, documents: 0 },
    { day: 'Dimanche', consultations: 0, documents: 0 },
  ]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeBreakdown[]>([]);
  const [timeSavedHours, setTimeSavedHours] = useState(0);

  useEffect(() => {
    loadStats();
  }, [period]);

  const loadStats = async () => {
    try {
      setIsFetching(true);
      const data = await settingsApi.getReportStats(period);
      setStats(data.stats);
      setWeeklyData(data.weekly_data);
      setDocumentTypes(data.document_types);
      setTimeSavedHours(data.time_saved_hours);
    } catch (error) {
      console.error('Failed to load report stats:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const maxConsultations = Math.max(...weeklyData.map(d => d.consultations), 1);
  const maxDocuments = Math.max(...weeklyData.map(d => d.documents), 1);

  return (
    <div className="space-y-5">
      {}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111]">Rapports</h1>
          <p className="text-sm text-[#666] mt-0.5">
            Suivez votre activité et analysez vos statistiques.
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36 h-9 text-sm border-[#E5E5E5]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">7 derniers jours</SelectItem>
            <SelectItem value="30days">30 derniers jours</SelectItem>
            <SelectItem value="90days">90 derniers jours</SelectItem>
            <SelectItem value="year">Cette année</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isFetching ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--medicai-green)]"></div>
        </div>
      ) : (
        <>
          {}
          <div className="grid grid-cols-4 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white rounded-lg border border-[#E5E5E5] p-3">
                <p className="text-xs text-[#666]">{stat.label}</p>
                <p className="text-xl font-bold text-[#111] mt-0.5">{stat.value}</p>
                {stat.change && (
                  <p className={`text-xs mt-0.5 ${
                    stat.changeType === 'positive' ? 'text-[var(--medicai-green-dark)]' :
                    stat.changeType === 'negative' ? 'text-destructive' : 'text-[#666]'
                  }`}>
                    {stat.change}
                  </p>
                )}
              </div>
            ))}
          </div>

          {}
          <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="uppercase text-[10px] font-semibold text-[#999] tracking-wide">
                Activité de la semaine
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-black"></div>
                  <span className="text-xs text-[#666]">Consultations</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-[var(--medicai-green)]"></div>
                  <span className="text-xs text-[#666]">Documents</span>
                </div>
              </div>
            </div>

            <div className="space-y-0">
              {weeklyData.map((day, index) => (
                <div
                  key={day.day}
                  className={`flex items-center gap-3 py-2 ${
                    index < weeklyData.length - 1 ? 'border-b border-[#E5E5E5]' : ''
                  }`}
                >
                  <span className="text-xs font-medium text-[#333] w-20">{day.day}</span>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-black rounded-full transition-all"
                          style={{ width: `${(day.consultations / maxConsultations) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-[#666] w-6 text-right">{day.consultations}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--medicai-green)] rounded-full transition-all"
                          style={{ width: `${(day.documents / maxDocuments) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-[#666] w-6 text-right">{day.documents}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {}
      <div className="bg-gradient-to-r from-[var(--medicai-green-light)] to-[var(--medicai-green-light)]/50 rounded-lg border border-[var(--medicai-green)] p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[var(--medicai-green-light)] flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-[var(--medicai-green-dark)]" />
          </div>
          <div>
            <p className="text-xs text-[#666]">Temps estimé gagné ce mois</p>
            <p className="text-2xl font-bold text-[var(--medicai-green-dark)]">~{timeSavedHours} heures</p>
            <p className="text-xs text-[#666]">
              Basé sur {stats[0]?.value || 0} consultations et {stats[1]?.value || 0} documents traités
            </p>
          </div>
        </div>
      </div>

      {}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <div className="uppercase text-[10px] font-semibold text-[#999] tracking-wide mb-3">
          Documents par type
        </div>

        {documentTypes.length === 0 ? (
          <p className="text-sm text-[#666] py-4 text-center">Aucune donnée disponible</p>
        ) : (
          <div className="space-y-2.5">
            {documentTypes.map((item) => (
              <div key={item.type} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#333]">{item.type}</span>
                  <span className="text-xs text-[#666]">{item.count} ({item.percentage}%)</span>
                </div>
                <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-black rounded-full transition-all"
                    style={{ width: `${item.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
