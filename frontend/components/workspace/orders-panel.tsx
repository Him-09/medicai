'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Pill,
  User,
  Calendar,
  Plus,
  FileText,
  Send,
  Eye,
  Pencil,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Printer,
  Mail,
  MessageSquare,
  Trash2,
  Copy,
  RotateCcw,
  Sparkles,
  Layout,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { SmartInput } from '@/components/workspace/SmartInput';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useTemplates } from '@/lib/hooks';
import type { Template } from '@/lib/api/settings';

import type {
  RxIntent,
  ReferralIntent,
  FollowupIntent,
  MedicationItem,
  GeneratedDocument,
  WorkspaceOrders,
} from '@/types/orders';
import {
  createRxIntent,
  createReferralIntent,
  createFollowupIntent,
} from '@/types/orders';

// =============================================================================
// TYPES
// =============================================================================
type OrderTab = 'rx' | 'referral' | 'followup';

interface OrdersPanelProps {
  patientId: string;
  patientName: string;
  consultationId: string;
  problems: Array<{ id: string; title: string; assessment?: string }>;
  orders: WorkspaceOrders;
  onOrdersChange: (orders: WorkspaceOrders) => void;
  patientContact?: {
    email?: string;
    email_verified?: boolean;
    phone?: string;
    phone_verified?: boolean;
    whatsapp_enabled?: boolean;
  };
}

// =============================================================================
// STATUS HELPERS
// =============================================================================
const getStatusBadge = (status: GeneratedDocument['status']) => {
  const statusConfig = {
    draft: { label: 'Brouillon', className: 'bg-muted text-muted-foreground' },
    reviewed: { label: 'Relu', className: 'bg-[var(--medicai-green-light)] text-foreground' },
    signed: { label: 'Signé', className: 'bg-[var(--medicai-green)] text-foreground' },
    sent: { label: 'Envoyé', className: 'bg-[var(--medicai-green-dark)] text-foreground' },
    delivered: { label: 'Délivré', className: 'bg-[var(--medicai-green)] text-foreground' },
    failed: { label: 'Échec', className: 'bg-destructive/10 text-destructive' },
  };
  const config = statusConfig[status] || statusConfig.draft;
  return <Badge className={`text-[10px] ${config.className}`}>{config.label}</Badge>;
};

// =============================================================================
// RX INTENT FORM
// =============================================================================
interface RxIntentFormProps {
  intent: RxIntent;
  onChange: (intent: RxIntent) => void;
  onGenerate: () => void;
  isGenerating?: boolean;
  templates?: Template[];
  selectedTemplateId?: string;
  onTemplateSelect?: (templateId: string | undefined) => void;
  patientId?: string;
  consultationId?: string;
}

function RxIntentForm({ intent, onChange, onGenerate, isGenerating, templates, selectedTemplateId, onTemplateSelect, patientId, consultationId }: RxIntentFormProps) {
  const [newMedName, setNewMedName] = useState('');
  const prescriptionTemplates = templates?.filter(t => t.type === 'ordonnance') || [];
  
  const addMedication = () => {
    if (!newMedName.trim()) return;
    const newMed: MedicationItem = {
      id: crypto.randomUUID(),
      name: newMedName.trim(),
      dosage: '',
      form: 'comprimé',
      frequency: '1x/jour',
      duration: '7 jours',
    };
    onChange({
      ...intent,
      medications: [...intent.medications, newMed],
      updated_at: new Date().toISOString(),
    });
    setNewMedName('');
  };
  
  const updateMedication = (id: string, updates: Partial<MedicationItem>) => {
    onChange({
      ...intent,
      medications: intent.medications.map(m => 
        m.id === id ? { ...m, ...updates } : m
      ),
      updated_at: new Date().toISOString(),
    });
  };
  
  const removeMedication = (id: string) => {
    onChange({
      ...intent,
      medications: intent.medications.filter(m => m.id !== id),
      updated_at: new Date().toISOString(),
    });
  };
  
  return (
    <div className="space-y-4">
      {/* Medications List */}
      <div className="space-y-2">
        {intent.medications.map((med, idx) => (
          <div key={med.id} className="p-3 border rounded-lg bg-white space-y-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm font-medium text-muted-foreground">{idx + 1}.</span>
                <SmartInput
                  value={med.name}
                  onChange={(value) => updateMedication(med.id, { name: value })}
                  placeholder="Rechercher un médicament..."
                  patientId={patientId}
                  consultationId={consultationId}
                  section="orders"
                  containerClassName="flex-1 min-w-0 border rounded-md"
                  className="font-medium"
                  showTriggerHints={false}
                  disableGhostText={true}
                  autoTriggerType="medication"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                onClick={() => removeMedication(med.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Input
                value={med.dosage}
                onChange={(e) => updateMedication(med.id, { dosage: e.target.value })}
                placeholder="Dosage"
                className="h-7 text-xs"
              />
              <Select
                value={med.form}
                onValueChange={(value) => updateMedication(med.id, { form: value })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comprimé">Comprimé</SelectItem>
                  <SelectItem value="gélule">Gélule</SelectItem>
                  <SelectItem value="sirop">Sirop</SelectItem>
                  <SelectItem value="injection">Injection</SelectItem>
                  <SelectItem value="pommade">Pommade</SelectItem>
                  <SelectItem value="gouttes">Gouttes</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={med.frequency}
                onChange={(e) => updateMedication(med.id, { frequency: e.target.value })}
                placeholder="Fréquence"
                className="h-7 text-xs"
              />
              <Input
                value={med.duration}
                onChange={(e) => updateMedication(med.id, { duration: e.target.value })}
                placeholder="Durée"
                className="h-7 text-xs"
              />
            </div>
            <Input
              value={med.instructions || ''}
              onChange={(e) => updateMedication(med.id, { instructions: e.target.value })}
              placeholder="Instructions spécifiques (optionnel)"
              className="h-7 text-xs"
            />
          </div>
        ))}
      </div>
      
      {/* Add Medication */}
      <div className="flex gap-2">
        <SmartInput
          value={newMedName}
          onChange={(value) => setNewMedName(value)}
          placeholder="Ajouter un médicament..."
          patientId={patientId}
          consultationId={consultationId}
          section="orders"
          showTriggerHints={false}
          disableGhostText={true}
          autoTriggerType="medication"
          containerClassName="flex-1 border rounded-md"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newMedName.trim()) {
              e.preventDefault();
              addMedication();
            }
          }}
        />
        <Button variant="outline" size="sm" onClick={addMedication} disabled={!newMedName.trim()}>
          <Plus className="h-3 w-3 mr-1" />
          Ajouter
        </Button>
      </div>
      
      {/* General Instructions */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Instructions générales</label>
        <Textarea
          value={intent.general_instructions || ''}
          onChange={(e) => onChange({ ...intent, general_instructions: e.target.value })}
          placeholder="Instructions pour le patient..."
          className="mt-1 min-h-[60px] text-sm"
        />
      </div>
      
      {/* Options */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={intent.renewable}
            onCheckedChange={(checked) => onChange({ ...intent, renewable: !!checked })}
          />
          Renouvelable
        </label>
      </div>
      
      {/* Template Selector */}
      {prescriptionTemplates.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Layout className="h-3 w-3" />
            Modèle (optionnel)
          </label>
          <Select
            value={selectedTemplateId || ''}
            onValueChange={(value) => onTemplateSelect?.(value || undefined)}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="Sélectionner un modèle..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Aucun modèle</SelectItem>
              {prescriptionTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTemplateId && (
            <p className="text-xs text-muted-foreground mt-1">
              Le modèle sera utilisé pour la mise en forme du document
            </p>
          )}
        </div>
      )}
      
      {/* Generate Button */}
      <div className="flex justify-end pt-2">
        <Button 
          onClick={onGenerate}
          disabled={intent.medications.length === 0 || isGenerating}
          className="bg-black hover:bg-neutral-800"
        >
          {isGenerating ? (
            <>Génération...</>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Générer l'ordonnance
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// REFERRAL INTENT FORM
// =============================================================================
interface ReferralIntentFormProps {
  intent: ReferralIntent;
  onChange: (intent: ReferralIntent) => void;
  onGenerate: () => void;
  isGenerating?: boolean;
  templates?: Template[];
  selectedTemplateId?: string;
  onTemplateSelect?: (templateId: string | undefined) => void;
  patientId?: string;
  consultationId?: string;
}

function ReferralIntentForm({ intent, onChange, onGenerate, isGenerating, templates, selectedTemplateId, onTemplateSelect, patientId, consultationId }: ReferralIntentFormProps) {
  const referralTemplates = templates?.filter(t => t.type === 'lettre') || [];
  
  return (
    <div className="space-y-4">
      {/* Specialty & Provider */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Spécialité *</label>
          <SmartInput
            value={intent.to_specialty}
            onChange={(value) => onChange({ ...intent, to_specialty: value })}
            placeholder="Rechercher une spécialité..."
            patientId={patientId}
            consultationId={consultationId}
            section="orders"
            showTriggerHints={false}
            disableGhostText={true}
            autoTriggerType="order"
            containerClassName="mt-1 border rounded-md"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Médecin (optionnel)</label>
          <Input
            value={intent.to_provider_name || ''}
            onChange={(e) => onChange({ ...intent, to_provider_name: e.target.value })}
            placeholder="Dr. ..."
            className="mt-1 h-9"
          />
        </div>
      </div>
      
      {/* Urgency */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Urgence</label>
        <Select
          value={intent.urgency}
          onValueChange={(value: 'routine' | 'urgent' | 'emergency') => onChange({ ...intent, urgency: value })}
        >
          <SelectTrigger className="mt-1 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="routine">Routine</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="emergency">Urgence vitale</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Reason */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Motif de la référence *</label>
        <Textarea
          value={intent.reason}
          onChange={(e) => onChange({ ...intent, reason: e.target.value })}
          placeholder="Pourquoi référez-vous ce patient?"
          className="mt-1 min-h-[60px] text-sm"
        />
      </div>
      
      {/* Clinical Summary */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Résumé clinique</label>
        <Textarea
          value={intent.clinical_summary}
          onChange={(e) => onChange({ ...intent, clinical_summary: e.target.value })}
          placeholder="Résumé pertinent pour le spécialiste..."
          className="mt-1 min-h-[80px] text-sm"
        />
      </div>
      
      {/* Questions */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Questions pour le spécialiste</label>
        <Textarea
          value={(intent.questions_for_specialist || []).join('\n')}
          onChange={(e) => onChange({ 
            ...intent, 
            questions_for_specialist: e.target.value.split('\n').filter(q => q.trim()) 
          })}
          placeholder="Une question par ligne..."
          className="mt-1 min-h-[60px] text-sm"
        />
      </div>
      
      {/* Template Selector */}
      {referralTemplates.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Layout className="h-3 w-3" />
            Modèle de lettre (optionnel)
          </label>
          <Select
            value={selectedTemplateId || ''}
            onValueChange={(value) => onTemplateSelect?.(value || undefined)}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="Sélectionner un modèle..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Aucun modèle</SelectItem>
              {referralTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {/* Generate Button */}
      <div className="flex justify-end pt-2">
        <Button 
          onClick={onGenerate}
          disabled={!intent.to_specialty || !intent.reason || isGenerating}
          className="bg-black hover:bg-neutral-800"
        >
          {isGenerating ? (
            <>Génération...</>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Générer la lettre
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// FOLLOW-UP INTENT FORM
// =============================================================================
interface FollowupIntentFormProps {
  intent: FollowupIntent;
  onChange: (intent: FollowupIntent) => void;
  onGenerate: () => void;
  onCreateConsultation: () => void;
  isGenerating?: boolean;
  templates?: Template[];
  selectedTemplateId?: string;
  onTemplateSelect?: (templateId: string | undefined) => void;
  patientId?: string;
  consultationId?: string;
}

function FollowupIntentForm({ intent, onChange, onGenerate, onCreateConsultation, isGenerating, templates, selectedTemplateId, onTemplateSelect, patientId, consultationId }: FollowupIntentFormProps) {
  const followupTemplates = templates?.filter(t => t.type === 'compte_rendu') || [];
  
  return (
    <div className="space-y-4">
      {/* Timeframe */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Délai *</label>
          <Select
            value={intent.timeframe}
            onValueChange={(value) => onChange({ ...intent, timeframe: value })}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1 semaine">1 semaine</SelectItem>
              <SelectItem value="2 semaines">2 semaines</SelectItem>
              <SelectItem value="1 mois">1 mois</SelectItem>
              <SelectItem value="2 mois">2 mois</SelectItem>
              <SelectItem value="3 mois">3 mois</SelectItem>
              <SelectItem value="6 mois">6 mois</SelectItem>
              <SelectItem value="1 an">1 an</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Date précise (optionnel)</label>
          <Input
            type="date"
            value={intent.target_date || ''}
            onChange={(e) => onChange({ ...intent, target_date: e.target.value })}
            className="mt-1 h-9"
          />
        </div>
      </div>
      
      {/* Reason */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Motif du suivi *</label>
        <Textarea
          value={intent.reason}
          onChange={(e) => onChange({ ...intent, reason: e.target.value })}
          placeholder="Pourquoi revoir ce patient?"
          className="mt-1 min-h-[60px] text-sm"
        />
      </div>
      
      {/* Focus Items */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Points à surveiller</label>
        <Textarea
          value={intent.focus_items.join('\n')}
          onChange={(e) => onChange({ 
            ...intent, 
            focus_items: e.target.value.split('\n').filter(f => f.trim()) 
          })}
          placeholder="Un point par ligne..."
          className="mt-1 min-h-[60px] text-sm"
        />
      </div>
      
      {/* Labs before visit */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Examens avant la visite</label>
        <Textarea
          value={(intent.labs_before_visit || []).join('\n')}
          onChange={(e) => onChange({ 
            ...intent, 
            labs_before_visit: e.target.value.split('\n').filter(l => l.trim()) 
          })}
          placeholder="Un examen par ligne..."
          className="mt-1 min-h-[60px] text-sm"
        />
      </div>
      
      {/* Pre-visit instructions */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Instructions avant visite</label>
        <Input
          value={intent.pre_visit_instructions || ''}
          onChange={(e) => onChange({ ...intent, pre_visit_instructions: e.target.value })}
          placeholder="Ex: Venir à jeun"
          className="mt-1 h-9"
        />
      </div>
      
      {/* Reminders */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={intent.reminders.enabled}
            onCheckedChange={(checked) => onChange({ 
              ...intent, 
              reminders: { ...intent.reminders, enabled: !!checked } 
            })}
          />
          Activer les rappels
        </label>
        {intent.reminders.enabled && (
          <Select
            value={intent.reminders.timing}
            onValueChange={(value: '1_day' | '3_days' | '1_week') => onChange({ 
              ...intent, 
              reminders: { ...intent.reminders, timing: value } 
            })}
          >
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1_day">1 jour avant</SelectItem>
              <SelectItem value="3_days">3 jours avant</SelectItem>
              <SelectItem value="1_week">1 semaine avant</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      
      {/* Template Selector */}
      {followupTemplates.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Layout className="h-3 w-3" />
            Modèle de suivi (optionnel)
          </label>
          <Select
            value={selectedTemplateId || ''}
            onValueChange={(value) => onTemplateSelect?.(value || undefined)}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="Sélectionner un modèle..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Aucun modèle</SelectItem>
              {followupTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {/* Auto-create consultation */}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={intent.auto_create_consultation}
          onCheckedChange={(checked) => onChange({ ...intent, auto_create_consultation: !!checked })}
        />
        <label className="text-sm">Créer automatiquement la consultation de suivi</label>
      </div>
      
      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button 
          variant="outline"
          onClick={onCreateConsultation}
          disabled={!intent.reason || isGenerating}
        >
          <Calendar className="h-4 w-4 mr-2" />
          Créer RDV de suivi
        </Button>
        <Button 
          onClick={onGenerate}
          disabled={!intent.reason || isGenerating}
          className="bg-black hover:bg-neutral-800"
        >
          {isGenerating ? (
            <>Génération...</>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Générer le plan
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// DOCUMENT ITEM (for generated documents timeline)
// =============================================================================
interface DocumentItemProps {
  document: GeneratedDocument;
  onView: () => void;
  onSend: (channel: 'email' | 'whatsapp' | 'print') => void;
  canSend: boolean;
  sendBlockReason?: string;
}

function DocumentItem({ document, onView, onSend, canSend, sendBlockReason }: DocumentItemProps) {
  const getTypeIcon = () => {
    switch (document.artifact_type) {
      case 'prescription': return <Pill className="h-4 w-4" />;
      case 'referral_letter': return <User className="h-4 w-4" />;
      case 'followup_plan': return <Calendar className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };
  
  const getTypeLabel = () => {
    switch (document.artifact_type) {
      case 'prescription': return 'Ordonnance';
      case 'referral_letter': return 'Lettre de référence';
      case 'followup_plan': return 'Plan de suivi';
      case 'visit_note': return 'Note de visite';
      default: return 'Document';
    }
  };
  
  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-white hover:bg-muted/30 transition-colors">
      <div className="p-2 rounded-lg bg-muted">
        {getTypeIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{getTypeLabel()}</span>
          {getStatusBadge(document.status)}
        </div>
        <div className="text-xs text-muted-foreground">
          {document.signed_at ? (
            <>Signé le {format(new Date(document.signed_at), 'dd MMM yyyy HH:mm', { locale: fr })}</>
          ) : (
            <>Créé le {format(new Date(document.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}</>
          )}
          {document.channel && document.sent_at && (
            <> • Envoyé via {document.channel}</>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onView}>
          <Eye className="h-4 w-4" />
        </Button>
        
        {document.status === 'signed' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                disabled={!canSend}
                title={sendBlockReason}
              >
                <Send className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSend('whatsapp')}>
                <MessageSquare className="h-4 w-4 mr-2" />
                WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSend('email')}>
                <Mail className="h-4 w-4 mr-2" />
                Email
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSend('print')}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN ORDERS PANEL
// =============================================================================
export function OrdersPanel({
  patientId,
  patientName,
  consultationId,
  problems,
  orders,
  onOrdersChange,
  patientContact,
}: OrdersPanelProps) {
  const [activeTab, setActiveTab] = useState<OrderTab>('rx');
  const [isExpanded, setIsExpanded] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<GeneratedDocument | null>(null);
  
  // Fetch templates
  const { data: templates = [] } = useTemplates();
  
  // Selected templates for each form type
  const [selectedRxTemplateId, setSelectedRxTemplateId] = useState<string | undefined>();
  const [selectedReferralTemplateId, setSelectedReferralTemplateId] = useState<string | undefined>();
  const [selectedFollowupTemplateId, setSelectedFollowupTemplateId] = useState<string | undefined>();
  
  // Active intent for each tab
  const [activeRxIntent, setActiveRxIntent] = useState<RxIntent | null>(
    orders.rx_intents.length > 0 ? orders.rx_intents[0] : null
  );
  const [activeReferralIntent, setActiveReferralIntent] = useState<ReferralIntent | null>(
    orders.referral_intents.length > 0 ? orders.referral_intents[0] : null
  );
  const [activeFollowupIntent, setActiveFollowupIntent] = useState<FollowupIntent | null>(
    orders.followup_intents.length > 0 ? orders.followup_intents[0] : null
  );
  
  // Check if can send (patient has verified contact)
  const canSendEmail = !!(patientContact?.email && patientContact?.email_verified);
  const canSendWhatsapp = !!(patientContact?.phone && patientContact?.whatsapp_enabled);
  const canSend = canSendEmail || canSendWhatsapp;
  const sendBlockReason = !canSend ? 'Le patient n\'a pas de contact vérifié' : undefined;
  
  // Tab counts
  const rxCount = orders.rx_intents.length;
  const referralCount = orders.referral_intents.length;
  const followupCount = orders.followup_intents.length;
  const documentsCount = orders.documents.length;
  
  // Create new intent
  const handleNewRx = () => {
    const newIntent = createRxIntent({
      source_problem_id: problems[0]?.id,
    });
    setActiveRxIntent(newIntent);
    onOrdersChange({
      ...orders,
      rx_intents: [...orders.rx_intents, newIntent],
    });
  };
  
  const handleNewReferral = () => {
    const newIntent = createReferralIntent({
      source_problem_id: problems[0]?.id,
      clinical_summary: problems.map(p => `${p.title}: ${p.assessment || ''}`).join('\n'),
    });
    setActiveReferralIntent(newIntent);
    onOrdersChange({
      ...orders,
      referral_intents: [...orders.referral_intents, newIntent],
    });
  };
  
  const handleNewFollowup = () => {
    const newIntent = createFollowupIntent({
      source_problem_id: problems[0]?.id,
      reason: problems.map(p => p.title).join(', '),
    });
    setActiveFollowupIntent(newIntent);
    onOrdersChange({
      ...orders,
      followup_intents: [...orders.followup_intents, newIntent],
    });
  };
  
  // Update intents
  const handleRxChange = (intent: RxIntent) => {
    setActiveRxIntent(intent);
    onOrdersChange({
      ...orders,
      rx_intents: orders.rx_intents.map(i => i.id === intent.id ? intent : i),
    });
  };
  
  const handleReferralChange = (intent: ReferralIntent) => {
    setActiveReferralIntent(intent);
    onOrdersChange({
      ...orders,
      referral_intents: orders.referral_intents.map(i => i.id === intent.id ? intent : i),
    });
  };
  
  const handleFollowupChange = (intent: FollowupIntent) => {
    setActiveFollowupIntent(intent);
    onOrdersChange({
      ...orders,
      followup_intents: orders.followup_intents.map(i => i.id === intent.id ? intent : i),
    });
  };
  
  // Generate document from intent
  const handleGenerateRx = async () => {
    if (!activeRxIntent) return;
    setIsGenerating(true);
    try {
      // TODO: Call backend to generate prescription document
      const newDoc: GeneratedDocument = {
        id: crypto.randomUUID(),
        consultation_id: consultationId,
        artifact_type: 'prescription',
        status: 'draft',
        derived_from_intent_ids: [activeRxIntent.id],
        content_html: '', // Will be filled by backend
        created_at: new Date().toISOString(),
        created_by: 'current_user', // TODO: Get from auth
      };
      onOrdersChange({
        ...orders,
        documents: [...orders.documents, newDoc],
      });
      toast.success('Ordonnance générée ! Veuillez la relire et signer.');
    } catch (error) {
      toast.error('Erreur lors de la génération');
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleGenerateReferral = async () => {
    if (!activeReferralIntent) return;
    setIsGenerating(true);
    try {
      const newDoc: GeneratedDocument = {
        id: crypto.randomUUID(),
        consultation_id: consultationId,
        artifact_type: 'referral_letter',
        status: 'draft',
        derived_from_intent_ids: [activeReferralIntent.id],
        content_html: '',
        created_at: new Date().toISOString(),
        created_by: 'current_user',
      };
      onOrdersChange({
        ...orders,
        documents: [...orders.documents, newDoc],
      });
      toast.success('Lettre de référence générée !');
    } catch (error) {
      toast.error('Erreur lors de la génération');
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleGenerateFollowup = async () => {
    if (!activeFollowupIntent) return;
    setIsGenerating(true);
    try {
      const newDoc: GeneratedDocument = {
        id: crypto.randomUUID(),
        consultation_id: consultationId,
        artifact_type: 'followup_plan',
        status: 'draft',
        derived_from_intent_ids: [activeFollowupIntent.id],
        content_html: '',
        created_at: new Date().toISOString(),
        created_by: 'current_user',
      };
      onOrdersChange({
        ...orders,
        documents: [...orders.documents, newDoc],
      });
      toast.success('Plan de suivi généré !');
    } catch (error) {
      toast.error('Erreur lors de la génération');
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleCreateFollowupConsultation = async () => {
    if (!activeFollowupIntent) return;
    try {
      // TODO: Call consultationsApi.create() with pre-filled data
      toast.success(`Consultation de suivi créée: "Suivi: ${problems[0]?.title || 'Patient'}"`);
    } catch (error) {
      toast.error('Erreur lors de la création');
    }
  };
  
  const handleSendDocument = async (document: GeneratedDocument, channel: 'email' | 'whatsapp' | 'print') => {
    try {
      // TODO: Create action job and send
      toast.success(`Document envoyé via ${channel}`);
    } catch (error) {
      toast.error('Erreur lors de l\'envoi');
    }
  };
  
  return (
    <div className="border border-[#EAEAEA] rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 bg-[#F9F9F9] cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Ordonnances & Documents</h3>
          {documentsCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {documentsCount} doc{documentsCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-7">
                <Plus className="h-3 w-3 mr-1" />
                Nouveau
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleNewRx}>
                <Pill className="h-4 w-4 mr-2" />
                Ordonnance
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNewReferral}>
                <User className="h-4 w-4 mr-2" />
                Référence
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNewFollowup}>
                <Calendar className="h-4 w-4 mr-2" />
                Suivi
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-3 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
            <button
              onClick={() => setActiveTab('rx')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'rx' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Pill className="h-3.5 w-3.5" />
              Rx
              {rxCount > 0 && <Badge variant="secondary" className="h-4 text-[9px] px-1">{rxCount}</Badge>}
            </button>
            <button
              onClick={() => setActiveTab('referral')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'referral' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              Référence
              {referralCount > 0 && <Badge variant="secondary" className="h-4 text-[9px] px-1">{referralCount}</Badge>}
            </button>
            <button
              onClick={() => setActiveTab('followup')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'followup' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Suivi
              {followupCount > 0 && <Badge variant="secondary" className="h-4 text-[9px] px-1">{followupCount}</Badge>}
            </button>
          </div>
          
          {/* Tab Content */}
          <div className="min-h-[200px]">
            {activeTab === 'rx' && (
              activeRxIntent ? (
                <RxIntentForm
                  intent={activeRxIntent}
                  onChange={handleRxChange}
                  onGenerate={handleGenerateRx}
                  isGenerating={isGenerating}
                  templates={templates}
                  selectedTemplateId={selectedRxTemplateId}
                  onTemplateSelect={setSelectedRxTemplateId}
                  patientId={patientId}
                  consultationId={consultationId}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Pill className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Aucune ordonnance en cours</p>
                  <Button variant="outline" size="sm" onClick={handleNewRx}>
                    <Plus className="h-3 w-3 mr-1" />
                    Nouvelle ordonnance
                  </Button>
                </div>
              )
            )}
            
            {activeTab === 'referral' && (
              activeReferralIntent ? (
                <ReferralIntentForm
                  intent={activeReferralIntent}
                  onChange={handleReferralChange}
                  onGenerate={handleGenerateReferral}
                  isGenerating={isGenerating}
                  templates={templates}
                  selectedTemplateId={selectedReferralTemplateId}
                  onTemplateSelect={setSelectedReferralTemplateId}
                  patientId={patientId}
                  consultationId={consultationId}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <User className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Aucune référence en cours</p>
                  <Button variant="outline" size="sm" onClick={handleNewReferral}>
                    <Plus className="h-3 w-3 mr-1" />
                    Nouvelle référence
                  </Button>
                </div>
              )
            )}
            
            {activeTab === 'followup' && (
              activeFollowupIntent ? (
                <FollowupIntentForm
                  intent={activeFollowupIntent}
                  onChange={handleFollowupChange}
                  onGenerate={handleGenerateFollowup}
                  onCreateConsultation={handleCreateFollowupConsultation}
                  isGenerating={isGenerating}
                  templates={templates}
                  selectedTemplateId={selectedFollowupTemplateId}
                  onTemplateSelect={setSelectedFollowupTemplateId}
                  patientId={patientId}
                  consultationId={consultationId}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Aucun suivi planifié</p>
                  <Button variant="outline" size="sm" onClick={handleNewFollowup}>
                    <Plus className="h-3 w-3 mr-1" />
                    Nouveau suivi
                  </Button>
                </div>
              )
            )}
          </div>
          
          {/* Documents Timeline */}
          {orders.documents.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Documents générés
              </h4>
              <div className="space-y-2">
                {orders.documents.map((doc) => (
                  <DocumentItem
                    key={doc.id}
                    document={doc}
                    onView={() => setViewingDocument(doc)}
                    onSend={(channel) => handleSendDocument(doc, channel)}
                    canSend={!!canSend}
                    sendBlockReason={sendBlockReason}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Document Preview Dialog */}
      <Dialog open={!!viewingDocument} onOpenChange={() => setViewingDocument(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Aperçu du document</DialogTitle>
          </DialogHeader>
          {viewingDocument && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getStatusBadge(viewingDocument.status)}
                <span className="text-sm text-muted-foreground">
                  Créé le {format(new Date(viewingDocument.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                </span>
              </div>
              <div 
                className="border rounded-lg p-4 bg-white min-h-[400px]"
                dangerouslySetInnerHTML={{ __html: viewingDocument.content_html || '<p>Contenu en cours de génération...</p>' }}
              />
              <DialogFooter>
                {viewingDocument.status === 'draft' && (
                  <Button variant="outline">
                    <Pencil className="h-4 w-4 mr-2" />
                    Modifier
                  </Button>
                )}
                {viewingDocument.status === 'draft' && (
                  <Button className="bg-black hover:bg-neutral-800">
                    <Check className="h-4 w-4 mr-2" />
                    Signer
                  </Button>
                )}
                {viewingDocument.status === 'signed' && (
                  <Button className="bg-black hover:bg-neutral-800">
                    <Send className="h-4 w-4 mr-2" />
                    Envoyer
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OrdersPanel;
