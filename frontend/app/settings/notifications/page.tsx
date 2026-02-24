'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, Mail, Monitor } from 'lucide-react';
import { settingsApi, NotificationSettings } from '@/lib/api/settings';

export default function NotificationsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>('default');
  const [settings, setSettings] = useState<NotificationSettings>({
    email_notifications: true,
    browser_notifications: false,
    new_document: true,
    document_review: true,
    urgent_alerts: true,
    consultation_reminder: true,
  });

  useEffect(() => {
    loadSettings();

    if ('Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  const loadSettings = async () => {
    try {
      setIsFetching(true);
      const data = await settingsApi.getNotificationSettings();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await settingsApi.updateNotificationSettings(settings);
      toast.success('Préférences de notifications enregistrées');
    } catch (error) {
      console.error('Failed to save notification settings:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSetting = (key: keyof NotificationSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleBrowserNotificationToggle = async () => {
    if (!('Notification' in window)) {
      toast.error('Votre navigateur ne supporte pas les notifications');
      return;
    }

    if (!settings.browser_notifications) {

      if (browserPermission === 'denied') {
        toast.error('Les notifications ont été bloquées. Activez-les dans les paramètres de votre navigateur.');
        return;
      }

      if (browserPermission === 'default') {
        const permission = await Notification.requestPermission();
        setBrowserPermission(permission);

        if (permission === 'granted') {
          toggleSetting('browser_notifications');

          new Notification('MedicAI', {
            body: 'Les notifications sont maintenant activées !',
            icon: '/favicon.ico',
          });
          toast.success('Notifications activées');
        } else if (permission === 'denied') {
          toast.error('Permission refusée. Vous pouvez modifier ce choix dans les paramètres du navigateur.');
        }
      } else if (browserPermission === 'granted') {
        toggleSetting('browser_notifications');
        toast.success('Notifications activées');
      }
    } else {

      toggleSetting('browser_notifications');
      toast.info('Notifications désactivées');
    }
  };

  const sendTestNotification = () => {
    if (browserPermission !== 'granted') {
      toast.error('Veuillez d\'abord activer les notifications');
      return;
    }

    new Notification('Test MedicAI', {
      body: 'Ceci est une notification de test',
      icon: '/favicon.ico',
      tag: 'test-notification',
    });
    toast.success('Notification de test envoyée');
  };

  if (isFetching) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#111]">Notifications</h1>
          <p className="text-sm text-[#666] mt-0.5">
            Configurez comment et quand vous recevez des notifications.
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
      {}
      <div>
        <h1 className="text-2xl font-bold text-[#111]">Notifications</h1>
        <p className="text-sm text-[#666] mt-0.5">
          Configurez comment et quand vous recevez des notifications.
        </p>
      </div>

      {}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <div className="flex items-center justify-between py-2 border-b border-[#E5E5E5]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[var(--medicai-green-light)] flex items-center justify-center">
              <Mail className="h-5 w-5 text-[var(--medicai-green-dark)]" />
            </div>
            <div>
              <h3 className="font-medium text-[#111]">Email</h3>
              <p className="text-sm text-[#666] mt-0.5">
                Recevez des notifications par email lorsqu'une conversation nécessite votre attention.
              </p>
            </div>
          </div>
          <Switch
            checked={settings.email_notifications}
            onCheckedChange={() => toggleSetting('email_notifications')}
          />
        </div>

        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Monitor className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#111]">Notifications navigateur</h3>
              <p className="text-xs text-[#666] mt-0.5">
                {browserPermission === 'granted'
                  ? 'Activez pour recevoir des alertes sur votre bureau.'
                  : browserPermission === 'denied'
                  ? 'Bloqué - Modifiez dans les paramètres du navigateur'
                  : 'Activez les notifications push pour recevoir des alertes.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {settings.browser_notifications && browserPermission === 'granted' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-[#666]"
                onClick={sendTestNotification}
              >
                Tester
              </Button>
            )}
            <Switch
              checked={settings.browser_notifications}
              onCheckedChange={handleBrowserNotificationToggle}
              disabled={browserPermission === 'denied'}
            />
          </div>
        </div>

        {browserPermission === 'denied' && (
          <div className="mt-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-xs text-yellow-700">
              <BellOff className="h-3 w-3 inline mr-1" />
              Les notifications sont bloquées. Pour les activer, cliquez sur l'icône de cadenas 🔒 dans la barre d'adresse de votre navigateur et autorisez les notifications.
            </p>
          </div>
        )}
      </div>

      {/* Notification Types */}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <div className="uppercase text-[10px] font-semibold text-[#999] tracking-wide mb-2">
          M'avertir quand...
        </div>

        <div className="space-y-0">
          <div className="flex items-center justify-between py-2.5 border-b border-[#E5E5E5]">
            <span className="text-sm text-[#333]">Un nouveau document est reçu</span>
            <Switch
              checked={settings.new_document}
              onCheckedChange={() => toggleSetting('new_document')}
            />
          </div>

          <div className="flex items-center justify-between py-2.5 border-b border-[#E5E5E5]">
            <span className="text-sm text-[#333]">Un document nécessite une révision</span>
            <Switch
              checked={settings.document_review}
              onCheckedChange={() => toggleSetting('document_review')}
            />
          </div>

          <div className="flex items-center justify-between py-2.5 border-b border-[#E5E5E5]">
            <span className="text-sm text-[#333]">Un résultat anormal est détecté</span>
            <Switch
              checked={settings.urgent_alerts}
              onCheckedChange={() => toggleSetting('urgent_alerts')}
            />
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-[#333]">Rappel de consultation à venir</span>
            <Switch
              checked={settings.consultation_reminder}
              onCheckedChange={() => toggleSetting('consultation_reminder')}
            />
          </div>
        </div>
      </div>

      {}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isLoading}
          className="h-9 px-5 bg-black hover:bg-neutral-800 text-white text-sm"
        >
          {isLoading ? 'Enregistrement...' : 'Enregistrer les modifications'}
        </Button>
      </div>
    </div>
  );
}
