'use client';

import { useState } from 'react';
import {
  Pill,
  FlaskConical,
  ScanLine,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Check,
  Pencil,
  Trash2,
  FileText,
  X,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SmartInput } from '@/components/workspace/SmartInput';

import type {
  OrdoItem,
  OrdoMedicationItem,
  OrdoLabItem,
  OrdoImagingItem,
  OrdoProcedureItem,
} from '@/types/ordo';
import {
  validateOrdoItem,
  getOrdoTypeLabel,
  getOrdoGeneratesLabel,
} from '@/types/ordo';

// =============================================================================
// TYPE ICON COMPONENT
// =============================================================================
function OrdoTypeIcon({ type, className }: { type: OrdoItem['type']; className?: string }) {
  const icons = {
    medication: Pill,
    lab: FlaskConical,
    imaging: ScanLine,
    procedure: Stethoscope,
  };
  const Icon = icons[type];
  return <Icon className={cn('h-4 w-4', className)} />;
}

// =============================================================================
// MEDICATION CARD
// =============================================================================
interface MedicationCardProps {
  item: OrdoMedicationItem;
  onChange: (item: OrdoMedicationItem) => void;
  onRemove: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  patientId?: string;
  consultationId?: string;
}

function MedicationCard({ item, onChange, onRemove, isExpanded, onToggleExpand, patientId, consultationId }: MedicationCardProps) {
  const errors = validateOrdoItem(item);
  const hasErrors = errors.length > 0;
  
  const updateField = <K extends keyof OrdoMedicationItem>(
    field: K,
    value: OrdoMedicationItem[K]
  ) => {
    onChange({
      ...item,
      [field]: value,
      updated_at: new Date().toISOString(),
      is_complete: validateOrdoItem({ ...item, [field]: value }).length === 0,
    });
  };

  return (
    <div className={cn(
      'border rounded-lg transition-all',
      hasErrors ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-card',
    )}>
      {/* Header - Always visible */}
      <div 
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
        onClick={onToggleExpand}
      >
        <OrdoTypeIcon type="medication" className="text-[var(--medicai-green)] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {item.drug_name ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{item.drug_name}</span>
              {item.dosage && (
                <span className="text-xs text-muted-foreground">{item.dosage}</span>
              )}
              {item.posology && (
                <span className="text-xs text-muted-foreground">• {item.posology}</span>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground italic">Nouveau médicament...</span>
          )}
        </div>
        {hasErrors && (
          <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
        )}
        <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-[var(--medicai-green-dark)] border-[var(--medicai-green)] flex-shrink-0">
          <FileText className="h-2.5 w-2.5 mr-0.5" />
          Rx
        </Badge>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {/* Expanded Form */}
      {isExpanded && (
        <div className="p-3 pt-0 space-y-3 border-t">
          {/* Drug Name + Dosage Row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">
                Médicament {!item.drug_name && <span className="text-destructive">*</span>}
              </label>
              <SmartInput
                value={item.drug_name}
                onChange={(value) => updateField('drug_name', value)}
                placeholder="Rechercher un médicament..."
                patientId={patientId}
                consultationId={consultationId}
                section="orders"
                showTriggerHints={false}
                disableGhostText={true}
                autoTriggerType="medication"
                containerClassName={cn('border rounded-md', !item.drug_name && 'border-destructive')}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">
                Dosage {!item.dosage && <span className="text-destructive">*</span>}
              </label>
              <Input
                value={item.dosage || ''}
                onChange={(e) => updateField('dosage', e.target.value)}
                placeholder="Ex: 500mg"
                className={cn('h-8 text-sm', !item.dosage && 'border-destructive')}
              />
            </div>
          </div>

          {/* Form + Posology Row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Forme</label>
              <Select
                value={item.form || 'comprimé'}
                onValueChange={(v) => updateField('form', v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comprimé">Comprimé</SelectItem>
                  <SelectItem value="gélule">Gélule</SelectItem>
                  <SelectItem value="sirop">Sirop</SelectItem>
                  <SelectItem value="sachet">Sachet</SelectItem>
                  <SelectItem value="suppositoire">Suppositoire</SelectItem>
                  <SelectItem value="injection">Injection</SelectItem>
                  <SelectItem value="crème">Crème/Pommade</SelectItem>
                  <SelectItem value="gouttes">Gouttes</SelectItem>
                  <SelectItem value="patch">Patch</SelectItem>
                  <SelectItem value="inhalateur">Inhalateur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">
                Posologie {!item.posology && !item.frequency && <span className="text-destructive">*</span>}
              </label>
              <Input
                value={item.posology || ''}
                onChange={(e) => updateField('posology', e.target.value)}
                placeholder="Ex: 1 matin, 1 soir"
                className={cn('h-8 text-sm', !item.posology && !item.frequency && 'border-destructive')}
              />
            </div>
          </div>

          {/* Duration + Quantity Row */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Durée</label>
              <Input
                value={item.duration || ''}
                onChange={(e) => updateField('duration', e.target.value)}
                placeholder="Ex: 7 jours"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Qté (boîtes)</label>
              <Input
                type="number"
                value={item.quantity || ''}
                onChange={(e) => updateField('quantity', parseInt(e.target.value) || undefined)}
                placeholder="1"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Renouv.</label>
              <Input
                type="number"
                value={item.refills || ''}
                onChange={(e) => updateField('refills', parseInt(e.target.value) || undefined)}
                placeholder="0"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Instructions</label>
            <Input
              value={item.instructions || ''}
              onChange={(e) => updateField('instructions', e.target.value)}
              placeholder="Ex: À prendre pendant les repas"
              className="h-8 text-sm"
            />
          </div>

          {/* Substitution + Actions */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`subst-${item.id}`}
                checked={item.substitution_allowed}
                onCheckedChange={(checked) => updateField('substitution_allowed', checked as boolean)}
              />
              <label htmlFor={`subst-${item.id}`} className="text-xs text-muted-foreground">
                Substitution autorisée
              </label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Supprimer
            </Button>
          </div>

          {/* Validation Warnings */}
          {hasErrors && (
            <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <div>{errors.join(' • ')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// LAB CARD
// =============================================================================
interface LabCardProps {
  item: OrdoLabItem;
  onChange: (item: OrdoLabItem) => void;
  onRemove: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  patientId?: string;
  consultationId?: string;
}

function LabCard({ item, onChange, onRemove, isExpanded, onToggleExpand, patientId, consultationId }: LabCardProps) {
  const errors = validateOrdoItem(item);
  const hasErrors = errors.length > 0;
  const [newTest, setNewTest] = useState('');

  const updateField = <K extends keyof OrdoLabItem>(field: K, value: OrdoLabItem[K]) => {
    onChange({
      ...item,
      [field]: value,
      updated_at: new Date().toISOString(),
      is_complete: validateOrdoItem({ ...item, [field]: value }).length === 0,
    });
  };

  const addTest = () => {
    if (!newTest.trim()) return;
    updateField('tests', [...item.tests, { name: newTest.trim() }]);
    setNewTest('');
  };

  const removeTest = (index: number) => {
    updateField('tests', item.tests.filter((_, i) => i !== index));
  };

  return (
    <div className={cn(
      'border rounded-lg transition-all',
      hasErrors ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-card',
    )}>
      {/* Header */}
      <div 
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
        onClick={onToggleExpand}
      >
        <OrdoTypeIcon type="lab" className="text-[var(--medicai-green-dark)] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {item.panel_name || item.tests.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">
                {item.panel_name || item.tests.map(t => t.name).join(', ')}
              </span>
              {item.fasting_required && (
                <Badge variant="outline" className="text-[9px] h-4 px-1">À jeun</Badge>
              )}
              {item.urgency === 'urgent' && (
                <Badge variant="destructive" className="text-[9px] h-4 px-1">Urgent</Badge>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground italic">Nouveau bilan...</span>
          )}
        </div>
        {hasErrors && <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
        <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-[var(--medicai-green-dark)] border-[var(--medicai-green)] flex-shrink-0">
          <FileText className="h-2.5 w-2.5 mr-0.5" />
          Labo
        </Badge>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {/* Expanded Form */}
      {isExpanded && (
        <div className="p-3 pt-0 space-y-3 border-t">
          {/* Panel Name */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">
              Nom du bilan
            </label>
            <Input
              value={item.panel_name || ''}
              onChange={(e) => updateField('panel_name', e.target.value)}
              placeholder="Ex: Bilan lipidique"
              className="h-8 text-sm"
            />
          </div>

          {/* Tests List */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">
              Tests {item.tests.length === 0 && <span className="text-destructive">*</span>}
            </label>
            <div className="space-y-1 mt-1">
              {item.tests.map((test, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{test.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => removeTest(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <SmartInput
                  value={newTest}
                  onChange={(value) => setNewTest(value)}
                  placeholder="Rechercher un test..."
                  patientId={patientId}
                  consultationId={consultationId}
                  section="orders"
                  showTriggerHints={false}
                  disableGhostText={true}
                  autoTriggerType="lab"
                  onKeyDown={(e) => e.key === 'Enter' && addTest()}
                  containerClassName="flex-1 border rounded-md"
                />
                <Button variant="outline" size="sm" className="h-7" onClick={addTest}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Clinical Indication */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">
              Indication clinique {!item.clinical_indication && <span className="text-destructive">*</span>}
            </label>
            <Input
              value={item.clinical_indication}
              onChange={(e) => updateField('clinical_indication', e.target.value)}
              placeholder="Ex: Suivi dyslipidémie"
              className={cn('h-8 text-sm', !item.clinical_indication && 'border-destructive')}
            />
          </div>

          {/* Options Row */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`fasting-${item.id}`}
                checked={item.fasting_required}
                onCheckedChange={(checked) => updateField('fasting_required', checked as boolean)}
              />
              <label htmlFor={`fasting-${item.id}`} className="text-xs text-muted-foreground">
                À jeun
              </label>
            </div>
            <Select
              value={item.urgency}
              onValueChange={(v) => updateField('urgency', v as OrdoLabItem['urgency'])}
            >
              <SelectTrigger className="h-7 text-xs w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex justify-end pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Supprimer
            </Button>
          </div>

          {/* Validation Warnings */}
          {hasErrors && (
            <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <div>{errors.join(' • ')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// IMAGING CARD
// =============================================================================
interface ImagingCardProps {
  item: OrdoImagingItem;
  onChange: (item: OrdoImagingItem) => void;
  onRemove: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  patientId?: string;
  consultationId?: string;
}

function ImagingCard({ item, onChange, onRemove, isExpanded, onToggleExpand, patientId, consultationId }: ImagingCardProps) {
  const errors = validateOrdoItem(item);
  const hasErrors = errors.length > 0;

  const updateField = <K extends keyof OrdoImagingItem>(field: K, value: OrdoImagingItem[K]) => {
    onChange({
      ...item,
      [field]: value,
      updated_at: new Date().toISOString(),
      is_complete: validateOrdoItem({ ...item, [field]: value }).length === 0,
    });
  };

  const modalityOptions = [
    { value: 'xray', label: 'Radiographie' },
    { value: 'ultrasound', label: 'Échographie' },
    { value: 'ct', label: 'Scanner (TDM)' },
    { value: 'mri', label: 'IRM' },
    { value: 'mammography', label: 'Mammographie' },
    { value: 'dexa', label: 'Ostéodensitométrie (DEXA)' },
    { value: 'other', label: 'Autre' },
  ];

  return (
    <div className={cn(
      'border rounded-lg transition-all',
      hasErrors ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-card',
    )}>
      {/* Header */}
      <div 
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
        onClick={onToggleExpand}
      >
        <OrdoTypeIcon type="imaging" className="text-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {item.modality_label && item.body_region ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">
                {item.modality_label} - {item.body_region}
              </span>
              {item.contrast_required && (
                <Badge variant="outline" className="text-[9px] h-4 px-1">+ Contraste</Badge>
              )}
              {item.urgency === 'urgent' && (
                <Badge variant="destructive" className="text-[9px] h-4 px-1">Urgent</Badge>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground italic">Nouvel examen d'imagerie...</span>
          )}
        </div>
        {hasErrors && <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
        <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-foreground border-border flex-shrink-0">
          <FileText className="h-2.5 w-2.5 mr-0.5" />
          Imagerie
        </Badge>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {/* Expanded Form */}
      {isExpanded && (
        <div className="p-3 pt-0 space-y-3 border-t">
          {/* Modality + Region Row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Modalité</label>
              <Select
                value={item.modality}
                onValueChange={(v) => {
                  const opt = modalityOptions.find(o => o.value === v);
                  updateField('modality', v as OrdoImagingItem['modality']);
                  if (opt) updateField('modality_label', opt.label);
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modalityOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">
                Région {!item.body_region && <span className="text-destructive">*</span>}
              </label>
              <SmartInput
                value={item.body_region}
                onChange={(value) => updateField('body_region', value)}
                placeholder="Rechercher une région..."
                patientId={patientId}
                consultationId={consultationId}
                section="orders"
                showTriggerHints={false}
                disableGhostText={true}
                autoTriggerType="order"
                containerClassName={cn('border rounded-md', !item.body_region && 'border-destructive')}
              />
            </div>
          </div>

          {/* Clinical Indication */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">
              Indication clinique {!item.clinical_indication && <span className="text-destructive">*</span>}
            </label>
            <Input
              value={item.clinical_indication}
              onChange={(e) => updateField('clinical_indication', e.target.value)}
              placeholder="Ex: Douleur abdominale à explorer"
              className={cn('h-8 text-sm', !item.clinical_indication && 'border-destructive')}
            />
          </div>

          {/* Options Row */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`contrast-${item.id}`}
                checked={item.contrast_required || false}
                onCheckedChange={(checked) => updateField('contrast_required', checked as boolean)}
              />
              <label htmlFor={`contrast-${item.id}`} className="text-xs text-muted-foreground">
                Injection de contraste
              </label>
            </div>
            <Select
              value={item.urgency}
              onValueChange={(v) => updateField('urgency', v as OrdoImagingItem['urgency'])}
            >
              <SelectTrigger className="h-7 text-xs w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex justify-end pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Supprimer
            </Button>
          </div>

          {/* Validation Warnings */}
          {hasErrors && (
            <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <div>{errors.join(' • ')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PROCEDURE CARD
// =============================================================================
interface ProcedureCardProps {
  item: OrdoProcedureItem;
  onChange: (item: OrdoProcedureItem) => void;
  onRemove: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  patientId?: string;
  consultationId?: string;
}

function ProcedureCard({ item, onChange, onRemove, isExpanded, onToggleExpand, patientId, consultationId }: ProcedureCardProps) {
  const errors = validateOrdoItem(item);
  const hasErrors = errors.length > 0;

  const updateField = <K extends keyof OrdoProcedureItem>(field: K, value: OrdoProcedureItem[K]) => {
    onChange({
      ...item,
      [field]: value,
      updated_at: new Date().toISOString(),
      is_complete: validateOrdoItem({ ...item, [field]: value }).length === 0,
    });
  };

  return (
    <div className={cn(
      'border rounded-lg transition-all',
      hasErrors ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-card',
    )}>
      {/* Header */}
      <div 
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
        onClick={onToggleExpand}
      >
        <OrdoTypeIcon type="procedure" className="text-[var(--medicai-green)] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {item.procedure_name ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{item.procedure_name}</span>
              {item.specialist_type && (
                <span className="text-xs text-muted-foreground">→ {item.specialist_type}</span>
              )}
              {item.urgency === 'urgent' && (
                <Badge variant="destructive" className="text-[9px] h-4 px-1">Urgent</Badge>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground italic">Nouvelle procédure...</span>
          )}
        </div>
        {hasErrors && <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
        <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-[var(--medicai-green-dark)] border-[var(--medicai-green)] flex-shrink-0">
          <FileText className="h-2.5 w-2.5 mr-0.5" />
          {item.procedure_type === 'referral' ? 'Réf.' : 
           item.procedure_type === 'consent' ? 'Consent.' : 'Acte'}
        </Badge>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {/* Expanded Form */}
      {isExpanded && (
        <div className="p-3 pt-0 space-y-3 border-t">
          {/* Procedure Name + Type Row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">
                Procédure {!item.procedure_name && <span className="text-destructive">*</span>}
              </label>
              <SmartInput
                value={item.procedure_name}
                onChange={(value) => updateField('procedure_name', value)}
                placeholder="Rechercher une procédure..."
                patientId={patientId}
                consultationId={consultationId}
                section="orders"
                showTriggerHints={false}
                disableGhostText={true}
                autoTriggerType="order"
                containerClassName={cn('border rounded-md', !item.procedure_name && 'border-destructive')}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Type</label>
              <Select
                value={item.procedure_type}
                onValueChange={(v) => updateField('procedure_type', v as OrdoProcedureItem['procedure_type'])}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="referral">Référence / Consultation</SelectItem>
                  <SelectItem value="minor_procedure">Acte mineur</SelectItem>
                  <SelectItem value="scheduling">Planification RDV</SelectItem>
                  <SelectItem value="consent">Consentement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Specialist */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">
              Spécialiste / Destinataire
            </label>
            <Input
              value={item.specialist_type || ''}
              onChange={(e) => updateField('specialist_type', e.target.value)}
              placeholder="Ex: Cardiologue, Dr. Martin"
              className="h-8 text-sm"
            />
          </div>

          {/* Indication */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">
              Indication {!item.indication && <span className="text-destructive">*</span>}
            </label>
            <Input
              value={item.indication}
              onChange={(e) => updateField('indication', e.target.value)}
              placeholder="Ex: Bilan pour HTA résistante"
              className={cn('h-8 text-sm', !item.indication && 'border-destructive')}
            />
          </div>

          {/* Options Row */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`consent-${item.id}`}
                checked={item.requires_consent}
                onCheckedChange={(checked) => updateField('requires_consent', checked as boolean)}
              />
              <label htmlFor={`consent-${item.id}`} className="text-xs text-muted-foreground">
                Nécessite consentement
              </label>
            </div>
            <Select
              value={item.urgency}
              onValueChange={(v) => updateField('urgency', v as OrdoProcedureItem['urgency'])}
            >
              <SelectTrigger className="h-7 text-xs w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex justify-end pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Supprimer
            </Button>
          </div>

          {/* Validation Warnings */}
          {hasErrors && (
            <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <div>{errors.join(' • ')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN ORDO ITEM CARD (ROUTER)
// =============================================================================
interface OrdoItemCardProps {
  item: OrdoItem;
  onChange: (item: OrdoItem) => void;
  onRemove: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  patientId?: string;
  consultationId?: string;
}

export function OrdoItemCard({ 
  item, 
  onChange, 
  onRemove,
  isExpanded: controlledExpanded,
  onToggleExpand: controlledToggle,
  patientId,
  consultationId,
}: OrdoItemCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;
  const onToggleExpand = controlledToggle ?? (() => setInternalExpanded(!internalExpanded));

  switch (item.type) {
    case 'medication':
      return (
        <MedicationCard
          item={item}
          onChange={(updated) => onChange(updated)}
          onRemove={onRemove}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          patientId={patientId}
          consultationId={consultationId}
        />
      );
    case 'lab':
      return (
        <LabCard
          item={item}
          onChange={(updated) => onChange(updated)}
          onRemove={onRemove}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          patientId={patientId}
          consultationId={consultationId}
        />
      );
    case 'imaging':
      return (
        <ImagingCard
          item={item}
          onChange={(updated) => onChange(updated)}
          onRemove={onRemove}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          patientId={patientId}
          consultationId={consultationId}
        />
      );
    case 'procedure':
      return (
        <ProcedureCard
          item={item}
          onChange={(updated) => onChange(updated)}
          onRemove={onRemove}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          patientId={patientId}
          consultationId={consultationId}
        />
      );
  }
}

export { OrdoTypeIcon };
