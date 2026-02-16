'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Download, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { settingsApi } from '@/lib/api/settings';

export default function PrivacyPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isSavingRetention, setIsSavingRetention] = useState(false);
  const [isSavingConsent, setIsSavingConsent] = useState(false);
  const [retentionPolicy, setRetentionPolicy] = useState('forever');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [consentText, setConsentText] = useState(
    'Je soussigné(e), autorise le Dr. [NOM] à collecter et traiter mes données médicales...'
  );

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsFetching(true);
      const data = await settingsApi.getPrivacySettings();
      setRetentionPolicy(data.retention_policy || 'forever');
      setConsentText(data.consent_template || 'Je soussigné(e), autorise le Dr. [NOM] à collecter et traiter mes données médicales...');
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await settingsApi.requestDataExport();
      toast.success('Export démarré. Email envoyé avec le lien.');
    } catch (error) {
      console.error('Failed to request export:', error);
      toast.error('Erreur lors de la demande d\'export');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveRetention = async () => {
    setIsSavingRetention(true);
    try {
      await settingsApi.updatePrivacySettings({ retention_policy: retentionPolicy });
      toast.success('Politique de conservation mise à jour');
    } catch (error) {
      console.error('Failed to save retention policy:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSavingRetention(false);
    }
  };

  const handleSaveConsent = async () => {
    setIsSavingConsent(true);
    try {
      await settingsApi.updatePrivacySettings({ consent_template: consentText });
      toast.success('Texte de consentement enregistré');
    } catch (error) {
      console.error('Failed to save consent template:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSavingConsent(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'SUPPRIMER MON COMPTE') {
      toast.error('Phrase de confirmation incorrecte');
      return;
    }
    try {
      await settingsApi.requestAccountDeletion();
      toast.success('Demande de suppression envoyée');
      setDeleteConfirmation('');
    } catch (error) {
      console.error('Failed to request account deletion:', error);
      toast.error('Erreur lors de la demande de suppression');
    }
  };

  if (isFetching) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#111]">Données & Confidentialité</h1>
          <p className="text-sm text-[#666] mt-0.5">
            Gérez vos données, exportations et paramètres de confidentialité.
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
        <h1 className="text-2xl font-bold text-[#111]">Données & Confidentialité</h1>
        <p className="text-sm text-[#666] mt-0.5">
          Gérez vos données, exportations et paramètres de confidentialité.
        </p>
      </div>

      {/* Export Data */}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <div className="uppercase text-[10px] font-semibold text-[#999] tracking-wide mb-2">
          Exporter vos données
        </div>
        
        <p className="text-xs text-[#666] mb-3">
          Téléchargez une copie de toutes vos données : patients, consultations, documents PDF, données extraites et modèles.
        </p>
        
        <div className="flex items-center gap-3">
          <Button 
            onClick={handleExport} 
            disabled={isExporting}
            className="h-9 text-sm bg-black hover:bg-neutral-800"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Préparation...' : 'Exporter tout (ZIP)'}
          </Button>
          <span className="text-sm text-[#999]">Format: CSV + PDF</span>
        </div>
      </div>

      {/* Data Retention */}
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
        <div className="uppercase text-[10px] font-semibold text-[#999] tracking-wide mb-3">
          Conservation des données
        </div>
        
        <RadioGroup value={retentionPolicy} onValueChange={setRetentionPolicy} className="space-y-0">
          {[
            { value: 'forever', label: 'Conservation illimitée', desc: 'Les données sont conservées jusqu\'\u00e0 suppression manuelle' },
            { value: '10years', label: '10 ans', desc: 'Durée recommandée légalement pour les dossiers médicaux' },
            { value: '5years', label: '5 ans', desc: 'Suppression automatique après 5 ans d\'inactivité' },
          ].map((option, index) => (
            <div
              key={option.value}
              className={`flex items-start gap-2 py-2.5 ${
                index < 2 ? 'border-b border-[#E5E5E5]' : ''
              }`}
            >
              <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
              <div className="flex-1">
                <label htmlFor={option.value} className="text-sm font-medium text-[#333] cursor-pointer">
                  {option.label}
                </label>
                <p className="text-sm text-[#999] mt-0.5">{option.desc}</p>
              </div>
            </div>
          ))}
        </RadioGroup>
        
        <div className="flex justify-end mt-4">
          <Button 
            onClick={handleSaveRetention}
            disabled={isSavingRetention}
            variant="outline"
            className="h-9 border-[var(--medicai-green)] text-[var(--medicai-green-dark)] hover:bg-[var(--medicai-green-light)]"
          >
            {isSavingRetention ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      {/* Consent Template */}
      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6">
        <div className="uppercase text-[11px] font-semibold text-[#999] tracking-wide mb-4">
          Modèle de consentement
        </div>
        
        <p className="text-sm text-[#666] mb-3">
          Ce texte sera présenté aux patients lors de leur première visite. Utilisez [NOM] pour le nom du médecin.
        </p>
        
        <Textarea
          value={consentText}
          onChange={(e) => setConsentText(e.target.value)}
          rows={4}
          className="border-[#E5E5E5] mb-4"
        />
        
        <div className="flex justify-end">
          <Button 
            onClick={handleSaveConsent}
            disabled={isSavingConsent}
            variant="outline"
            className="h-9 border-[var(--medicai-green)] text-[var(--medicai-green-dark)] hover:bg-[var(--medicai-green-light)]"
          >
            {isSavingConsent ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      {/* Delete Account */}
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <div className="uppercase text-[11px] font-semibold text-red-500 tracking-wide mb-4">
          Zone de danger
        </div>
        
        <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg mb-4">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">Action irréversible</p>
            <p className="text-sm text-red-600 mt-1">
              La suppression de votre compte entraînera la perte définitive de tous vos patients, consultations, documents et configurations.
            </p>
          </div>
        </div>
        
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="h-10">
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer mon compte
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous sûr de vouloir supprimer votre compte ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Toutes vos données seront définitivement supprimées.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <label className="text-sm font-medium text-[#333]">
                Pour confirmer, tapez <strong>SUPPRIMER MON COMPTE</strong>
              </label>
              <Input
                className="mt-2 h-10 border-[#E5E5E5]"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="SUPPRIMER MON COMPTE"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteConfirmation('')}>
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                className="bg-red-600 hover:bg-red-700"
              >
                Supprimer définitivement
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
