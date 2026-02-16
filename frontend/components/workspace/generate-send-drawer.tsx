'use client';

import { useState, useMemo } from 'react';
import {
  Pill,
  FlaskConical,
  ScanLine,
  Stethoscope,
  FileText,
  Send,
  Printer,
  Mail,
  MessageSquare,
  Phone,
  Check,
  AlertCircle,
  Eye,
  ChevronRight,
  Shield,
  Clock,
  User,
  X,
  Calendar,
  Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import type { OrdoItem, OrdoMedicationItem, OrdoLabItem, OrdoImagingItem, OrdoProcedureItem } from '@/types/ordo';
import { validateOrdoItem, getOrdoGeneratesLabel } from '@/types/ordo';

// =============================================================================
// TYPES
// =============================================================================
type DeliveryChannel = 'print' | 'email' | 'whatsapp' | 'sms';

interface GeneratedDocument {
  id: string;
  type: 'rx' | 'lab_request' | 'imaging_request' | 'referral';
  label: string;
  items: OrdoItem[];
  previewUrl?: string;
}

interface Recipient {
  channel: DeliveryChannel;
  destination: string;
  verified: boolean;
  enabled: boolean;
}

// =============================================================================
// DOCUMENT PREVIEW CARD
// =============================================================================
function DocumentPreviewCard({
  doc,
  isSelected,
  onToggle,
  onPreview,
}: {
  doc: GeneratedDocument;
  isSelected: boolean;
  onToggle: () => void;
  onPreview: () => void;
}) {
  const icons = {
    rx: Pill,
    lab_request: FlaskConical,
    imaging_request: ScanLine,
    referral: Stethoscope,
  };
  const colors = {
    rx: 'text-foreground bg-[var(--medicai-green-light)] border-[var(--medicai-green)]',
    lab_request: 'text-foreground bg-[var(--medicai-green-light)] border-[var(--medicai-green)]',
    imaging_request: 'text-foreground bg-[var(--medicai-green-light)] border-[var(--medicai-green)]',
    referral: 'text-foreground bg-[var(--medicai-green-light)] border-[var(--medicai-green)]',
  };
  const Icon = icons[doc.type];

  return (
    <div className={cn(
      'border rounded-lg p-3 transition-all cursor-pointer',
      isSelected ? colors[doc.type] : 'bg-card hover:bg-muted/50'
    )}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggle}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={cn('h-4 w-4', isSelected ? colors[doc.type].split(' ')[0] : 'text-muted-foreground')} />
            <span className="font-medium text-sm">{doc.label}</span>
          </div>
          <div className="mt-1.5 space-y-0.5">
            {doc.items.map((item, idx) => (
              <div key={item.id} className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="w-3 text-center">{idx + 1}.</span>
                {item.type === 'medication' && (item as OrdoMedicationItem).drug_name}
                {item.type === 'lab' && ((item as OrdoLabItem).panel_name || 'Bilan')}
                {item.type === 'imaging' && `${(item as OrdoImagingItem).modality_label} - ${(item as OrdoImagingItem).body_region}`}
                {item.type === 'procedure' && (item as OrdoProcedureItem).procedure_name}
              </div>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={(e) => { e.stopPropagation(); onPreview(); }}
        >
          <Eye className="h-3 w-3 mr-1" />
          Aperçu
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// RECIPIENT ROW
// =============================================================================
function RecipientRow({
  recipient,
  onChange,
  onVerify,
}: {
  recipient: Recipient;
  onChange: (r: Recipient) => void;
  onVerify: () => void;
}) {
  const icons = {
    print: Printer,
    email: Mail,
    whatsapp: MessageSquare,
    sms: Phone,
  };
  const labels = {
    print: 'Imprimer',
    email: 'Email',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
  };
  const Icon = icons[recipient.channel];

  return (
    <div className="flex items-center gap-3 py-2">
      <Checkbox
        checked={recipient.enabled}
        onCheckedChange={(checked) => onChange({ ...recipient, enabled: checked as boolean })}
      />
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm w-20">{labels[recipient.channel]}</span>
      {recipient.channel !== 'print' && (
        <>
          <Input
            value={recipient.destination}
            onChange={(e) => onChange({ ...recipient, destination: e.target.value })}
            placeholder={
              recipient.channel === 'email' ? 'patient@email.com' :
              '+33 6 XX XX XX XX'
            }
            className="h-8 text-sm flex-1"
            disabled={!recipient.enabled}
          />
          {recipient.verified ? (
            <Badge variant="outline" className="text-[10px] h-5 text-green-600 border-green-200">
              <Check className="h-2.5 w-2.5 mr-0.5" />
              Vérifié
            </Badge>
          ) : recipient.destination && recipient.enabled ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onVerify}
            >
              Vérifier
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

// =============================================================================
// DOCUMENT PREVIEW DIALOG
// =============================================================================
function DocumentPreviewDialog({
  doc,
  open,
  onOpenChange,
  patientName,
  doctorName = 'Dr. Martin',
  clinicInfo = { name: 'Cabinet Médical', address: '123 Rue de la Santé', phone: '01 23 45 67 89' },
}: {
  doc: GeneratedDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName: string;
  doctorName?: string;
  clinicInfo?: { name: string; address: string; phone: string };
}) {
  if (!doc) return null;
  
  const today = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  
  const icons = {
    rx: Pill,
    lab_request: FlaskConical,
    imaging_request: ScanLine,
    referral: Stethoscope,
  };
  const Icon = icons[doc.type];
  
  const titles = {
    rx: 'ORDONNANCE MÉDICALE',
    lab_request: 'DEMANDE DE BILAN BIOLOGIQUE',
    imaging_request: "DEMANDE D'EXAMEN D'IMAGERIE",
    referral: 'LETTRE DE RÉFÉRENCE',
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Aperçu du document
          </DialogTitle>
          <DialogDescription>
            Prévisualisation avant génération
          </DialogDescription>
        </DialogHeader>
        
        {/* Document Preview Container */}
        <div className="border rounded-lg bg-white shadow-sm">
          {/* Document Header */}
          <div className="p-6 border-b bg-gradient-to-r from-slate-50 to-white">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{clinicInfo.name}</h2>
                <p className="text-sm text-slate-600">{clinicInfo.address}</p>
                <p className="text-sm text-slate-600">{clinicInfo.phone}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-700">{doctorName}</p>
                <p className="text-xs text-slate-500">N° RPPS: XXXXXXXXXX</p>
              </div>
            </div>
          </div>
          
          {/* Document Title */}
          <div className="p-4 bg-slate-100 border-b">
            <div className="flex items-center justify-center gap-2">
              <Icon className="h-5 w-5 text-slate-700" />
              <h1 className="text-sm font-bold text-slate-800 tracking-wide">{titles[doc.type]}</h1>
            </div>
          </div>
          
          {/* Patient & Date */}
          <div className="p-4 flex justify-between border-b bg-slate-50">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" />
              <span className="text-sm">
                <span className="text-slate-500">Patient : </span>
                <span className="font-medium">{patientName}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500" />
              <span className="text-sm">
                <span className="text-slate-500">Date : </span>
                <span className="font-medium">{today}</span>
              </span>
            </div>
          </div>
          
          {/* Document Body */}
          <div className="p-6 min-h-[200px]">
            {doc.type === 'rx' && (
              <div className="space-y-4">
                {doc.items.map((item, idx) => {
                  const med = item as OrdoMedicationItem;
                  return (
                    <div key={item.id} className="flex gap-3 p-3 border-l-2 border-[var(--medicai-green-dark)] bg-[var(--medicai-green-light)]/50 rounded-r">
                      <div className="flex-shrink-0 w-6 h-6 bg-[var(--medicai-green)] rounded-full flex items-center justify-center text-xs font-bold text-foreground">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-800">
                          {med.drug_name || 'Médicament'}
                          {med.dosage && <span className="font-normal text-slate-600"> — {med.dosage}</span>}
                        </div>
                        {med.form && <div className="text-sm text-slate-600">Forme : {med.form}</div>}
                        {(med.posology || med.frequency) && (
                          <div className="text-sm text-slate-700 mt-1">
                            Posologie : {med.posology || med.frequency}
                          </div>
                        )}
                        {med.duration && <div className="text-sm text-slate-600">Durée : {med.duration}</div>}
                        {med.quantity && <div className="text-sm text-slate-600">Qté : {med.quantity} boîte(s)</div>}
                        {med.instructions && (
                          <div className="text-sm italic text-slate-500 mt-1">{med.instructions}</div>
                        )}
                        {!med.substitution_allowed && (
                          <Badge variant="outline" className="text-[10px] mt-1 text-red-600 border-red-200">
                            Non substituable
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {doc.type === 'lab_request' && (
              <div className="space-y-4">
                {doc.items.map((item) => {
                  const lab = item as OrdoLabItem;
                  return (
                    <div key={item.id} className="border rounded-lg p-4 bg-muted/50">
                      <div className="font-semibold text-slate-800 mb-2">
                        {lab.panel_name || 'Bilan biologique'}
                        {lab.urgency !== 'routine' && (
                          <Badge variant={lab.urgency === 'stat' ? 'destructive' : 'default'} className="ml-2 text-[10px]">
                            {lab.urgency === 'stat' ? 'URGENT' : 'Prioritaire'}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-slate-600 mb-2">
                        <span className="font-medium">Tests demandés :</span>
                        <ul className="list-disc list-inside ml-2 mt-1">
                          {lab.tests.map((test, i) => (
                            <li key={i}>
                              {test.name}
                              {test.is_urgent && <span className="text-red-500 ml-1">(urgent)</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {lab.clinical_indication && (
                        <div className="text-sm text-slate-700 border-t pt-2 mt-2">
                          <span className="font-medium">Indication : </span>
                          {lab.clinical_indication}
                        </div>
                      )}
                      {lab.fasting_required && (
                        <div className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          À jeun requis
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {doc.type === 'imaging_request' && (
              <div className="space-y-4">
                {doc.items.map((item) => {
                  const img = item as OrdoImagingItem;
                  return (
                    <div key={item.id} className="border rounded-lg p-4 bg-blue-50/50">
                      <div className="font-semibold text-slate-800 mb-2">
                        {img.modality_label || 'Examen'} — {img.body_region || 'Région à préciser'}
                        {img.urgency !== 'routine' && (
                          <Badge variant={img.urgency === 'stat' ? 'destructive' : 'default'} className="ml-2 text-[10px]">
                            {img.urgency === 'stat' ? 'URGENT' : 'Prioritaire'}
                          </Badge>
                        )}
                      </div>
                      {img.clinical_indication && (
                        <div className="text-sm text-slate-700 mb-2">
                          <span className="font-medium">Indication clinique : </span>
                          {img.clinical_indication}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {img.contrast_required && (
                          <Badge variant="outline" className="text-[10px]">Avec injection</Badge>
                        )}
                        {img.pregnancy_status === 'negative' && (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">Grossesse négative</Badge>
                        )}
                      </div>
                      {img.notes && (
                        <div className="text-sm italic text-slate-500 mt-2">{img.notes}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {doc.type === 'referral' && (
              <div className="space-y-4">
                {doc.items.map((item) => {
                  const proc = item as OrdoProcedureItem;
                  return (
                    <div key={item.id} className="border rounded-lg p-4 bg-green-50/50">
                      <div className="font-semibold text-slate-800 mb-2">
                        {proc.procedure_name || 'Consultation spécialisée'}
                        {proc.specialist_type && (
                          <span className="font-normal text-slate-600"> — {proc.specialist_type}</span>
                        )}
                      </div>
                      {proc.indication && (
                        <div className="text-sm text-slate-700 mb-2">
                          <span className="font-medium">Motif : </span>
                          {proc.indication}
                        </div>
                      )}
                      {proc.urgency !== 'routine' && (
                        <Badge variant={proc.urgency === 'stat' ? 'destructive' : 'default'} className="text-[10px]">
                          {proc.urgency === 'stat' ? 'URGENT' : 'Prioritaire'}
                        </Badge>
                      )}
                      {proc.notes && (
                        <div className="text-sm italic text-slate-500 mt-2">{proc.notes}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Document Footer */}
          <div className="p-4 border-t bg-slate-50 flex justify-between items-end">
            <div className="text-xs text-slate-500">
              <p>Document généré automatiquement</p>
              <p>Signature électronique</p>
            </div>
            <div className="text-right">
              <div className="w-32 h-12 border border-dashed border-slate-300 rounded flex items-center justify-center text-xs text-slate-400">
                Signature
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button onClick={() => {
            toast.info('Impression en préparation...');
            onOpenChange(false);
          }}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// GENERATE & SEND DRAWER
// =============================================================================
interface GenerateSendDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: OrdoItem[];
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  onSend: (documents: GeneratedDocument[], recipients: Recipient[]) => Promise<void>;
}

export function GenerateSendDrawer({
  open,
  onOpenChange,
  items,
  patientName,
  patientEmail,
  patientPhone,
  onSend,
}: GenerateSendDrawerProps) {
  // Group items by document type
  const documents = useMemo<GeneratedDocument[]>(() => {
    const docs: GeneratedDocument[] = [];
    
    const meds = items.filter(i => i.type === 'medication') as OrdoMedicationItem[];
    if (meds.length > 0) {
      docs.push({
        id: 'rx-' + Date.now(),
        type: 'rx',
        label: 'Ordonnance médicale',
        items: meds,
      });
    }

    const labs = items.filter(i => i.type === 'lab') as OrdoLabItem[];
    if (labs.length > 0) {
      docs.push({
        id: 'lab-' + Date.now(),
        type: 'lab_request',
        label: 'Demande de bilan biologique',
        items: labs,
      });
    }

    const imaging = items.filter(i => i.type === 'imaging') as OrdoImagingItem[];
    if (imaging.length > 0) {
      docs.push({
        id: 'img-' + Date.now(),
        type: 'imaging_request',
        label: "Demande d'examen d'imagerie",
        items: imaging,
      });
    }

    const procedures = items.filter(i => i.type === 'procedure') as OrdoProcedureItem[];
    if (procedures.length > 0) {
      docs.push({
        id: 'ref-' + Date.now(),
        type: 'referral',
        label: 'Lettre de référence / Acte',
        items: procedures,
      });
    }

    return docs;
  }, [items]);

  // State
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(
    new Set(documents.map(d => d.id))
  );
  const [recipients, setRecipients] = useState<Recipient[]>([
    { channel: 'print', destination: '', verified: true, enabled: true },
    { channel: 'email', destination: patientEmail || '', verified: !!patientEmail, enabled: !!patientEmail },
    { channel: 'whatsapp', destination: patientPhone || '', verified: false, enabled: false },
  ]);
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<GeneratedDocument | null>(null);

  // Validation
  const incompleteItems = items.filter(i => validateOrdoItem(i).length > 0);
  const hasIncomplete = incompleteItems.length > 0;
  const selectedDocsList = documents.filter(d => selectedDocs.has(d.id));
  const enabledRecipients = recipients.filter(r => r.enabled);
  const unverifiedRecipients = enabledRecipients.filter(r => !r.verified && r.channel !== 'print');

  // Toggle document selection
  const toggleDoc = (id: string) => {
    const newSet = new Set(selectedDocs);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedDocs(newSet);
  };

  // Update recipient
  const updateRecipient = (index: number, updated: Recipient) => {
    setRecipients(prev => prev.map((r, i) => i === index ? updated : r));
  };

  // Mock verify
  const verifyRecipient = (index: number) => {
    // In real app, this would send a verification code
    toast.info('Code de vérification envoyé');
    setTimeout(() => {
      setRecipients(prev => prev.map((r, i) => 
        i === index ? { ...r, verified: true } : r
      ));
      toast.success('Contact vérifié');
    }, 1500);
  };

  // Handle send
  const handleSend = async () => {
    if (hasIncomplete) {
      toast.error('Complétez tous les éléments avant d\'envoyer');
      return;
    }
    if (selectedDocsList.length === 0) {
      toast.error('Sélectionnez au moins un document');
      return;
    }
    if (enabledRecipients.length === 0) {
      toast.error('Sélectionnez au moins un destinataire');
      return;
    }
    if (unverifiedRecipients.length > 0 && requireConfirmation) {
      toast.error('Vérifiez les contacts avant d\'envoyer');
      return;
    }

    setIsSending(true);
    try {
      await onSend(selectedDocsList, enabledRecipients);
      toast.success(`${selectedDocsList.length} document(s) envoyé(s)`);
      onOpenChange(false);
    } catch (error) {
      toast.error('Erreur lors de l\'envoi');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--medicai-green-dark)]" />
            Générer & Envoyer
          </SheetTitle>
          <SheetDescription>
            Documents pour <span className="font-medium">{patientName}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Incomplete warning */}
          {hasIncomplete && (
            <div className="flex items-start gap-3 p-3 bg-muted border border-border rounded-lg">
              <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {incompleteItems.length} élément{incompleteItems.length > 1 ? 's' : ''} incomplet{incompleteItems.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Complétez les champs marqués avant de générer les documents.
                </p>
                <ul className="mt-2 space-y-1">
                  {incompleteItems.slice(0, 3).map(item => (
                    <li key={item.id} className="text-xs text-muted-foreground flex items-center gap-1">
                      <X className="h-3 w-3" />
                      {item.type === 'medication' && (item as OrdoMedicationItem).drug_name || 'Médicament'}
                      {item.type === 'lab' && ((item as OrdoLabItem).panel_name || 'Bilan')}
                      {item.type === 'imaging' && 'Imagerie'}
                      {item.type === 'procedure' && 'Procédure'}
                      <span className="text-muted-foreground">— {validateOrdoItem(item).join(', ')}</span>
                    </li>
                  ))}
                  {incompleteItems.length > 3 && (
                    <li className="text-xs text-muted-foreground">
                      + {incompleteItems.length - 3} autre(s)...
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Documents section */}
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents à générer
              <Badge variant="outline" className="text-[10px] h-5">
                {selectedDocs.size}/{documents.length}
              </Badge>
            </h3>
            <div className="space-y-2">
              {documents.map(doc => (
                <DocumentPreviewCard
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedDocs.has(doc.id)}
                  onToggle={() => toggleDoc(doc.id)}
                  onPreview={() => setPreviewDoc(doc)}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* Recipients section */}
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Send className="h-4 w-4" />
              Destinataires
            </h3>
            <div className="space-y-1">
              {recipients.map((recipient, idx) => (
                <RecipientRow
                  key={recipient.channel}
                  recipient={recipient}
                  onChange={(r) => updateRecipient(idx, r)}
                  onVerify={() => verifyRecipient(idx)}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* Safety options */}
          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Sécurité
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="require-confirm"
                  checked={requireConfirmation}
                  onCheckedChange={(checked) => setRequireConfirmation(checked as boolean)}
                />
                <label htmlFor="require-confirm" className="text-sm">
                  Exiger vérification des contacts avant envoi
                </label>
              </div>
              {unverifiedRecipients.length > 0 && requireConfirmation && (
                <div className="text-xs text-muted-foreground flex items-center gap-1 ml-6">
                  <AlertCircle className="h-3 w-3" />
                  {unverifiedRecipients.length} contact(s) non vérifié(s)
                </div>
              )}
            </div>
          </div>

          {/* Audit info */}
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-medium">Traçabilité</span>
            </div>
            <p>
              Tous les documents générés et envoyés seront enregistrés dans le dossier patient
              avec horodatage et signature électronique.
            </p>
          </div>
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={handleSend}
            disabled={hasIncomplete || selectedDocsList.length === 0 || enabledRecipients.length === 0 || isSending}
          >
            {isSending ? (
              <>Envoi en cours...</>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Générer & Envoyer ({selectedDocsList.length} doc{selectedDocsList.length > 1 ? 's' : ''})
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
        </SheetFooter>
      </SheetContent>
      
      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        doc={previewDoc}
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        patientName={patientName}
      />
    </Sheet>
  );
}
