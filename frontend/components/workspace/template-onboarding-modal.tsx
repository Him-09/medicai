'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  Settings,
  Check,
  Pill,
  User,
  Calendar,
  FileText,
} from 'lucide-react';

import {
  prescriptionTemplates,
  referralTemplates,
  followupTemplates,
  visitNoteTemplates,
  getDefaultTemplate,
} from '@/types/default-templates';

interface TemplateOnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (settings: OnboardingResult) => void;
  specialty?: string;
}

interface OnboardingResult {
  useDefaults: boolean;
  selectedTemplates?: {
    prescription?: string;
    referral?: string;
    followup?: string;
    visit_note?: string;
  };
  defaultSpecialty?: string;
  saveAsDefault: boolean;
}

interface TemplateCardProps {
  type: 'prescription' | 'referral' | 'followup' | 'visit_note';
  template: {
    id: string;
    name: string;
    description?: string;
    preview?: string;
  };
  selected: boolean;
  onSelect: () => void;
}

function TemplateCard({ type, template, selected, onSelect }: TemplateCardProps) {
  const icons = {
    prescription: <Pill className="h-4 w-4" />,
    referral: <User className="h-4 w-4" />,
    followup: <Calendar className="h-4 w-4" />,
    visit_note: <FileText className="h-4 w-4" />,
  };

  const colors = {
    prescription: 'bg-muted/50 border-border hover:border-[var(--medicai-green)]',
    referral: 'bg-muted/50 border-border hover:border-[var(--medicai-green)]',
    followup: 'bg-muted/50 border-border hover:border-[var(--medicai-green)]',
    visit_note: 'bg-muted/50 border-border hover:border-[var(--medicai-green)]',
  };

  const selectedColors = {
    prescription: 'border-[var(--medicai-green)] bg-[var(--medicai-green-light)]',
    referral: 'border-[var(--medicai-green)] bg-[var(--medicai-green-light)]',
    followup: 'border-[var(--medicai-green)] bg-[var(--medicai-green-light)]',
    visit_note: 'border-[var(--medicai-green)] bg-[var(--medicai-green-light)]',
  };

  return (
    <div
      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
        selected ? selectedColors[type] : colors[type]
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {icons[type]}
          <span className="font-medium text-sm">{template.name}</span>
        </div>
        {selected && (
          <div className="p-0.5 rounded-full bg-green-500 text-white">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>
      {template.description && (
        <p className="text-xs text-muted-foreground">{template.description}</p>
      )}
    </div>
  );
}

export function TemplateOnboardingModal({
  open,
  onOpenChange,
  onComplete,
  specialty,
}: TemplateOnboardingModalProps) {
  const [step, setStep] = useState<'choice' | 'customize'>('choice');
  const [selectedSpecialty, setSelectedSpecialty] = useState(specialty || 'general');
  const [saveAsDefault, setSaveAsDefault] = useState(true);

  const [selectedTemplates, setSelectedTemplates] = useState<{
    prescription: string;
    referral: string;
    followup: string;
    visit_note: string;
  }>({
    prescription: prescriptionTemplates[0]?.id || '',
    referral: referralTemplates[0]?.id || '',
    followup: followupTemplates[0]?.id || '',
    visit_note: visitNoteTemplates[0]?.id || '',
  });

  const handleUseDefaults = () => {
    onComplete({
      useDefaults: true,
      saveAsDefault,
    });
    onOpenChange(false);
  };

  const handleCustomize = () => {
    setStep('customize');
  };

  const handleFinishCustomization = () => {
    onComplete({
      useDefaults: false,
      selectedTemplates,
      defaultSpecialty: selectedSpecialty,
      saveAsDefault,
    });
    onOpenChange(false);
  };

  const selectTemplate = (type: keyof typeof selectedTemplates, id: string) => {
    setSelectedTemplates(prev => ({ ...prev, [type]: id }));
  };

  if (step === 'choice') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Configuration des modèles
            </DialogTitle>
            <DialogDescription>
              MedicAI propose des modèles par défaut pour vos ordonnances, lettres de référence et plans de suivi.
              Vous pouvez les utiliser directement ou les personnaliser.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {}
            <div
              className="p-4 rounded-lg border-2 border-primary bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={handleUseDefaults}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Utiliser les modèles MedicAI</h3>
                  <p className="text-sm text-muted-foreground">
                    Modèles professionnels prêts à l'emploi, optimisés pour la pratique médicale au Maroc
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Badge variant="secondary" className="text-[10px]">Ordonnances</Badge>
                <Badge variant="secondary" className="text-[10px]">Références</Badge>
                <Badge variant="secondary" className="text-[10px]">Plans de suivi</Badge>
                <Badge variant="secondary" className="text-[10px]">Notes de visite</Badge>
              </div>
            </div>

            {/* Option 2: Customize */}
            <div
              className="p-4 rounded-lg border-2 border-muted cursor-pointer hover:border-primary/50 transition-colors"
              onClick={handleCustomize}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-muted">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Personnaliser les modèles</h3>
                  <p className="text-sm text-muted-foreground">
                    Choisir et configurer vos propres modèles
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <div className="flex items-center gap-2 w-full">
              <Checkbox
                id="save-default"
                checked={saveAsDefault}
                onCheckedChange={(checked) => setSaveAsDefault(!!checked)}
              />
              <label htmlFor="save-default" className="text-sm text-muted-foreground">
                Définir comme mes paramètres par défaut
              </label>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Customize step
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Personnaliser les modèles
          </DialogTitle>
          <DialogDescription>
            Sélectionnez les modèles que vous souhaitez utiliser pour chaque type de document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Specialty Selection */}
          <div>
            <label className="text-sm font-medium">Spécialité</label>
            <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Médecine Générale</SelectItem>
                <SelectItem value="cardiology">Cardiologie</SelectItem>
                <SelectItem value="dermatology">Dermatologie</SelectItem>
                <SelectItem value="pediatrics">Pédiatrie</SelectItem>
                <SelectItem value="gynecology">Gynécologie</SelectItem>
                <SelectItem value="internal_medicine">Médecine Interne</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Prescription Templates */}
          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Pill className="h-4 w-4" />
              Ordonnances
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {prescriptionTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  type="prescription"
                  template={template}
                  selected={selectedTemplates.prescription === template.id}
                  onSelect={() => selectTemplate('prescription', template.id)}
                />
              ))}
            </div>
          </div>

          {/* Referral Templates */}
          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <User className="h-4 w-4" />
              Lettres de référence
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {referralTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  type="referral"
                  template={template}
                  selected={selectedTemplates.referral === template.id}
                  onSelect={() => selectTemplate('referral', template.id)}
                />
              ))}
            </div>
          </div>

          {/* Followup Templates */}
          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Plans de suivi
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {followupTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  type="followup"
                  template={template}
                  selected={selectedTemplates.followup === template.id}
                  onSelect={() => selectTemplate('followup', template.id)}
                />
              ))}
            </div>
          </div>

          {/* Visit Note Templates */}
          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes de visite
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {visitNoteTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  type="visit_note"
                  template={template}
                  selected={selectedTemplates.visit_note === template.id}
                  onSelect={() => selectTemplate('visit_note', template.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Checkbox
              id="save-default-2"
              checked={saveAsDefault}
              onCheckedChange={(checked) => setSaveAsDefault(!!checked)}
            />
            <label htmlFor="save-default-2" className="text-sm text-muted-foreground">
              Définir comme mes paramètres par défaut
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('choice')}>
              Retour
            </Button>
            <Button onClick={handleFinishCustomization}>
              Confirmer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TemplateOnboardingModal;
