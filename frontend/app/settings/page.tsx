'use client';

import { useState, useEffect } from 'react';
import { Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { settingsApi } from '@/lib/api/settings';

interface SetupTask {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
  actionLabel: string;
}

export default function SettingsPage() {
  const [isFetching, setIsFetching] = useState(true);
  const [tasks, setTasks] = useState<SetupTask[]>([
    {
      id: 'clinic-profile',
      title: 'Configurer le profil du cabinet',
      description: 'Ajoutez le nom, l\'adresse et les informations de contact de votre cabinet.',
      href: '/settings/clinic',
      completed: false,
      actionLabel: 'Configurer',
    },
    {
      id: 'doctor-identity',
      title: 'Compléter votre identité',
      description: 'Ajoutez votre spécialité, signature et cachet pour les documents.',
      href: '/settings/account',
      completed: false,
      actionLabel: 'Compléter',
    },
    {
      id: 'integrations',
      title: 'Connecter vos intégrations',
      description: 'Configurez l\'email pour recevoir les documents patients automatiquement.',
      href: '/settings/integrations',
      completed: false,
      actionLabel: 'Connecter',
    },
    {
      id: 'security',
      title: 'Sécuriser votre compte',
      description: 'Activez l\'authentification à deux facteurs pour plus de sécurité.',
      href: '/settings/security',
      completed: false,
      actionLabel: 'Sécuriser',
    },
  ]);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      setIsFetching(true);
      const [profile, clinicSettings] = await Promise.all([
        settingsApi.getProfile(),
        settingsApi.getClinicSettings(),
      ]);
      
      // Check clinic profile completion
      const clinicComplete = !!(clinicSettings.name && clinicSettings.city);
      
      // Check doctor identity completion
      const identityComplete = !!(profile.first_name && profile.last_name && profile.specialty);
      
      setTasks(prev => prev.map(task => {
        if (task.id === 'clinic-profile') {
          return { ...task, completed: clinicComplete, actionLabel: clinicComplete ? 'Fait' : 'Configurer' };
        }
        if (task.id === 'doctor-identity') {
          return { ...task, completed: identityComplete, actionLabel: identityComplete ? 'Fait' : 'Compléter' };
        }
        return task;
      }));
    } catch (error) {
      console.error('Failed to check setup status:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#111]">Mise en route</h1>
        <p className="text-sm text-[#666] mt-0.5">
          {completedCount} sur {tasks.length} tâches terminées
        </p>
      </div>

      {isFetching ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--medicai-green)]"></div>
        </div>
      ) : (
        <>
          {/* Tasks List - Fernand style */}
          <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
            {tasks.map((task, index) => (
              <div
                key={task.id}
                className={cn(
                  'flex items-center gap-3 p-3 transition-colors',
                  index !== tasks.length - 1 && 'border-b border-[#E5E5E5]',
                  task.completed && 'bg-[#FAFAFA]'
                )}
              >
                {/* Status Icon */}
                <div className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0',
                  task.completed 
                    ? 'bg-[var(--medicai-green-light)]' 
                    : 'border-2 border-[#E5E5E5]'
                )}>
                  {task.completed && (
                    <Check className="h-3 w-3 text-[var(--medicai-green-dark)]" />
                  )}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className={cn(
                    'font-medium text-sm',
                    task.completed ? 'text-[#888] line-through' : 'text-[#111]'
                  )}>
                    {task.title}
                  </h3>
                  <p className="text-xs text-[#666] mt-0.5">{task.description}</p>
                </div>
                
                {/* Action Button */}
                <Link href={task.href}>
                  <Button 
                    variant={task.completed ? 'ghost' : 'outline'}
                    size="sm"
                    className={cn(
                      'h-8 px-3 text-xs font-medium rounded-md',
                      task.completed 
                        ? 'text-[var(--medicai-green-dark)] hover:bg-[var(--medicai-green-light)]' 
                        : 'text-[var(--medicai-green-dark)] border-[var(--medicai-green)] hover:bg-[var(--medicai-green-light)] hover:text-[var(--medicai-green-dark)]'
                    )}
                  >
                    {task.actionLabel}
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          {/* Info Box - Fernand style */}
          <div className="flex items-start gap-2 p-3 bg-[#FFF9E6] border border-[#F5E6B3] rounded-lg">
            <Info className="h-4 w-4 text-[#B8860B] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#8B7355]">
              <span className="font-medium text-[#6B4F1D]">Astuce :</span> Complétez toutes les étapes pour profiter pleinement de MedicAI.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
