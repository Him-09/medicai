'use client';

import { useState, useEffect, useRef } from 'react';
import {
  FileText, Plus, Edit, Trash2, Search, Hash, Eye,
  Upload, X, Save, Loader2, Crop, Download, Printer, Pipette,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline,
  Check, Sparkles, FileImage, Scissors, RotateCcw
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { settingsApi, Template, Snippet } from '@/lib/api/settings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const templateTypeConfig: Record<string, {
  label: string;
  color: string;
  variables: { name: string; label: string; example: string; category: string }[];
}> = {
  ordonnance: {
    label: 'Ordonnance',
    color: 'bg-[var(--medicai-green-light)] text-[#333] border-[var(--medicai-green)]',
    variables: [
      { name: 'patient_name', label: 'Nom complet', example: 'Jean Dupont', category: 'Patient' },
      { name: 'patient_dob', label: 'Date de naissance', example: '15/03/1985', category: 'Patient' },
      { name: 'patient_age', label: 'Âge', example: '40 ans', category: 'Patient' },
      { name: 'patient_address', label: 'Adresse', example: '123 Rue Example', category: 'Patient' },
      { name: 'medications_list', label: 'Liste des médicaments', example: '1. Doliprane 1000mg - 1cp 3x/jour pendant 7 jours', category: 'Prescription' },
      { name: 'medication_name', label: 'Nom médicament', example: 'Doliprane', category: 'Prescription' },
      { name: 'medication_dosage', label: 'Dosage', example: '1000mg', category: 'Prescription' },
      { name: 'medication_form', label: 'Forme', example: 'comprimé', category: 'Prescription' },
      { name: 'medication_frequency', label: 'Fréquence', example: '3x/jour', category: 'Prescription' },
      { name: 'medication_duration', label: 'Durée', example: '7 jours', category: 'Prescription' },
      { name: 'medication_instructions', label: 'Instructions', example: 'à prendre avec les repas', category: 'Prescription' },
      { name: 'general_instructions', label: 'Instructions générales', example: 'Repos et hydratation', category: 'Prescription' },
      { name: 'valid_until', label: 'Validité', example: '01/03/2026', category: 'Prescription' },
      { name: 'renewable', label: 'Renouvelable', example: 'Oui', category: 'Prescription' },
      { name: 'date', label: 'Date', example: new Date().toLocaleDateString('fr-FR'), category: 'Document' },
      { name: 'doctor_name', label: 'Nom du médecin', example: 'Dr. Marie Martin', category: 'Document' },
      { name: 'doctor_specialty', label: 'Spécialité', example: 'Médecine générale', category: 'Document' },
    ],
  },
  certificat: {
    label: 'Certificat médical',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    variables: [
      { name: 'patient_name', label: 'Nom complet', example: 'Jean Dupont', category: 'Patient' },
      { name: 'patient_dob', label: 'Date de naissance', example: '15/03/1985', category: 'Patient' },
      { name: 'patient_age', label: 'Âge', example: '40 ans', category: 'Patient' },
      { name: 'patient_address', label: 'Adresse', example: '123 Rue Example', category: 'Patient' },
      { name: 'date', label: 'Date', example: new Date().toLocaleDateString('fr-FR'), category: 'Document' },
      { name: 'certificate_reason', label: 'Motif du certificat', example: 'Aptitude au sport', category: 'Certificat' },
      { name: 'certificate_duration', label: 'Durée validité', example: '1 an', category: 'Certificat' },
      { name: 'medical_findings', label: 'Constatations médicales', example: 'Examen clinique normal', category: 'Certificat' },
      { name: 'restrictions', label: 'Restrictions', example: 'Aucune', category: 'Certificat' },
      { name: 'doctor_name', label: 'Nom du médecin', example: 'Dr. Marie Martin', category: 'Document' },
      { name: 'doctor_specialty', label: 'Spécialité', example: 'Médecine générale', category: 'Document' },
    ],
  },
  lettre: {
    label: 'Lettre de référence',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    variables: [
      { name: 'patient_name', label: 'Nom complet', example: 'Jean Dupont', category: 'Patient' },
      { name: 'patient_dob', label: 'Date de naissance', example: '15/03/1985', category: 'Patient' },
      { name: 'patient_age', label: 'Âge', example: '40 ans', category: 'Patient' },
      { name: 'date', label: 'Date', example: new Date().toLocaleDateString('fr-FR'), category: 'Document' },
      { name: 'to_specialty', label: 'Spécialité destinataire', example: 'Cardiologie', category: 'Référence' },
      { name: 'to_provider_name', label: 'Nom du confrère', example: 'Dr. Pierre Bernard', category: 'Référence' },
      { name: 'urgency', label: 'Urgence', example: 'Routine', category: 'Référence' },
      { name: 'reason', label: 'Motif de référence', example: 'Bilan cardiaque', category: 'Référence' },
      { name: 'clinical_summary', label: 'Résumé clinique', example: 'Patient de 40 ans présentant...', category: 'Référence' },
      { name: 'relevant_findings', label: 'Résultats pertinents', example: 'ECG: Normal, TA: 120/80', category: 'Référence' },
      { name: 'questions', label: 'Questions pour le spécialiste', example: 'Avis sur indication traitement', category: 'Référence' },
      { name: 'attachments', label: 'Pièces jointes', example: 'Bilan sanguin du 01/02/2026', category: 'Référence' },
      { name: 'doctor_name', label: 'Nom du médecin', example: 'Dr. Marie Martin', category: 'Document' },
      { name: 'doctor_specialty', label: 'Spécialité', example: 'Médecine générale', category: 'Document' },
    ],
  },
  compte_rendu: {
    label: 'Compte rendu',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    variables: [
      { name: 'patient_name', label: 'Nom complet', example: 'Jean Dupont', category: 'Patient' },
      { name: 'patient_dob', label: 'Date de naissance', example: '15/03/1985', category: 'Patient' },
      { name: 'patient_age', label: 'Âge', example: '40 ans', category: 'Patient' },
      { name: 'date', label: 'Date', example: new Date().toLocaleDateString('fr-FR'), category: 'Document' },
      { name: 'consultation_date', label: 'Date de consultation', example: new Date().toLocaleDateString('fr-FR'), category: 'Consultation' },
      { name: 'chief_complaint', label: 'Motif de consultation', example: 'Douleur thoracique', category: 'Consultation' },
      { name: 'history', label: 'Histoire de la maladie', example: 'Depuis 3 jours, douleur...', category: 'Consultation' },
      { name: 'examination', label: 'Examen clinique', example: 'PA: 120/80, FC: 75/min', category: 'Consultation' },
      { name: 'diagnosis', label: 'Diagnostic', example: 'Douleur thoracique atypique', category: 'Consultation' },
      { name: 'plan', label: 'Plan de traitement', example: '1. Repos 2. Antalgiques PRN', category: 'Consultation' },
      { name: 'followup_timeframe', label: 'Délai de suivi', example: '2 semaines', category: 'Suivi' },
      { name: 'followup_reason', label: 'Motif du suivi', example: 'Contrôle évolution', category: 'Suivi' },
      { name: 'followup_focus', label: 'Points à surveiller', example: 'Douleur, tension artérielle', category: 'Suivi' },
      { name: 'doctor_name', label: 'Nom du médecin', example: 'Dr. Marie Martin', category: 'Document' },
    ],
  },
  laboratoire: {
    label: 'Bon de laboratoire',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    variables: [
      { name: 'patient_name', label: 'Nom complet', example: 'Jean Dupont', category: 'Patient' },
      { name: 'patient_dob', label: 'Date de naissance', example: '15/03/1985', category: 'Patient' },
      { name: 'date', label: 'Date', example: new Date().toLocaleDateString('fr-FR'), category: 'Document' },
      { name: 'tests_list', label: 'Liste des examens', example: 'NFS, Glycémie, HbA1c', category: 'Laboratoire' },
      { name: 'clinical_indication', label: 'Indication clinique', example: 'Bilan diabète', category: 'Laboratoire' },
      { name: 'urgency', label: 'Urgence', example: 'Routine', category: 'Laboratoire' },
      { name: 'fasting_required', label: 'À jeun', example: 'Oui', category: 'Laboratoire' },
      { name: 'special_instructions', label: 'Instructions spéciales', example: 'Prélèvement le matin', category: 'Laboratoire' },
      { name: 'destination_lab', label: 'Laboratoire', example: 'Laboratoire Central', category: 'Laboratoire' },
      { name: 'doctor_name', label: 'Nom du médecin', example: 'Dr. Marie Martin', category: 'Document' },
    ],
  },
  autre: {
    label: 'Autre',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    variables: [
      { name: 'patient_name', label: 'Nom complet', example: 'Jean Dupont', category: 'Patient' },
      { name: 'patient_dob', label: 'Date de naissance', example: '15/03/1985', category: 'Patient' },
      { name: 'date', label: 'Date', example: new Date().toLocaleDateString('fr-FR'), category: 'Document' },
      { name: 'doctor_name', label: 'Nom du médecin', example: 'Dr. Marie Martin', category: 'Document' },
      { name: 'custom_content', label: 'Contenu personnalisé', example: '...', category: 'Autre' },
    ],
  },
};

const formatOptions = [
  { id: 'bold', icon: Bold, label: 'Gras', openTag: '<b>', closeTag: '</b>' },
  { id: 'italic', icon: Italic, label: 'Italique', openTag: '<i>', closeTag: '</i>' },
  { id: 'underline', icon: Underline, label: 'Souligné', openTag: '<u>', closeTag: '</u>' },
];

const alignOptions = [
  { id: 'left', icon: AlignLeft, label: 'Gauche', style: 'text-align: left;' },
  { id: 'center', icon: AlignCenter, label: 'Centré', style: 'text-align: center;' },
  { id: 'right', icon: AlignRight, label: 'Droite', style: 'text-align: right;' },
];

export default function TemplatesPage() {
  const [activeTab, setActiveTab] = useState<'templates' | 'snippets'>('templates');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    type: 'ordonnance' as string,
    content: '',
    header_image: '',
    footer_image: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const [uploadMode, setUploadMode] = useState<'full' | 'crop'>('crop');

  const [showCropDialog, setShowCropDialog] = useState(false);
  const [cropTarget, setCropTarget] = useState<'header' | 'footer'>('header');
  const [uploadedImage, setUploadedImage] = useState<string>('');
  const [cropRegion, setCropRegion] = useState({ y: 0, height: 20 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });

  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  const [currentAlign, setCurrentAlign] = useState('left');
  const [contentBgColor, setContentBgColor] = useState('#ffffff');
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const colorPickerCanvasRef = useRef<HTMLCanvasElement>(null);

  const fullImageInputRef = useRef<HTMLInputElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);
  const cropInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [isSnippetDialogOpen, setIsSnippetDialogOpen] = useState(false);
  const [newSnippet, setNewSnippet] = useState({ shortcode: '', expansion: '', category: '' });
  const [isCreatingSnippet, setIsCreatingSnippet] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [templatesResponse, snippetsResponse] = await Promise.all([
        settingsApi.getTemplates(),
        settingsApi.getSnippets(),
      ]);
      setTemplates(templatesResponse.templates || []);
      setSnippets(snippetsResponse.snippets || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         t.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || t.type === filterType;
    return matchesSearch && matchesType;
  });

  const filteredSnippets = snippets.filter(s =>
    s.shortcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.expansion.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedSnippets = filteredSnippets.reduce((acc, snippet) => {
    const category = snippet.category || 'Sans catégorie';
    if (!acc[category]) acc[category] = [];
    acc[category].push(snippet);
    return acc;
  }, {} as Record<string, Snippet[]>);

  const currentTypeConfig = templateTypeConfig[templateForm.type] || templateTypeConfig.autre;
  const groupedVariables = currentTypeConfig.variables.reduce((acc, v) => {
    if (!acc[v.category]) acc[v.category] = [];
    acc[v.category].push(v);
    return acc;
  }, {} as Record<string, typeof currentTypeConfig.variables>);

  const handleFullTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('L\'image ne doit pas dépasser 10 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTemplateForm(prev => ({
        ...prev,
        header_image: reader.result as string,
        footer_image: '',
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleCropImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('L\'image ne doit pas dépasser 10 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setUploadedImage(reader.result as string);
        if (cropTarget === 'header') {
          setCropRegion({ y: 0, height: 15 });
        } else {
          setCropRegion({ y: 85, height: 15 });
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const extractBgColorFromImage = (imageSrc: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('#ffffff');
          return;
        }
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const samples = [
          ctx.getImageData(5, 5, 1, 1).data,
          ctx.getImageData(canvas.width - 5, 5, 1, 1).data,
          ctx.getImageData(5, canvas.height - 5, 1, 1).data,
          ctx.getImageData(canvas.width - 5, canvas.height - 5, 1, 1).data,
        ];

        let r = 0, g = 0, b = 0;
        samples.forEach(s => { r += s[0]; g += s[1]; b += s[2]; });
        r = Math.round(r / 4);
        g = Math.round(g / 4);
        b = Math.round(b / 4);

        resolve(`rgb(${r}, ${g}, ${b})`);
      };
      img.onerror = () => resolve('#ffffff');
      img.src = imageSrc;
    });
  };

  useEffect(() => {
    if (templateForm.header_image) {
      extractBgColorFromImage(templateForm.header_image).then(color => {
        setContentBgColor(color);
      });
    } else {
      setContentBgColor('#ffffff');
    }
  }, [templateForm.header_image]);

  const processCrop = async () => {
    if (!uploadedImage) return;

    setIsProcessing(true);
    try {

      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = uploadedImage;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Could not get canvas context');

      const cropY = (cropRegion.y / 100) * img.naturalHeight;
      const cropHeight = (cropRegion.height / 100) * img.naturalHeight;

      const maxWidth = 1200;
      let finalWidth = img.naturalWidth;
      let finalHeight = cropHeight;

      if (finalWidth > maxWidth) {
        const scale = maxWidth / finalWidth;
        finalWidth = maxWidth;
        finalHeight = Math.round(cropHeight * scale);
      }

      canvas.width = finalWidth;
      canvas.height = finalHeight;

      ctx.drawImage(
        img,
        0, cropY, img.naturalWidth, cropHeight,
        0, 0, finalWidth, finalHeight
      );

      const croppedImage = canvas.toDataURL('image/png');

      const sizeKB = Math.round((croppedImage.length * 3) / 4 / 1024);
      if (sizeKB > 500) {
        console.warn(`Large image: ${sizeKB}KB - may take longer to upload`);
      }

      if (cropTarget === 'header') {
        setTemplateForm(prev => ({ ...prev, header_image: croppedImage }));
      } else {
        setTemplateForm(prev => ({ ...prev, footer_image: croppedImage }));
      }

      setShowCropDialog(false);
      setUploadedImage('');
      toast.success(`${cropTarget === 'header' ? 'En-tête' : 'Pied de page'} extrait avec succès`);
    } catch (error) {
      console.error('Crop error:', error);
      toast.error('Erreur lors de l\'extraction');
    } finally {
      setIsProcessing(false);
    }
  };

  const openCropDialog = (target: 'header' | 'footer') => {
    setCropTarget(target);
    setUploadedImage('');
    setCropRegion(target === 'header'
      ? { y: 0, height: 15 }
      : { y: 85, height: 15 }
    );
    setShowCropDialog(true);
  };

  const handleDirectImageUpload = (type: 'header' | 'footer') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('L\'image ne doit pas dépasser 5 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      if (type === 'header') {
        setTemplateForm(prev => ({ ...prev, header_image: base64 }));
      } else {
        setTemplateForm(prev => ({ ...prev, footer_image: base64 }));
      }
    };
    reader.readAsDataURL(file);
  };

  const insertVariable = (varName: string) => {
    const variable = `{{${varName}}}`;
    const textarea = contentRef.current;

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = templateForm.content;
      const newText = text.substring(0, start) + variable + text.substring(end);
      setTemplateForm(prev => ({ ...prev, content: newText }));

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      setTemplateForm(prev => ({ ...prev, content: prev.content + variable }));
    }
  };

  const applyFormat = (formatId: string) => {
    const textarea = contentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = templateForm.content.substring(start, end);

    const format = formatOptions.find(f => f.id === formatId);
    if (!format) return;

    let newText: string;
    if (selectedText) {
      newText = templateForm.content.substring(0, start) +
                format.openTag + selectedText + format.closeTag +
                templateForm.content.substring(end);
    } else {
      newText = templateForm.content.substring(0, start) +
                format.openTag + format.closeTag +
                templateForm.content.substring(end);
    }

    setTemplateForm(prev => ({ ...prev, content: newText }));

    setTimeout(() => {
      textarea.focus();
      if (selectedText) {
        textarea.setSelectionRange(start + format.openTag.length, end + format.openTag.length);
      } else {
        textarea.setSelectionRange(start + format.openTag.length, start + format.openTag.length);
      }
    }, 0);
  };

  const applyAlignment = (align: string) => {
    setCurrentAlign(align);
    const textarea = contentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = templateForm.content;

    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;

    const currentLine = text.substring(lineStart, lineEnd);

    let cleanLine = currentLine.replace(/<div style="text-align: (left|center|right);">(.*?)<\/div>/g, '$2');

    const alignStyle = alignOptions.find(a => a.id === align)?.style || 'text-align: left;';
    const newLine = `<div style="${alignStyle}">${cleanLine}</div>`;

    const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
    setTemplateForm(prev => ({ ...prev, content: newText }));
  };

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      type: 'ordonnance',
      content: '',
      header_image: '',
      footer_image: '',
    });
    setUploadMode('crop');
    setShowTemplateDialog(true);
  };

  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      type: template.type,
      content: template.content,
      header_image: template.header_image || '',
      footer_image: template.footer_image || '',
    });
    setUploadMode(template.footer_image ? 'crop' : 'full');
    setShowTemplateDialog(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast.error('Veuillez entrer un nom pour le modèle');
      return;
    }
    if (!templateForm.content.trim() && uploadMode === 'crop') {
      toast.error('Veuillez entrer le contenu du modèle');
      return;
    }

    setIsSaving(true);
    try {
      if (editingTemplate) {
        await settingsApi.updateTemplate(editingTemplate.id, templateForm);
        toast.success('Modèle mis à jour');
      } else {
        await settingsApi.createTemplate(templateForm);
        toast.success('Modèle créé');
      }
      setShowTemplateDialog(false);
      loadData();
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce modèle ?')) return;

    try {
      await settingsApi.deleteTemplate(id);
      toast.success('Modèle supprimé');
      loadData();
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handlePreviewTemplate = (template: Template) => {
    setPreviewTemplate(template);
    setShowPreviewDialog(true);
  };

  const getPreviewContent = (content: string, type: string, forPrint = false) => {
    let preview = content;
    const config = templateTypeConfig[type] || templateTypeConfig.autre;

    config.variables.forEach(v => {
      const replacement = forPrint
        ? v.example
        : `<span style="color: var(--medicai-green-darker); font-weight: 500;">${v.example}</span>`;
      preview = preview.replace(new RegExp(`{{${v.name}}}`, 'g'), replacement);
    });

    preview = preview.replace(/\n/g, '<br>');

    return preview;
  };

  const handleDownloadPreview = async () => {
    if (!previewTemplate) return;

    try {

      const content = getPreviewContent(previewTemplate.content, previewTemplate.type, true);

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Impossible d\'ouvrir la fenêtre d\'impression. Vérifiez les bloqueurs de popup.');
        return;
      }

      const bgColor = contentBgColor || '#ffffff';

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${previewTemplate.name}</title>
          <style>
            @page {
              size: A4;
              margin: 0;
            }
            * { box-sizing: border-box; }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              font-size: 12pt;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
              background: ${bgColor};
            }
            b, strong { font-weight: bold; }
            i, em { font-style: italic; }
            u { text-decoration: underline; }
            .document {
              width: 21cm;
              min-height: 29.7cm;
              margin: 0 auto;
              background: ${bgColor};
              position: relative;
            }
            .header {
              width: 100%;
            }
            .header img {
              width: 100%;
              display: block;
            }
            .content {
              padding: 20px 40px;
              min-height: 400px;
              background: ${bgColor};
            }
            .footer {
              width: 100%;
            }
            .footer img {
              width: 100%;
              display: block;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-print { display: none; }
              .document { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="document">
            ${previewTemplate.header_image ? `<div class="header"><img src="${previewTemplate.header_image}" alt="En-tête" /></div>` : ''}
            <div class="content">${content}</div>
            ${previewTemplate.footer_image ? `<div class="footer"><img src="${previewTemplate.footer_image}" alt="Pied de page" /></div>` : ''}
          </div>
          <div class="no-print" style="position: fixed; bottom: 20px; right: 20px; display: flex; gap: 10px;">
            <button onclick="window.print()" style="padding: 12px 24px; background: #111; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
              🖨️ Imprimer
            </button>
            <button onclick="window.close()" style="padding: 12px 24px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
              ✕ Fermer
            </button>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();

      toast.success('Aperçu d\'impression ouvert');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Erreur lors de la génération');
    }
  };

  const handleCreateSnippet = async () => {
    if (!newSnippet.shortcode.startsWith('/')) {
      toast.error('Le raccourci doit commencer par /');
      return;
    }

    setIsCreatingSnippet(true);
    try {
      await settingsApi.createSnippet(newSnippet);
      toast.success('Raccourci créé');
      setIsSnippetDialogOpen(false);
      setNewSnippet({ shortcode: '', expansion: '', category: '' });
      loadData();
    } catch (error) {
      console.error('Failed to create snippet:', error);
      toast.error('Erreur lors de la création');
    } finally {
      setIsCreatingSnippet(false);
    }
  };

  const handleDeleteSnippet = async (id: string) => {
    try {
      await settingsApi.deleteSnippet(id);
      toast.success('Raccourci supprimé');
      loadData();
    } catch (error) {
      console.error('Failed to delete snippet:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  return (
    <div className="p-8">
      {}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#333]">Modèles de documents</h1>
        <p className="text-sm text-[#666] mt-1">
          Créez et gérez vos modèles de documents médicaux avec en-têtes personnalisés
        </p>
      </div>

      {}
      <div className="flex gap-1 p-1 bg-[#F5F5F5] rounded-lg w-fit mb-6">
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'templates'
              ? 'bg-white text-[#333] shadow-sm'
              : 'text-[#666] hover:text-[#333]'
          }`}
          onClick={() => setActiveTab('templates')}
        >
          <FileText className="h-4 w-4 inline mr-2" />
          Modèles
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'snippets'
              ? 'bg-white text-[#333] shadow-sm'
              : 'text-[#666] hover:text-[#333]'
          }`}
          onClick={() => setActiveTab('snippets')}
        >
          <Hash className="h-4 w-4 inline mr-2" />
          Raccourcis
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[#666]" />
        </div>
      ) : (
        <>
          {}
          {activeTab === 'templates' && (
            <div className="space-y-6">
              {}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#999]" />
                    <Input
                      placeholder="Rechercher un modèle..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 h-10 border-[#E5E5E5]"
                    />
                  </div>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[180px] h-10 border-[#E5E5E5]">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les types</SelectItem>
                      {Object.entries(templateTypeConfig).map(([value, config]) => (
                        <SelectItem key={value} value={value}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="h-10 bg-[#111] hover:bg-[#333] text-white"
                  onClick={handleNewTemplate}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nouveau modèle
                </Button>
              </div>

              {}
              {filteredTemplates.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#E5E5E5] p-12 text-center">
                  <FileText className="h-12 w-12 text-[#CCC] mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-[#333] mb-2">Aucun modèle</h3>
                  <p className="text-sm text-[#666] mb-6">
                    Créez votre premier modèle pour commencer
                  </p>
                  <Button
                    className="bg-[#111] hover:bg-[#333] text-white"
                    onClick={handleNewTemplate}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Créer un modèle
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredTemplates.map((template) => {
                    const config = templateTypeConfig[template.type] || templateTypeConfig.autre;
                    return (
                      <div
                        key={template.id}
                        className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden hover:shadow-md transition-shadow"
                      >
                        {template.header_image && (
                          <div className="h-16 bg-gray-50 border-b border-[#E5E5E5] flex items-center justify-center overflow-hidden">
                            <img
                              src={template.header_image}
                              alt="En-tête"
                              className="h-full w-full object-contain"
                            />
                          </div>
                        )}

                        <div className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-medium text-[#333]">{template.name}</h3>
                              <Badge className={cn("text-xs mt-1", config.color)}>
                                {config.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-[#666] hover:text-blue-600"
                                onClick={() => handlePreviewTemplate(template)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-[#666] hover:text-[#111]"
                                onClick={() => handleEditTemplate(template)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-[#666] hover:text-red-600"
                                onClick={() => handleDeleteTemplate(template.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <p className="text-xs text-[#666] line-clamp-3 font-mono bg-gray-50 p-2 rounded">
                            {template.content.substring(0, 150)}...
                          </p>

                          {template.updated_at && (
                            <p className="text-xs text-[#999] mt-3">
                              Modifié le {new Date(template.updated_at).toLocaleDateString('fr-FR')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {}
              <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-0">
                  <DialogHeader className="px-6 py-3 border-b bg-gray-50 flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4 text-[#333]" />
                      {editingTemplate ? 'Modifier le modèle' : 'Créer un modèle'}
                    </DialogTitle>
                  </DialogHeader>

                  <div className="flex-1 overflow-y-auto px-6">
                    <div className="space-y-4 py-3">
                      {}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-[#333] mb-1.5">
                            Nom du modèle *
                          </label>
                          <Input
                            value={templateForm.name}
                            onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Ex: Ordonnance standard"
                            className="h-10 border-[#E5E5E5]"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[#333] mb-1.5">
                            Type de document
                          </label>
                          <Select
                            value={templateForm.type}
                            onValueChange={(v) => setTemplateForm(prev => ({ ...prev, type: v }))}
                          >
                            <SelectTrigger className="h-10 border-[#E5E5E5]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(templateTypeConfig).map(([value, config]) => (
                                <SelectItem key={value} value={value}>{config.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {}
                      <div className="bg-gray-50 rounded-lg p-3 border border-[#E5E5E5]">
                        <label className="block text-xs font-medium text-[#333] mb-2">
                          Mode d&apos;importation
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setUploadMode('full')}
                            className={cn(
                              "p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3",
                              uploadMode === 'full'
                                ? "border-[var(--medicai-green)] bg-[var(--medicai-green-lighter)]"
                                : "border-[#E5E5E5] hover:border-[var(--medicai-green-dark)]"
                            )}
                          >
                            <FileImage className={cn(
                              "h-5 w-5 flex-shrink-0",
                              uploadMode === 'full' ? "text-[var(--medicai-green-darker)]" : "text-[#666]"
                            )} />
                            <div>
                              <p className="font-medium text-sm">Modèle complet</p>
                              <p className="text-xs text-[#666]">Image complète</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setUploadMode('crop')}
                            className={cn(
                              "p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3",
                              uploadMode === 'crop'
                                ? "border-[var(--medicai-green)] bg-[var(--medicai-green-lighter)]"
                                : "border-[#E5E5E5] hover:border-[var(--medicai-green-dark)]"
                            )}
                          >
                            <Scissors className={cn(
                              "h-5 w-5 flex-shrink-0",
                              uploadMode === 'crop' ? "text-[var(--medicai-green-darker)]" : "text-[#666]"
                            )} />
                            <div>
                              <p className="font-medium text-sm">En-tête & Pied</p>
                              <p className="text-xs text-[#666]">Zones séparées</p>
                            </div>
                          </button>
                        </div>
                      </div>

                      {}
                      {uploadMode === 'full' && (
                        <div>
                          <label className="block text-sm font-medium text-[#333] mb-1.5">
                            Image du modèle complet
                          </label>
                          <input
                            ref={fullImageInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFullTemplateUpload}
                            className="hidden"
                          />
                          {templateForm.header_image && !templateForm.footer_image ? (
                            <div className="border rounded-lg p-4 bg-gray-50">
                              <img
                                src={templateForm.header_image}
                                alt="Modèle"
                                className="max-h-64 object-contain mx-auto mb-3"
                              />
                              <div className="flex gap-2 justify-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => fullImageInputRef.current?.click()}
                                >
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Changer
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setTemplateForm(prev => ({ ...prev, header_image: '' }));
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="border-2 border-dashed border-[#E5E5E5] rounded-lg p-8 text-center hover:border-[var(--medicai-green)] transition-colors cursor-pointer"
                              onClick={() => fullImageInputRef.current?.click()}
                            >
                              <Upload className="h-8 w-8 text-[#999] mx-auto mb-3" />
                              <p className="text-sm text-[#666]">Cliquez pour télécharger votre modèle</p>
                              <p className="text-xs text-[#999] mt-1">PNG, JPG ou PDF • Max 10 MB</p>
                            </div>
                          )}
                        </div>
                      )}

                      {}
                      {uploadMode === 'crop' && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            {}
                            <div>
                              <label className="block text-sm font-medium text-[#333] mb-1.5">
                                En-tête du document
                              </label>
                              <input
                                ref={headerInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleDirectImageUpload('header')}
                                className="hidden"
                              />
                              {templateForm.header_image ? (
                                <div className="border rounded-lg p-3 bg-gray-50">
                                  <img
                                    src={templateForm.header_image}
                                    alt="En-tête"
                                    className="max-h-20 object-contain mx-auto mb-2"
                                  />
                                  <div className="flex gap-2 justify-center">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openCropDialog('header')}
                                    >
                                      <Crop className="h-3 w-3 mr-1" />
                                      Recadrer
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => headerInputRef.current?.click()}
                                    >
                                      Changer
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setTemplateForm(prev => ({ ...prev, header_image: '' }))}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <div
                                    className="flex-1 border-2 border-dashed border-[#E5E5E5] rounded-lg p-4 text-center hover:border-[var(--medicai-green)] transition-colors cursor-pointer"
                                    onClick={() => headerInputRef.current?.click()}
                                  >
                                    <Upload className="h-5 w-5 text-[#999] mx-auto mb-1" />
                                    <p className="text-xs text-[#666]">Télécharger</p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    className="h-auto"
                                    onClick={() => openCropDialog('header')}
                                  >
                                    <Crop className="h-4 w-4 mr-2" />
                                    Extraire
                                  </Button>
                                </div>
                              )}
                            </div>

                            {}
                            <div>
                              <label className="block text-sm font-medium text-[#333] mb-1.5">
                                Pied de page du document
                              </label>
                              <input
                                ref={footerInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleDirectImageUpload('footer')}
                                className="hidden"
                              />
                              {templateForm.footer_image ? (
                                <div className="border rounded-lg p-3 bg-gray-50">
                                  <img
                                    src={templateForm.footer_image}
                                    alt="Pied de page"
                                    className="max-h-20 object-contain mx-auto mb-2"
                                  />
                                  <div className="flex gap-2 justify-center">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openCropDialog('footer')}
                                    >
                                      <Crop className="h-3 w-3 mr-1" />
                                      Recadrer
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => footerInputRef.current?.click()}
                                    >
                                      Changer
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setTemplateForm(prev => ({ ...prev, footer_image: '' }))}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <div
                                    className="flex-1 border-2 border-dashed border-[#E5E5E5] rounded-lg p-4 text-center hover:border-[var(--medicai-green)] transition-colors cursor-pointer"
                                    onClick={() => footerInputRef.current?.click()}
                                  >
                                    <Upload className="h-5 w-5 text-[#999] mx-auto mb-1" />
                                    <p className="text-xs text-[#666]">Télécharger</p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    className="h-auto"
                                    onClick={() => openCropDialog('footer')}
                                  >
                                    <Crop className="h-4 w-4 mr-2" />
                                    Extraire
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>

                          {}
                          {templateForm.header_image && (
                            <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-[#E5E5E5]">
                              <div className="flex items-center gap-2">
                                <Pipette className="h-4 w-4 text-[#666]" />
                                <span className="text-xs font-medium text-[#333]">Couleur de fond:</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-6 h-6 rounded border border-[#CCC] cursor-pointer"
                                  style={{ backgroundColor: contentBgColor }}
                                  title="Couleur extraite de l'en-tête"
                                />
                                <input
                                  type="color"
                                  value={contentBgColor.startsWith('rgb') ? '#ffffff' : contentBgColor}
                                  onChange={(e) => setContentBgColor(e.target.value)}
                                  className="w-8 h-6 cursor-pointer border-0 p-0"
                                  title="Choisir une couleur personnalisée"
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs px-2"
                                  onClick={async () => {
                                    if (templateForm.header_image) {
                                      const color = await extractBgColorFromImage(templateForm.header_image);
                                      setContentBgColor(color);
                                      toast.success('Couleur extraite de l\'en-tête');
                                    }
                                  }}
                                >
                                  <Pipette className="h-3 w-3 mr-1" />
                                  Extraire
                                </Button>
                              </div>
                            </div>
                          )}

                          {}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-medium text-[#333]">
                                Contenu du modèle *
                              </label>
                              {}
                              <div className="flex items-center gap-0.5 bg-[#F5F5F5] rounded p-0.5">
                                {formatOptions.map((opt) => (
                                  <Button
                                    key={opt.id}
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 hover:bg-white"
                                    onClick={() => applyFormat(opt.id)}
                                    title={opt.label}
                                  >
                                    <opt.icon className="h-3.5 w-3.5" />
                                  </Button>
                                ))}
                                <div className="w-px h-5 bg-[#DDD] mx-1" />
                                {alignOptions.map((opt) => (
                                  <Button
                                    key={opt.id}
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-7 w-7 hover:bg-white",
                                      currentAlign === opt.id && "bg-[var(--medicai-green-light)] text-[#333]"
                                    )}
                                    onClick={() => applyAlignment(opt.id)}
                                    title={opt.label}
                                  >
                                    <opt.icon className="h-3.5 w-3.5" />
                                  </Button>
                                ))}
                              </div>
                            </div>
                            <Textarea
                              ref={contentRef}
                              value={templateForm.content}
                              onChange={(e) => setTemplateForm(prev => ({ ...prev, content: e.target.value }))}
                              placeholder={`Entrez le contenu...

Exemple:
Je soussigné, {{doctor_name}}, prescrit à {{patient_name}}:

{{medications_list}}

Fait le {{date}}`}
                              className="min-h-[150px] font-mono text-xs border-[#E5E5E5]"
                            />
                            <p className="text-[10px] text-[#999] mt-1">
                              Formatage: &lt;b&gt;gras&lt;/b&gt; &lt;i&gt;italique&lt;/i&gt; &lt;u&gt;souligné&lt;/u&gt;
                            </p>
                          </div>

                          {}
                          <div className="bg-[var(--medicai-green-lighter)] border border-[var(--medicai-green)] rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Sparkles className="h-3.5 w-3.5" />
                              <h4 className="text-xs font-medium text-[#333]">Variables - {currentTypeConfig.label}</h4>
                            </div>
                            <div className="space-y-2">
                              {Object.entries(groupedVariables).map(([category, vars]) => (
                                <div key={category}>
                                  <p className="text-xs font-medium text-[#555] mb-1.5">{category}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {vars.map((v) => (
                                      <button
                                        key={v.name}
                                        type="button"
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-[var(--medicai-green)] rounded text-xs font-mono text-[#333] hover:bg-[var(--medicai-green-light)] transition-colors"
                                        onClick={() => insertVariable(v.name)}
                                        title={`${v.label} (ex: ${v.example})`}
                                      >
                                        {`{{${v.name}}}`}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <DialogFooter className="border-t px-6 py-3 bg-gray-50 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTemplateDialog(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      className="bg-[#111] hover:bg-[#333] text-white"
                      size="sm"
                      onClick={handleSaveTemplate}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-1.5" />
                          {editingTemplate ? 'Mettre à jour' : 'Créer'}
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {}
              <Dialog open={showCropDialog} onOpenChange={setShowCropDialog}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
                  <DialogHeader className="px-6 py-3 border-b bg-gray-50 flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-base">
                      <Crop className="h-4 w-4 text-[#333]" />
                      Extraire {cropTarget === 'header' ? "l'en-tête" : 'le pied de page'}
                    </DialogTitle>
                  </DialogHeader>

                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {!uploadedImage ? (
                      <div>
                        <input
                          ref={cropInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleCropImageUpload}
                          className="hidden"
                        />
                        <div
                          className="border-2 border-dashed border-[#E5E5E5] rounded-lg p-12 text-center hover:border-[var(--medicai-green)] transition-colors cursor-pointer"
                          onClick={() => cropInputRef.current?.click()}
                        >
                          <Upload className="h-10 w-10 text-[#999] mx-auto mb-3" />
                          <p className="text-sm text-[#666]">Cliquez pour télécharger une image</p>
                          <p className="text-xs text-[#999] mt-1">PNG, JPG • Max 10 MB</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {}
                        <div className="relative border rounded-lg overflow-hidden bg-[#F5F5F5]">
                          <img
                            ref={imageRef}
                            src={uploadedImage}
                            alt="Document"
                            className="w-full h-auto"
                            style={{ maxHeight: '400px', objectFit: 'contain' }}
                          />
                          {}
                          <div
                            className={cn(
                              "absolute left-0 right-0 border-y-2 border-dashed pointer-events-none transition-all",
                              cropTarget === 'header'
                                ? "border-blue-500 bg-blue-500/20"
                                : "border-green-500 bg-green-500/20"
                            )}
                            style={{
                              top: `${cropRegion.y}%`,
                              height: `${cropRegion.height}%`,
                            }}
                          >
                            <div className={cn(
                              "absolute top-1 left-2 text-xs font-medium px-2 py-0.5 rounded",
                              cropTarget === 'header'
                                ? "text-blue-700 bg-blue-100"
                                : "text-green-700 bg-green-100"
                            )}>
                              {cropTarget === 'header' ? 'En-tête' : 'Pied de page'} (pleine largeur)
                            </div>
                          </div>
                        </div>

                        {}
                        <div className={cn(
                          "p-3 rounded-lg border",
                          cropTarget === 'header'
                            ? "bg-blue-50 border-blue-200"
                            : "bg-green-50 border-green-200"
                        )}>
                          <p className="text-xs text-[#666] mb-3">
                            La zone sélectionnée sera extraite sur toute la largeur de la page.
                          </p>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium">Position verticale (Y)</span>
                                <span className="text-[#666]">{Math.round(cropRegion.y)}%</span>
                              </div>
                              <Slider
                                value={[cropRegion.y]}
                                onValueChange={([value]) => setCropRegion(prev => ({ ...prev, y: value }))}
                                max={100 - cropRegion.height}
                                step={0.5}
                                className="w-full"
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium">Hauteur de la zone</span>
                                <span className="text-[#666]">{Math.round(cropRegion.height)}%</span>
                              </div>
                              <Slider
                                value={[cropRegion.height]}
                                onValueChange={([value]) => setCropRegion(prev => ({ ...prev, height: value }))}
                                min={3}
                                max={40}
                                step={0.5}
                                className="w-full"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <DialogFooter className="border-t px-6 py-3 bg-gray-50 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowCropDialog(false);
                        setUploadedImage('');
                      }}
                    >
                      Annuler
                    </Button>
                    {uploadedImage && (
                      <Button
                        className="bg-[#111] hover:bg-[#333] text-white"
                        size="sm"
                        onClick={processCrop}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Extraction...
                          </>
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1.5" />
                            Extraire
                          </>
                        )}
                      </Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {}
              <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
                  <DialogHeader className="px-4 py-2 border-b bg-gray-50 flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-sm">
                      <Eye className="h-4 w-4 text-[#333]" />
                      Aperçu: {previewTemplate?.name}
                    </DialogTitle>
                  </DialogHeader>

                  <div className="flex-1 overflow-y-auto p-4">
                    <div
                      className="border rounded-lg shadow-sm overflow-hidden mx-auto"
                      style={{
                        maxWidth: '21cm',
                        backgroundColor: contentBgColor
                      }}
                    >
                      {previewTemplate?.header_image && (
                        <div>
                          <img
                            src={previewTemplate.header_image}
                            alt="En-tête"
                            className="w-full"
                          />
                        </div>
                      )}

                      <div
                        className="px-10 py-6 min-h-[250px]"
                        style={{ backgroundColor: contentBgColor }}
                      >
                        <div
                          className="text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: previewTemplate ? getPreviewContent(previewTemplate.content, previewTemplate.type) : ''
                          }}
                        />
                      </div>

                      {previewTemplate?.footer_image && (
                        <div>
                          <img
                            src={previewTemplate.footer_image}
                            alt="Pied de page"
                            className="w-full"
                          />
                        </div>
                      )}
                    </div>

                    <div className="mt-3 p-2 bg-[var(--medicai-green-lighter)] border border-[var(--medicai-green)] rounded text-center">
                      <p className="text-[10px] text-[#555]">
                        Les variables sont remplacées par des données d&apos;exemple.
                      </p>
                    </div>
                  </div>

                  <DialogFooter className="gap-2 px-4 py-2 border-t bg-gray-50 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setShowPreviewDialog(false)}>
                      Fermer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[var(--medicai-green)] text-[#333] hover:bg-[var(--medicai-green-light)]"
                      onClick={handleDownloadPreview}
                    >
                      <Printer className="h-3.5 w-3.5 mr-1.5" />
                      Imprimer
                    </Button>
                    <Button
                      className="bg-[#111] hover:bg-[#333] text-white"
                      size="sm"
                      onClick={() => {
                        if (previewTemplate) {
                          handleEditTemplate(previewTemplate);
                          setShowPreviewDialog(false);
                        }
                      }}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1.5" />
                      Modifier
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {}
          {activeTab === 'snippets' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#999]" />
                  <Input
                    placeholder="Rechercher un raccourci..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-10 border-[#E5E5E5]"
                  />
                </div>
                <Dialog open={isSnippetDialogOpen} onOpenChange={setIsSnippetDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="h-9 bg-[#111] hover:bg-[#333] text-white">
                      <Plus className="h-4 w-4 mr-2" />
                      Nouveau raccourci
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Créer un raccourci</DialogTitle>
                      <DialogDescription>
                        Le raccourci doit commencer par /
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <label className="block text-sm font-medium text-[#333] mb-1.5">
                          Raccourci
                        </label>
                        <Input
                          className="h-10 border-[#E5E5E5] font-mono"
                          value={newSnippet.shortcode}
                          onChange={(e) => setNewSnippet({ ...newSnippet, shortcode: e.target.value })}
                          placeholder="/mon-raccourci"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#333] mb-1.5">
                          Texte développé
                        </label>
                        <Textarea
                          value={newSnippet.expansion}
                          onChange={(e) => setNewSnippet({ ...newSnippet, expansion: e.target.value })}
                          placeholder="Le texte qui remplacera le raccourci..."
                          rows={3}
                          className="border-[#E5E5E5]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#333] mb-1.5">
                          Catégorie
                        </label>
                        <Input
                          className="h-10 border-[#E5E5E5]"
                          value={newSnippet.category}
                          onChange={(e) => setNewSnippet({ ...newSnippet, category: e.target.value })}
                          placeholder="Ex: Diagnostics"
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full h-10 bg-[#111] hover:bg-[#333] text-white"
                      onClick={handleCreateSnippet}
                      disabled={isCreatingSnippet}
                    >
                      {isCreatingSnippet ? 'Création...' : 'Créer le raccourci'}
                    </Button>
                  </DialogContent>
                </Dialog>
              </div>

              {Object.keys(groupedSnippets).length === 0 ? (
                <div className="bg-white rounded-xl border border-[#E5E5E5] p-12 text-center">
                  <Hash className="h-12 w-12 text-[#CCC] mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-[#333] mb-2">Aucun raccourci</h3>
                  <p className="text-sm text-[#666] mb-6">
                    Créez des raccourcis pour accélérer votre saisie
                  </p>
                </div>
              ) : (
                Object.entries(groupedSnippets).map(([category, categorySnippets]) => (
                  <div key={category} className="bg-white rounded-xl border border-[#E5E5E5] p-6">
                    <div className="uppercase text-[11px] font-semibold text-[#999] tracking-wide mb-4">
                      {category}
                    </div>
                    <div className="space-y-0">
                      {categorySnippets.map((snippet, index) => (
                        <div
                          key={snippet.id}
                          className={`flex items-center justify-between py-3 ${
                            index < categorySnippets.length - 1 ? 'border-b border-[#E5E5E5]' : ''
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <code className="px-2 py-1 bg-[var(--medicai-green-lighter)] rounded text-sm font-mono text-[#333] border border-[var(--medicai-green)]">
                              {snippet.shortcode}
                            </code>
                            <span className="text-sm text-[#333]">{snippet.expansion}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[#666] hover:text-red-600"
                            onClick={() => handleDeleteSnippet(snippet.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
