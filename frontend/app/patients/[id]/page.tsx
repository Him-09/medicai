'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  usePatient,
  usePatientSnapshot,
  usePatientDocuments,
  useConsultations,
  useCreateConsultation,
  useUpdatePatient,
  useDeletePatient,
  useUpdateConsultation,
  useCancelConsultation,
  useReassignDocument,
  useDocument,
  useConsultationSummary,
} from '@/lib/hooks';
import { documentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Upload,
  FileText,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Calendar as CalendarIcon,
  MessageSquare,
  MessageCircle,
  User,
  Activity,
  Stethoscope,
  Plus,
  ArrowRight,
  Mail,
  Phone,
  Clock,
  Edit,
  Trash2,
  Archive,
  MoreVertical,
  Copy,
  Printer,
  Share2,
  ChevronRight,
  Search,
  Pill,
  ClipboardList,
  FileImage,
  RefreshCw,
  ExternalLink,
  X,
  Check,
  Eye,
  Target,
  ShieldAlert,
  Heart,
  StickyNote,
  CheckCircle2,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  RadialBarChart,
  RadialBar,
} from 'recharts';

export default function PatientWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, { status: 'uploading' | 'processing' | 'success' | 'error', message?: string }>>(new Map());
  const [consultationDialogOpen, setConsultationDialogOpen] = useState(false);
  const [consultationDate, setConsultationDate] = useState<Date>(new Date());
  const [consultationTime, setConsultationTime] = useState<string>('09:00');
  const [consultationName, setConsultationName] = useState<string>('');
  const [consultationError, setConsultationError] = useState<string>('');
  const [documentFilter, setDocumentFilter] = useState<'all' | 'pending' | 'reviewed' | 'consultations' | 'labs' | 'imaging' | 'prescriptions'>('all');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    dob: '',
    sex: '' as '' | 'M' | 'F',
    email: '',
    phone: '',
    address: '',
    medical_history: '',
    allergies: [] as string[],
    active_problems: [] as string[],
  });
  const [editError, setEditError] = useState<string>('');
  const [activeConsultationsDialogOpen, setActiveConsultationsDialogOpen] = useState(false);
  const [activeConsultationIds, setActiveConsultationIds] = useState<string[]>([]);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateDocInfo, setDuplicateDocInfo] = useState<{
    filename: string;
    docId: string;
    existingPatientId: string;
    file: File;
  } | null>(null);
  const [reviewingDocId, setReviewingDocId] = useState<string | null>(null);
  const [documentSheetOpen, setDocumentSheetOpen] = useState(false);
  const [summarySheetOpen, setSummarySheetOpen] = useState(false);
  const [viewingConsultationId, setViewingConsultationId] = useState<string | null>(null);
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isEditingExtractedData, setIsEditingExtractedData] = useState(false);
  const [editedDocumentContent, setEditedDocumentContent] = useState<any>(null);
  const [isSavingExtractedData, setIsSavingExtractedData] = useState(false);

  const { data: patient } = usePatient(patientId);
  const { data: snapshot } = usePatientSnapshot(patientId);
  const { mutate: updatePatient, isPending: isUpdating } = useUpdatePatient();
  const { mutate: deletePatient, isPending: isDeleting } = useDeletePatient();
  const { mutate: updateConsultation } = useUpdateConsultation();
  const { mutate: cancelConsultation } = useCancelConsultation();
  const { mutate: reassignDocument } = useReassignDocument();
  const { data: documents, isLoading: documentsLoading } = usePatientDocuments(patientId);
  const { data: allConsultations } = useConsultations();
  const { data: reviewingDocument } = useDocument(reviewingDocId || '');
  const { data: consultationSummary, isLoading: summaryLoading } = useConsultationSummary(viewingConsultationId || '');
  const { mutate: createConsultation, isPending: isCreating } = useCreateConsultation();
  const queryClient = useQueryClient();

  // Filter consultations for this patient
  const patientConsultations = allConsultations?.filter(
    (c) => c.patientId === `#${patientId}`
  ) || [];

  const handleEditPatient = () => {
    if (patient) {
      setEditFormData({
        name: patient.name || '',
        dob: patient.dob || '',
        sex: patient.sex || '',
        email: patient.email || '',
        phone: patient.phone || '',
        address: '',
        medical_history: '',
        allergies: patient.allergies || [],
        active_problems: patient.active_problems || [],
      });
      setEditError('');
      setEditDialogOpen(true);
    }
  };

  const handleSaveEdit = () => {
    if (!editFormData.name || !editFormData.dob) {
      setEditError('Name and date of birth are required');
      return;
    }

    updatePatient(
      {
        id: patientId,
        data: editFormData,
      },
      {
        onSuccess: () => {
          toast.success('Patient updated successfully');
          setEditDialogOpen(false);
          setEditError('');
        },
        onError: (error: any) => {
          setEditError(error.message || 'Failed to update patient');
        },
      }
    );
  };

  const handleDeletePatient = () => {
    deletePatient(patientId, {
      onSuccess: () => {
        toast.success('Patient archived successfully');
        setDeleteDialogOpen(false);
        router.push('/patients');
      },
      onError: (error: any) => {
        // Check if error is about active consultations
        const errorDetail = error.response?.data?.detail;
        if (errorDetail?.active_consultations) {
          setActiveConsultationIds(errorDetail.active_consultations);
          setDeleteDialogOpen(false);
          setActiveConsultationsDialogOpen(true);
        } else {
          toast.error(error.message || 'Failed to archive patient');
          setDeleteDialogOpen(false);
        }
      },
    });
  };

  const handleNewConsultation = () => {
    // Check if patient already has an active consultation
    const hasActiveConsultation = patientConsultations.some(
      (c) => c.status === 'active'
    );
    
    if (hasActiveConsultation) {
      // Show toast notification and navigate to active consultation
      const activeConsultation = patientConsultations.find(
        (c) => c.status === 'active'
      );
      
      toast.warning(
        'Active consultation exists',
        { 
          description: 'This patient already has an active consultation. Redirecting...',
          duration: 3000,
        }
      );
      
      if (activeConsultation) {
        setTimeout(() => {
          router.push(`/consultations/${activeConsultation.id}`);
        }, 1000);
      }
      return;
    }
    
    // Open dialog to select date and time
    setConsultationDialogOpen(true);
    setConsultationDate(new Date());
    setConsultationTime('09:00');
    setConsultationError('');
  };

  const handleCreateConsultation = () => {
    // Combine date and time
    const [hours, minutes] = consultationTime.split(':').map(Number);
    const dateTime = new Date(consultationDate);
    dateTime.setHours(hours, minutes, 0, 0);
    
    setConsultationError('');
    
    createConsultation(
      { patientId, name: consultationName || undefined, consultationTime: dateTime },
      {
        onSuccess: (data) => {
          setConsultationDialogOpen(false);
          setConsultationName('');
          toast.success('Consultation created successfully');
          router.push(`/consultations/${data.consultation_id}`);
        },
        onError: (error: any) => {
          setConsultationError(error.message || 'Failed to create consultation. Please try again.');
        },
      }
    );
  };

  const handleUploadDocument = () => {
    setUploadDialogOpen(true);
    setSelectedFiles([]);
    setUploadError('');
    setUploadingFiles(new Map());
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(Array.from(files));
      setUploadError('');
      setUploadingFiles(new Map());
    }
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) {
      setUploadError('Please select at least one file to upload');
      return;
    }

    // Close dialog immediately - uploads continue in background
    setUploadDialogOpen(false);

    // Track upload progress with individual file toasts
    const fileToasts = new Map<string, string | number>();
    const uploadResults = { success: 0, failed: 0, duplicate: 0 };

    // Upload all files in parallel
    const uploadPromises = selectedFiles.map(async (file) => {
      // Create a toast for this file
      const fileToastId = toast.loading(
        ` ${file.name}`,
        {
          description: 'Uploading...',
          duration: Infinity,
        }
      );
      fileToasts.set(file.name, fileToastId);

      let processingTimeoutId: NodeJS.Timeout | null = null;

      try {
        // Schedule processing stage update
        processingTimeoutId = setTimeout(() => {
          toast.loading(
            ` ${file.name}`,
            {
              id: fileToastId,
              description: 'Processing document...',
              duration: Infinity,
            }
          );
        }, 2000);

        // Direct API call for parallel uploads
        await documentsApi.uploadToPatient(patientId, file);
        
        // Clear the timeout if still pending
        if (processingTimeoutId) {
          clearTimeout(processingTimeoutId);
        }
        
        // Mark as success
        toast.success(
          `✓ ${file.name}`,
          {
            id: fileToastId,
            description: 'Completed successfully',
            duration: 3000,
          }
        );
      } catch (error: any) {
        // Clear the processing timeout on any error
        if (processingTimeoutId) {
          clearTimeout(processingTimeoutId);
        }

        // Check for duplicate document (409 conflict)
        if (error.response?.status === 409) {
          const detail = error.response?.data?.detail;
          if (detail?.existing_doc_id && detail?.can_reassign) {
            // Show duplicate dialog instead of error
            setDuplicateDocInfo({
              filename: file.name,
              docId: detail.existing_doc_id,
              existingPatientId: detail.existing_patient_id,
              file: file,
            });
            setDuplicateDialogOpen(true);
            
            // Update the toast to show duplicate status
            toast.warning(
              ` ${file.name}`,
              {
                id: fileToastId,
                description: 'Document already exists - choose action',
                duration: 4000,
              }
            );
            uploadResults.duplicate++;
            throw new Error('duplicate'); // Mark as handled duplicate
          }
        }
        
        // Mark as error
        toast.error(
          `✗ ${file.name}`,
          {
            id: fileToastId,
            description: error.message || 'Upload failed',
            duration: 5000,
          }
        );
        uploadResults.failed++;
        throw error; // Re-throw for Promise.allSettled
      }
      
      uploadResults.success++;
    });

    // Wait for all uploads to complete in background
    Promise.allSettled(uploadPromises).then((results) => {
      // Invalidate documents cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'documents'] });

      // Show summary notification only if there were actual uploads (not just duplicates)
      const { success, failed, duplicate } = uploadResults;
      const total = success + failed + duplicate;
      
      if (total === 0) return; // No files processed
      
      // Only show summary if there were successes or failures (not just duplicates)
      if (success > 0 || failed > 0) {
        if (failed === 0 && duplicate === 0) {
          toast.success(
            `${success} document${success > 1 ? 's' : ''} uploaded successfully!`,
            { duration: 4000 }
          );
        } else if (success > 0) {
          const parts = [];
          if (success > 0) parts.push(`${success} succeeded`);
          if (failed > 0) parts.push(`${failed} failed`);
          if (duplicate > 0) parts.push(`${duplicate} duplicate${duplicate > 1 ? 's' : ''}`);
          
          toast.info(
            parts.join(', '),
            { duration: 5000 }
          );
        }
      }
    });

    // Reset form state
    setSelectedFiles([]);
    setUploadError('');
    setUploadingFiles(new Map());
  };

  const handleViewAllRecords = () => {
    // Switch to documents tab
    const documentsTab = document.querySelector('[value="documents"]') as HTMLElement;
    documentsTab?.click();
  };

  if (!patient) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Chargement des données patient...</div>
      </div>
    );
  }

  const initials = patient.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  // Calculate age from DOB
  const calculateAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };
  const patientAge = patient.dob ? calculateAge(patient.dob) : null;

  // Check for active consultation
  const activeConsultation = patientConsultations.find(c => c.status === 'active');
  const hasActiveConsultation = !!activeConsultation;

  // Build timeline items
  interface TimelineItem {
    id: string;
    date: string;
    dateObj: Date;
    type: 'consultation' | 'lab' | 'imaging' | 'prescription' | 'document';
    title: string;
    description?: string;
    tags?: string[];
    status?: string;
    review_status?: 'pending' | 'reviewed';
  }

  const timelineItems: TimelineItem[] = [];

  // Add consultations to timeline
  patientConsultations.forEach(consultation => {
    const dateObj = consultation.consultationTime 
      ? new Date(consultation.consultationTime) 
      : new Date(consultation.createdAt);
    
    timelineItems.push({
      id: consultation.id,
      date: format(dateObj, 'MMM d, yyyy'),
      dateObj,
      type: 'consultation',
      title: consultation.name || 'Consultation',
      status: consultation.status,
      tags: [],
    });
  });

  // Add documents to timeline
  if (documents && documents.length > 0) {
    documents.forEach(doc => {
      const dateStr = doc.date_of_service || doc.doc_date;
      if (!dateStr) return;
      
      const dateObj = new Date(dateStr);
      let type: TimelineItem['type'] = 'document';
      let title = doc.document_type || 'Document';
      
      const docType = doc.document_type?.toLowerCase() || '';
      if (docType.includes('lab')) {
        type = 'lab';
        title = 'Lab Report';
      } else if (docType.includes('radiology') || docType.includes('imaging')) {
        type = 'imaging';
        title = 'Imaging Report';
      } else if (docType.includes('prescription')) {
        type = 'prescription';
        title = 'Prescription';
      }
      
      timelineItems.push({
        id: doc.doc_id,
        date: format(dateObj, 'MMM d, yyyy'),
        dateObj,
        type,
        title,
        review_status: doc.review_status,
      });
    });
  }

  // Sort timeline by date - will be further sorted based on user selection
  const sortedTimelineItems = [...timelineItems].sort((a, b) => {
    if (sortOrder === 'newest') {
      return b.dateObj.getTime() - a.dateObj.getTime();
    } else {
      return a.dateObj.getTime() - b.dateObj.getTime();
    }
  });

  // Group timeline by date
  const groupedTimeline = sortedTimelineItems.reduce((acc: Record<string, TimelineItem[]>, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {});

  // Extract clinical data from snapshot and patient
  const activeProblems: string[] = patient.active_problems || snapshot?.active_problems || [];
  const currentMeds: Array<{ name: string; dose: string; frequency?: string; form?: string; duration?: string }> = snapshot?.current_medications?.map((med: any) => ({
    name: med.name || med.drug_name || med,
    dose: med.dose || '',
    frequency: med.frequency || '',
    form: med.form || '',
    duration: med.duration || ''
  })) || [];
  const allergies: string[] = patient.allergies || snapshot?.allergies || [];
  
  // Extract key conditions from medical history (used as fallback for active_problems)
  const keyConditionsFromHistory: string[] = [
    ...(patient.medical_history?.match(/\b(DM2|T2DM|diabetes|HTN|hypertension|CKD|chronic kidney disease|CHF|heart failure|COPD|asthma)\b/gi) || []).slice(0, 3)
  ].map(c => {
    // Normalize common abbreviations
    const normalized = c.toUpperCase();
    if (normalized.includes('DIABETES') || normalized === 'T2DM') return 'DM2';
    if (normalized.includes('HYPERTENSION')) return 'HTN';
    if (normalized.includes('KIDNEY')) return 'CKD';
    if (normalized.includes('HEART')) return 'CHF';
    return normalized;
  }).filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

  // Use active problems from snapshot, or fall back to extracted key conditions
  const keyConditions = activeProblems.length > 0 ? activeProblems : keyConditionsFromHistory;

  // Get abnormal labs from snapshot (flag 'H' = high, 'L' = low)
  const abnormalLabs = snapshot?.latest_lab?.tests?.filter(
    (t: any) => t.flag && (t.flag.toUpperCase() === 'H' || t.flag.toUpperCase() === 'L')
  ).map((t: any) => ({
    name: t.name,
    value: t.value,
    unit: t.unit || '',
    status: t.flag?.toUpperCase() === 'H' ? 'high' : 'low'
  })).slice(0, 3) || [];

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Compact Header - Clinical Cockpit Style */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Patient Identity + Clinical Context */}
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1.5">
              {/* Name */}
              <h1 className="text-xl font-bold">{patient.name}</h1>
              
              {/* Main Demographics: Age • Sex • DOB • Allergies • Key Conditions */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {patientAge}{patient.sex ? patient.sex : ''} • {patient.dob}
                </span>
                
                {allergies.length > 0 && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <Badge variant="destructive" className="text-xs h-5 gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Allergies: {allergies.join(', ')}
                    </Badge>
                  </>
                )}
                
                {keyConditions.length > 0 && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    {keyConditions.map((condition, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs h-5">
                        {condition}
                      </Badge>
                    ))}
                  </>
                )}
                
              </div>
              
              {/* Secondary Row: Contact + Patient ID */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Patient ID with copy */}
                {patient.patientId && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{patient.patientId}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => {
                        navigator.clipboard.writeText(patient.patientId || '');
                        toast.success('ID patient copié');
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                
                {/* Phone with Call/WhatsApp dropdown */}
                {patient.phone && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                          <Phone className="h-3 w-3 mr-1" />
                          Call
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem
                          onClick={() => window.location.href = `tel:${patient.phone}`}
                        >
                          <Phone className="h-4 w-4 mr-2" />
                          Appeler
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => window.open(`https://wa.me/${patient.phone?.replace(/\D/g, '')}`, '_blank')}
                        >
                          <MessageCircle className="h-4 w-4 mr-2" />
                          WhatsApp
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            navigator.clipboard.writeText(patient.phone || '');
                            toast.success('Numéro copié');
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copier le numéro
                        </DropdownMenuItem>
                        <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1">
                          {patient.phone}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
                
                {/* Email in Contact dropdown */}
                {patient.email && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                          <Mail className="h-3 w-3 mr-1" />
                          Email
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem
                          onClick={() => window.location.href = `mailto:${patient.email}`}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Envoyer un email
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            navigator.clipboard.writeText(patient.email || '');
                            toast.success('Email copié');
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copier l'email
                        </DropdownMenuItem>
                        <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1">
                          {patient.email}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleUploadDocument}>
              <Upload className="h-4 w-4 mr-1" />
              Téléverser
            </Button>
            <Button 
              size="sm" 
              onClick={() => {
                if (hasActiveConsultation) {
                  router.push(`/consultations/${activeConsultation!.id}`);
                } else {
                  handleNewConsultation();
                }
              }}
              disabled={isCreating}
            >
              <Plus className="h-4 w-4 mr-1" />
              {hasActiveConsultation ? 'Reprendre consultation' : 'Démarrer consultation'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleEditPatient}>
                  <Edit className="h-4 w-4 mr-2" />
                  Modifier
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)} className="text-destructive">
                  <Archive className="h-4 w-4 mr-2" />
                  Archiver
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => toast.info('Impression / Export bientôt disponible')}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimer / Exporter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Partage bientôt disponible')}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Partager
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Content - 2 Column Layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* MAIN COLUMN - Timeline with Actions */}
        <div className="flex-1 flex flex-col overflow-hidden border-r min-h-0">
          {/* Header with Search and Filters */}
          <div className="flex-shrink-0 border-b bg-background">
            <div className="px-6 py-4 space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher dans l'historique..."
                  className="pl-9 h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              {/* Filters and Sort */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant={documentFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDocumentFilter('all')}
                    className="h-8"
                  >
                    Tout
                  </Button>
                  <Button
                    variant={documentFilter === 'consultations' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDocumentFilter('consultations')}
                    className="h-8"
                  >
                    Consultations
                  </Button>
                  <Button
                    variant={documentFilter === 'labs' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDocumentFilter('labs')}
                    className="h-8"
                  >
                    Analyses
                  </Button>
                  <Button
                    variant={documentFilter === 'imaging' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDocumentFilter('imaging')}
                    className="h-8"
                  >
                    Imagerie
                  </Button>
                  <Button
                    variant={documentFilter === 'prescriptions' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDocumentFilter('prescriptions')}
                    className="h-8"
                  >
                    Ordonnances
                  </Button>
                </div>
                
                <Select value={sortOrder} onValueChange={(value: 'newest' | 'oldest') => setSortOrder(value)}>
                  <SelectTrigger className="w-[130px] h-8">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Tri: Récent</SelectItem>
                    <SelectItem value="oldest">Tri: Ancien</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Timeline Items */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-4">
              {Object.entries(groupedTimeline)
                .map(([date, items]) => ({
                  date,
                  items: items
                    .filter(item => {
                      // Filter by document type
                      if (documentFilter === 'consultations' && item.type !== 'consultation') return false;
                      if (documentFilter === 'labs' && item.type !== 'lab') return false;
                      if (documentFilter === 'imaging' && item.type !== 'imaging') return false;
                      if (documentFilter === 'prescriptions' && item.type !== 'prescription') return false;
                      
                      // Filter by search query
                      if (searchQuery) {
                        const query = searchQuery.toLowerCase();
                        const matchesTitle = item.title.toLowerCase().includes(query);
                        const matchesDate = date.toLowerCase().includes(query);
                        const matchesStatus = item.status?.toLowerCase().includes(query);
                        return matchesTitle || matchesDate || matchesStatus;
                      }
                      
                      return true;
                    })
                    .sort((a, b) => {
                      // Sort within each date group
                      if (sortOrder === 'newest') {
                        return b.dateObj.getTime() - a.dateObj.getTime();
                      } else {
                        return a.dateObj.getTime() - b.dateObj.getTime();
                      }
                    })
                }))
                .filter(({ items }) => items.length > 0)
                .map(({ date, items }) => (
                <div key={date} className="mb-5">
                  {/* Date Header */}
                  <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-2 mb-3 border-b">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {date}
                    </div>
                  </div>
                  
                  {/* Timeline Items */}
                  <div className="space-y-3">
                    {items.map((item) => {
                      const isConsultation = item.type === 'consultation';
                      const consultation = isConsultation ? patientConsultations.find(c => c.id === item.id) : null;
                      
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "group border border-[#EAEAEA] rounded-xl transition-all bg-white overflow-hidden",
                            isConsultation && consultation?.status === 'canceled' 
                              ? "opacity-60 cursor-not-allowed" 
                              : "hover:border-[var(--medicai-green)] hover:shadow-sm cursor-pointer"
                          )}
                          onClick={() => {
                            if (isConsultation) {
                              if (consultation?.status === 'canceled') {
                                toast.error('Cette consultation a été annulée et ne peut pas être ouverte.');
                                return;
                              }
                              if (consultation?.status === 'active') {
                                router.push(`/consultations/${item.id}`);
                              } else if (consultation?.status === 'completed') {
                                setViewingConsultationId(item.id);
                                setSummarySheetOpen(true);
                              }
                            } else {
                              setReviewingDocId(item.id);
                              setDocumentSheetOpen(true);
                            }
                          }}
                        >
                          <div className="flex items-center gap-4 p-4">
                            {/* Icon with background */}
                            <div className={`p-2.5 rounded-xl transition-all ${
                              item.type === 'consultation' ? 'bg-[var(--medicai-green-light)] text-foreground group-hover:bg-[var(--medicai-green)]' :
                              item.type === 'lab' ? 'bg-[var(--medicai-green-light)] text-foreground group-hover:bg-[var(--medicai-green)]' :
                              item.type === 'imaging' ? 'bg-[var(--medicai-green-light)] text-foreground group-hover:bg-[var(--medicai-green)]' :
                              item.type === 'prescription' ? 'bg-[var(--medicai-green-light)] text-foreground group-hover:bg-[var(--medicai-green)]' :
                              'bg-[#F9F9F9] text-muted-foreground group-hover:bg-[#EAEAEA]'
                            }`}>
                              {item.type === 'consultation' && <MessageSquare className="h-4 w-4" />}
                              {item.type === 'lab' && <Activity className="h-4 w-4" />}
                              {item.type === 'imaging' && <FileImage className="h-4 w-4" />}
                              {item.type === 'prescription' && <Pill className="h-4 w-4" />}
                              {item.type === 'document' && <FileText className="h-4 w-4" />}
                            </div>
                            
                            {/* Content - Single row layout */}
                            <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                              {/* Title + Badges */}
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                                  {isConsultation && consultation?.name ? consultation.name : item.title}
                                </h3>
                                {item.review_status === 'pending' && (
                                  <Badge variant="outline" className="text-xs h-5 text-muted-foreground border-border bg-muted">
                                    En attente
                                  </Badge>
                                )}
                                {item.review_status === 'reviewed' && (
                                  <Badge variant="outline" className="text-xs h-5 text-foreground border-[var(--medicai-green)] bg-[var(--medicai-green-light)]">
                                    Revu
                                  </Badge>
                                )}
                                {isConsultation && consultation?.status === 'active' && (
                                  <Badge variant="outline" className="text-xs h-5 text-foreground border-[var(--medicai-green-dark)] bg-[var(--medicai-green)]">
                                    Active
                                  </Badge>
                                )}
                                {isConsultation && consultation?.status === 'completed' && (
                                  <Badge variant="outline" className="text-xs h-5 text-foreground border-[var(--medicai-green)] bg-[var(--medicai-green-light)]">
                                    Terminée
                                  </Badge>
                                )}
                                {isConsultation && consultation?.status === 'canceled' && (
                                  <Badge variant="outline" className="text-xs h-5 text-muted-foreground border-muted-foreground/30">
                                    Annulée
                                  </Badge>
                                )}
                              </div>
                              
                              {/* Right side: Action Button */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Action Button */}
                                <div onClick={(e) => e.stopPropagation()}>
                                  {isConsultation ? (
                                    consultation?.status === 'active' ? (
                                      <Button
                                        size="sm"
                                        className="h-8 text-xs bg-black hover:bg-black/80 text-white"
                                        onClick={() => router.push(`/consultations/${item.id}`)}
                                      >
                                        <ArrowRight className="h-3 w-3 mr-1.5" />
                                        Reprendre
                                      </Button>
                                    ) : consultation?.status === 'completed' ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs"
                                        onClick={() => {
                                          setViewingConsultationId(item.id);
                                          setSummarySheetOpen(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3 mr-1.5" />
                                        Résumé
                                      </Button>
                                    ) : consultation?.status === 'canceled' ? (
                                      <Badge variant="outline" className="text-xs h-7 text-muted-foreground border-muted-foreground/30">
                                        Annulée
                                      </Badge>
                                    ) : null
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant={item.review_status === 'pending' ? 'default' : 'outline'}
                                      className="h-8 text-xs"
                                      onClick={() => {
                                        setReviewingDocId(item.id);
                                        setDocumentSheetOpen(true);
                                      }}
                                    >
                                      <FileText className="h-3 w-3 mr-1.5" />
                                      {item.review_status === 'reviewed' ? 'Voir' : 'Revoir'}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              {(() => {
                const hasFilteredItems = Object.entries(groupedTimeline)
                  .map(([date, items]) => ({
                    date,
                    items: items
                      .filter(item => {
                        // Filter by document type
                        if (documentFilter === 'consultations' && item.type !== 'consultation') return false;
                        if (documentFilter === 'labs' && item.type !== 'lab') return false;
                        if (documentFilter === 'imaging' && item.type !== 'imaging') return false;
                        if (documentFilter === 'prescriptions' && item.type !== 'prescription') return false;
                        
                        // Filter by search query
                        if (searchQuery) {
                          const query = searchQuery.toLowerCase();
                          const matchesTitle = item.title.toLowerCase().includes(query);
                          const matchesDate = date.toLowerCase().includes(query);
                          const matchesStatus = item.status?.toLowerCase().includes(query);
                          return matchesTitle || matchesDate || matchesStatus;
                        }
                        
                        return true;
                      })
                  }))
                  .filter(({ items }) => items.length > 0)
                  .length > 0;
                
                if (!hasFilteredItems) {
                  if (searchQuery) {
                    return (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Search className="h-16 w-16 text-muted-foreground mb-4" />
                        <p className="text-lg font-medium text-muted-foreground mb-2">Aucun résultat</p>
                        <p className="text-sm text-muted-foreground mb-4">Essayez d'autres termes de recherche</p>
                        <Button variant="outline" onClick={() => setSearchQuery('')}>
                          Effacer la recherche
                        </Button>
                      </div>
                    );
                  }
                  
                  if (documentFilter !== 'all') {
                    const filterLabels = {
                      consultations: 'consultations',
                      labs: 'analyses de laboratoire',
                      imaging: 'rapports d\'imagerie',
                      prescriptions: 'ordonnances'
                    };
                    return (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                        <p className="text-lg font-medium text-muted-foreground mb-2">
                          Aucun {filterLabels[documentFilter as keyof typeof filterLabels]} trouvé
                        </p>
                        <p className="text-sm text-muted-foreground mb-4">Essayez un filtre différent ou téléversez des documents</p>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => setDocumentFilter('all')}>
                            Afficher tout
                          </Button>
                          <Button onClick={handleUploadDocument}>
                            <Upload className="h-4 w-4 mr-2" />
                            Téléverser
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium text-muted-foreground mb-2">Aucun dossier</p>
                      <p className="text-sm text-muted-foreground mb-4">Commencez par créer une consultation ou téléverser des documents</p>
                      <div className="flex gap-2">
                        <Button onClick={handleNewConsultation}>
                          <Plus className="h-4 w-4 mr-2" />
                          Nouvelle consultation
                        </Button>
                        <Button variant="outline" onClick={handleUploadDocument}>
                          <Upload className="h-4 w-4 mr-2" />
                          Téléverser
                        </Button>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - Visual Dashboard */}
        <div className="w-[400px] border-l flex flex-col bg-background overflow-hidden">
          <div className="px-4 py-3 border-b flex-shrink-0 bg-white dark:bg-[#1A1A1A]">
            <h3 className="font-semibold text-sm text-foreground">Tableau de bord</h3>
            <p className="text-[10px] text-muted-foreground">
              {(snapshot && snapshot.latest_lab && snapshot.latest_lab.date_of_service) 
                ? `Mis à jour le ${format(new Date(snapshot.latest_lab.date_of_service), 'd MMM yyyy')}`
                : 'Pas encore de données'}
            </p>
          </div>

          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-5">
              {!snapshot?.latest_lab && !snapshot?.latest_radiology && currentMeds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Stethoscope className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">Pas encore de données cliniques</p>
                  <p className="text-xs text-muted-foreground mb-3">Téléversez des documents pour générer l'aperçu</p>
                  <Button variant="outline" size="sm" onClick={handleUploadDocument}>
                    <Upload className="h-3 w-3 mr-1" />
                    Téléverser
                  </Button>
                </div>
              ) : (
                <>
              {/* Activity Overview - Consultations Stats */}
              <div className="border border-[#EAEAEA] rounded-xl p-4 bg-[#F9F9F9]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold">Activité</h4>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {patientConsultations.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {patientConsultations.filter(c => c.status === 'completed').length}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Terminées</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {patientConsultations.filter(c => c.status === 'active').length}
                    </div>
                    <div className="text-[10px] text-muted-foreground">En cours</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-muted-foreground">
                      {patientConsultations.filter(c => c.status === 'canceled').length}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Annulées</div>
                  </div>
                </div>
                {/* Mini timeline chart */}
                {patientConsultations.length > 0 && (
                  <div className="mt-3 h-[60px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={(() => {
                          // Group consultations by month
                          const months: Record<string, number> = {};
                          patientConsultations.forEach(c => {
                            const date = c.consultationTime ? new Date(c.consultationTime) : new Date(c.createdAt);
                            const key = format(date, 'MMM');
                            months[key] = (months[key] || 0) + 1;
                          });
                          return Object.entries(months).slice(-6).map(([name, value]) => ({ name, value }));
                        })()}
                        margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                      >
                        <Bar dataKey="value" fill="#fb923c" radius={[4, 4, 0, 0]} />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#fb923c' }} axisLine={false} tickLine={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Lab Results Chart */}
              {snapshot?.latest_lab?.tests && snapshot.latest_lab.tests.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold">Analyses récentes</h4>
                    <span className="text-[10px] text-muted-foreground">
                      {snapshot.latest_lab.date_of_service 
                        ? format(new Date(snapshot.latest_lab.date_of_service), 'd MMM yyyy')
                        : ''}
                    </span>
                  </div>
                  
                  {/* Lab Results Overview with visual indicators */}
                  <div className="space-y-2">
                    {snapshot.latest_lab.tests.slice(0, 6).map((test: any, idx: number) => {
                      const flagUpper = test.flag?.toUpperCase() || '';
                      const isHigh = flagUpper === 'H' || flagUpper === 'HIGH' || flagUpper === 'HH';
                      const isLow = flagUpper === 'L' || flagUpper === 'LOW' || flagUpper === 'LL';
                      const isNormal = !isHigh && !isLow;
                      
                      // Calculate visual bar width (normalized to 100%)
                      const value = parseFloat(test.value) || 0;
                      const normalLow = parseFloat(test.normal_low) || 0;
                      const normalHigh = parseFloat(test.normal_high) || value * 1.2;
                      const range = normalHigh - normalLow || 1;
                      const percentage = Math.min(Math.max(((value - normalLow) / range) * 100, 0), 100);
                      
                      return (
                        <div key={idx} className={cn(
                          "border rounded-lg p-2.5",
                          isHigh && "bg-muted border-border",
                          isLow && "bg-muted border-border",
                          isNormal && "bg-white dark:bg-[#1A1A1A] border-border"
                        )}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-medium truncate max-w-[140px]">{test.name}</span>
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "text-xs font-semibold",
                                isHigh && "text-foreground",
                                isLow && "text-muted-foreground"
                              )}>
                                {test.value}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{test.unit}</span>
                              {(isHigh || isLow) && (
                                <Badge variant="outline" className={cn(
                                  "text-[9px] h-4 px-1",
                                  isHigh && "border-border text-foreground",
                                  isLow && "border-border text-muted-foreground"
                                )}>
                                  {isHigh ? '↑' : '↓'}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {/* Visual progress bar */}
                          <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "absolute h-full rounded-full transition-all",
                                isHigh && "bg-[var(--medicai-green-dark)]",
                                isLow && "bg-[var(--medicai-green)]",
                                isNormal && "bg-[var(--medicai-green-light)]"
                              )}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          {test.reference_range && (
                            <div className="text-[9px] text-muted-foreground mt-1">
                              Réf: {test.reference_range}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Abnormal count summary */}
                  {abnormalLabs.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 p-2 border rounded-lg bg-muted/50">
                      <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-[11px]">
                        {abnormalLabs.length} résultat{abnormalLabs.length > 1 ? 's' : ''} hors norme
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Current Medications - Visual Pills */}
              {currentMeds.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold flex items-center gap-1.5">
                      <Pill className="h-3.5 w-3.5" />
                      Médicaments ({currentMeds.length})
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {currentMeds.slice(0, 6).map((med, idx) => (
                      <div 
                        key={idx} 
                        className="border rounded-lg p-2.5 bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="text-[11px] font-medium truncate">
                          {med.name}
                        </div>
                        {med.dose && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {med.dose}
                          </div>
                        )}
                        {med.frequency && (
                          <Badge variant="secondary" className="text-[9px] h-4 mt-1">
                            {med.frequency}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                  {currentMeds.length > 6 && (
                    <div className="text-[10px] text-muted-foreground text-center mt-2">
                      +{currentMeds.length - 6} autre{currentMeds.length - 6 > 1 ? 's' : ''} médicament{currentMeds.length - 6 > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Documents Overview - Donut Chart */}
              {documents && documents.length > 0 && (
                <div className="border rounded-lg p-4 bg-card">
                  <h4 className="text-xs font-semibold mb-3">Documents</h4>
                  <div className="flex items-center gap-4">
                    <div className="w-[90px] h-[90px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={(() => {
                              const types: Record<string, number> = {};
                              documents.forEach(doc => {
                                const type = doc.document_type || 'other';
                                types[type] = (types[type] || 0) + 1;
                              });
                              return Object.entries(types).map(([name, value]) => ({ name, value }));
                            })()}
                            cx="50%"
                            cy="50%"
                            innerRadius={25}
                            outerRadius={40}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {(() => {
                              const colors = ['#fb923c', '#fdba74', '#fef3c7', '#f59e0b', '#fbbf24'];
                              const types: Record<string, number> = {};
                              documents.forEach(doc => {
                                const type = doc.document_type || 'other';
                                types[type] = (types[type] || 0) + 1;
                              });
                              return Object.entries(types).map((_, idx) => (
                                <Cell key={idx} fill={colors[idx % colors.length]} />
                              ));
                            })()}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {(() => {
                        const colors = ['#fb923c', '#fdba74', '#fef3c7', '#f59e0b', '#fbbf24'];
                        const labels: Record<string, string> = {
                          'lab': 'Analyses',
                          'radiology': 'Imagerie',
                          'prescription': 'Ordonnances',
                          'other': 'Autres'
                        };
                        const types: Record<string, number> = {};
                        documents.forEach(doc => {
                          const type = doc.document_type || 'other';
                          types[type] = (types[type] || 0) + 1;
                        });
                        return Object.entries(types).slice(0, 4).map(([type, count], idx) => (
                          <div key={type} className="flex items-center gap-2">
                            <div 
                              className="w-2.5 h-2.5 rounded-full" 
                              style={{ backgroundColor: colors[idx % colors.length] }}
                            />
                            <span className="text-[11px] flex-1">{labels[type] || type}</span>
                            <span className="text-[11px] font-medium">{count}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Last Imaging with visual */}
              {snapshot?.latest_radiology && (
                <div className="border border-border rounded-lg p-3 bg-muted">
                  <div className="flex items-center gap-2 mb-2">
                    <FileImage className="h-4 w-4" />
                    <h4 className="text-xs font-semibold">Dernière imagerie - {snapshot.latest_radiology.type_examen || 'Étude d\'imagerie'}</h4>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed">
                    {snapshot.latest_radiology.conclusion || 'Pas de conclusion enregistrée'}
                  </div>
                  {snapshot.latest_radiology.date_of_service && (
                    <div className="text-[9px] text-muted-foreground mt-2">
                      {format(new Date(snapshot.latest_radiology.date_of_service), 'd MMM yyyy')}
                    </div>
                  )}
                </div>
              )}

              {/* Pending Items - Action Required */}
              {documents && documents.filter(d => d.review_status === 'pending').length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-[var(--medicai-green)] rounded-full animate-pulse" />
                    </div>
                    <h4 className="text-xs font-semibold">En attente</h4>
                  </div>
                  <div className="space-y-2">
                    {documents.filter(d => d.review_status === 'pending').slice(0, 3).map((doc) => (
                      <button
                        key={doc.doc_id}
                        onClick={() => {
                          setReviewingDocId(doc.doc_id);
                          setDocumentSheetOpen(true);
                        }}
                        className="w-full text-left border border-[#EAEAEA] rounded-xl px-3 py-2.5 bg-[#F9F9F9] hover:bg-muted hover:cursor-pointer transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-xl bg-transparent flex items-center justify-center">
                              {doc.document_type === 'lab' && <Activity className="h-4 w-4" />}
                              {doc.document_type === 'radiology' && <FileImage className="h-4 w-4" />}
                              {doc.document_type === 'prescription' && <Pill className="h-4 w-4" />}
                              {!['lab', 'radiology', 'prescription'].includes(doc.document_type || '') && <FileText className="h-4 w-4" />}
                            </div>
                            <div>
                              <div className="text-[11px] font-medium">
                                {doc.document_type === 'lab' && 'Analyse'}
                                {doc.document_type === 'radiology' && 'Imagerie'}
                                {doc.document_type === 'prescription' && 'Ordonnance'}
                                {!['lab', 'radiology', 'prescription'].includes(doc.document_type || '') && 'Document'}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {doc.date_of_service 
                                  ? format(new Date(doc.date_of_service), 'd MMM yyyy')
                                  : 'Date inconnue'}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                      </button>
                    ))}
                    {documents.filter(d => d.review_status === 'pending').length > 3 && (
                      <div className="text-[10px] text-muted-foreground text-center py-1">
                        +{documents.filter(d => d.review_status === 'pending').length - 3} autre{documents.filter(d => d.review_status === 'pending').length - 3 > 1 ? 's' : ''} en attente
                      </div>
                    )}
                  </div>
                </div>
              )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Téléverser des documents</DialogTitle>
            <DialogDescription>
              Téléversez des documents médicaux (analyses, imagerie, etc.) pour {patient?.name}. Vous pouvez sélectionner plusieurs fichiers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {uploadError && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {uploadError}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="file">Sélectionner des fichiers (multiples autorisés)</Label>
              <Input
                id="file"
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.txt,.json,.xml,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.webp,image/*"
                multiple
              />
              {selectedFiles.length > 0 && (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="font-medium">{selectedFiles.length} file(s) selected:</p>
                  <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
                    {selectedFiles.map((file, idx) => (
                      <li key={idx} className="text-xs">
                        {file.name} ({(file.size / 1024).toFixed(2)} KB)
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground italic mt-2">
                     Astuce: Le traitement se fait en arrière-plan. Vous pouvez fermer cette boîte de dialogue et continuer à travailler.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false);
                  setSelectedFiles([]);
                  setUploadError('');
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUploadSubmit} 
                disabled={selectedFiles.length === 0}
              >
                Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Consultation Dialog */}
      <Dialog open={consultationDialogOpen} onOpenChange={setConsultationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planifier une nouvelle consultation</DialogTitle>
            <DialogDescription>
              Sélectionnez la date et l'heure pour la consultation avec {patient?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {consultationError && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {consultationError}
              </div>
            )}
            <div className="space-y-2">
              <Label>Nom de la consultation (Optionnel)</Label>
              <Input
                value={consultationName}
                onChange={(e) => setConsultationName(e.target.value)}
                placeholder="ex: Bilan annuel"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setConsultationName('Visite de suivi')}
                  className="text-xs"
                >
                  Visite de suivi
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setConsultationName('Bilan annuel')}
                  className="text-xs"
                >
                  Bilan annuel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setConsultationName('Consultation initiale')}
                  className="text-xs"
                >
                  Consultation initiale
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setConsultationName('Revue des résultats')}
                  className="text-xs"
                >
                  Revue des résultats
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !consultationDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {consultationDate ? format(consultationDate, "d MMM yyyy") : <span>Choisir une date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={consultationDate}
                    onSelect={(date) => date && setConsultationDate(date)}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Select value={consultationTime} onValueChange={setConsultationTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner l'heure" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => {
                    const hour = i.toString().padStart(2, '0');
                    return [
                      <SelectItem key={`${hour}:00`} value={`${hour}:00`}>
                        {hour}:00
                      </SelectItem>,
                      <SelectItem key={`${hour}:30`} value={`${hour}:30`}>
                        {hour}:30
                      </SelectItem>,
                    ];
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConsultationDialogOpen(false);
                  setConsultationError('');
                }}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateConsultation} disabled={isCreating}>
                {isCreating ? 'Création...' : 'Créer la consultation'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Patient Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[95vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>Modifier les informations du patient</DialogTitle>
            <DialogDescription>
              Mettre à jour les données du patient. Les champs obligatoires sont marqués *.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[calc(85vh-180px)] px-6">
            <div className="space-y-6 py-6">
              {editError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {editError}
                </div>
              )}

              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Informations de base</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Nom complet *</Label>
                    <Input
                      id="edit-name"
                      placeholder="John Doe"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-dob">Date de naissance *</Label>
                    <Input
                      id="edit-dob"
                      type="date"
                      value={editFormData.dob}
                      onChange={(e) => setEditFormData({ ...editFormData, dob: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-sex">Sexe</Label>
                    <Select
                      value={editFormData.sex}
                      onValueChange={(value: 'M' | 'F') => setEditFormData({ ...editFormData, sex: value })}
                    >
                      <SelectTrigger id="edit-sex">
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Masculin</SelectItem>
                        <SelectItem value="F">Féminin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Coordonnées</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      placeholder="john.doe@email.com"
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input
                      id="edit-phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={editFormData.phone}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-address">Adresse</Label>
                  <Input
                    id="edit-address"
                    placeholder="123 Rue Principale, Ville 12345"
                    value={editFormData.address}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  />
                </div>
              </div>

              <Separator />

              {/* Clinical Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Informations cliniques</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-allergies">Allergies</Label>
                    <Input
                      id="edit-allergies"
                      placeholder="e.g., Penicillin, Aspirin"
                      value={editFormData.allergies.join(', ')}
                      onChange={(e) => {
                        const allergies = e.target.value
                          .split(',')
                          .map(a => a.trim())
                          .filter(a => a.length > 0);
                        setEditFormData({ ...editFormData, allergies });
                      }}
                    />
                    <p className="text-xs text-muted-foreground">Separate multiple allergies with commas</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-active-problems">Pathologies actives</Label>
                    <Input
                      id="edit-active-problems"
                      placeholder="ex: DM2, HTA, IRC"
                      value={editFormData.active_problems.join(', ')}
                      onChange={(e) => {
                        const active_problems = e.target.value
                          .split(',')
                          .map(p => p.trim())
                          .filter(p => p.length > 0);
                        setEditFormData({ ...editFormData, active_problems });
                      }}
                    />
                    <p className="text-xs text-muted-foreground">Separate multiple conditions with commas</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-medical-history">Notes d'antécédents médicaux</Label>
                    <Textarea
                      id="edit-medical-history"
                      placeholder="Notes supplémentaires sur les antécédents médicaux, familiaux ou autres informations cliniques..."
                      rows={4}
                      value={editFormData.medical_history}
                      onChange={(e) => setEditFormData({ ...editFormData, medical_history: e.target.value })}
                      className="resize-none"
                    />
                    <p className="text-xs text-muted-foreground">Optionnel: Ajouter tout contexte clinique supplémentaire</p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-3 px-6 py-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setEditError('');
              }}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isUpdating}>
              {isUpdating ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete/Archive Patient Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archiver le patient ?</DialogTitle>
            <DialogDescription>
              Cela archivera <strong>{patient?.name}</strong>. Le dossier sera déplacé vers le statut archivé mais toutes les données seront conservées. Vous pourrez restaurer ce patient ultérieurement.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeletePatient}
              disabled={isDeleting}
              variant="destructive"
            >
              {isDeleting ? 'Archivage...' : 'Archiver le patient'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Active Consultations Dialog */}
      <Dialog open={activeConsultationsDialogOpen} onOpenChange={setActiveConsultationsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Active Consultations Found</DialogTitle>
            <DialogDescription>
              This patient has active consultations. Please complete or cancel them before archiving the patient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {activeConsultationIds.map((consultationId) => {
              const consultation = allConsultations?.find(c => c.id === consultationId);
              if (!consultation) return null;
              
              return (
                <div key={consultationId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">
                      {consultation.consultationTime 
                        ? format(new Date(consultation.consultationTime), 'PPp')
                        : 'Not scheduled'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Patient: {consultation.patientName}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        updateConsultation(
                          { id: consultationId, data: { status: 'completed' } },
                          {
                            onSuccess: () => {
                              toast.success('Consultation marked as completed');
                              setActiveConsultationIds(prev => prev.filter(id => id !== consultationId));
                              if (activeConsultationIds.length === 1) {
                                setActiveConsultationsDialogOpen(false);
                                setDeleteDialogOpen(true);
                              }
                            },
                            onError: () => {
                              toast.error('Failed to update consultation');
                            },
                          }
                        );
                      }}
                    >
                      Complete
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        cancelConsultation(
                          consultationId,
                          {
                            onSuccess: () => {
                              toast.success('Consultation canceled');
                              setActiveConsultationIds(prev => prev.filter(id => id !== consultationId));
                              if (activeConsultationIds.length === 1) {
                                setActiveConsultationsDialogOpen(false);
                                setDeleteDialogOpen(true);
                              }
                            },
                            onError: () => {
                              toast.error('Failed to cancel consultation');
                            },
                          }
                        );
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setActiveConsultationsDialogOpen(false)}
            >
              Close
            </Button>
            {activeConsultationIds.length === 0 && (
              <Button
                onClick={() => {
                  setActiveConsultationsDialogOpen(false);
                  setDeleteDialogOpen(true);
                }}
              >
                Retry Archive
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Document Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Document Already Exists</DialogTitle>
            <DialogDescription>
              The document <strong>{duplicateDocInfo?.filename}</strong> already exists for patient{' '}
              <strong>{duplicateDocInfo?.existingPatientId}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Would you like to reassign this document to the current patient ({patientId})? 
              This will remove it from the other patient.
            </p>
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setDuplicateDialogOpen(false);
                setDuplicateDocInfo(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (duplicateDocInfo) {
                  reassignDocument(
                    { docId: duplicateDocInfo.docId, newPatientId: patientId },
                    {
                      onSuccess: () => {
                        toast.success(`Document reassigned to ${patientId}`);
                        setDuplicateDialogOpen(false);
                        setDuplicateDocInfo(null);
                        queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'documents'] });
                      },
                      onError: (error: any) => {
                        toast.error(error.message || 'Failed to reassign document');
                      },
                    }
                  );
                }
              }}
            >
              Reassign to This Patient
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Review Sheet (Sliding Panel) */}
      <Sheet open={documentSheetOpen} onOpenChange={(open) => {
        setDocumentSheetOpen(open);
        if (!open) {
          setReviewingDocId(null);
          setImageZoom(1);
          setImagePosition({ x: 0, y: 0 });
          setIsEditingExtractedData(false);
          setEditedDocumentContent(null);
        }
      }}>
        <SheetContent side="right" className="!w-[85vw] sm:!max-w-[85vw] p-0 flex flex-col [&>button]:hidden">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="flex items-center gap-3">
                  {reviewingDocument?.review_status === 'reviewed' ? (
                    <>
                      <Check className="h-5 w-5 text-[var(--medicai-green-dark)]" />
                      Reviewed Document
                    </>
                  ) : (
                    <>
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      Pending Review
                    </>
                  )}
                </SheetTitle>
              </div>
            </div>
          </SheetHeader>
          {reviewingDocument ? (
            <>
              <div className="grid grid-cols-2 gap-6 flex-1 overflow-hidden px-6 py-4">
              {/* Left: Original Document */}
              <div className="border rounded-lg overflow-hidden flex flex-col">
                <div className="bg-muted p-3 border-b">
                  <h3 className="font-medium text-sm">Original Document</h3>
                  <p className="text-xs text-muted-foreground">{reviewingDocument.source_file}</p>
                </div>
                <div className="flex-1 bg-gray-50 relative">
                  {reviewingDocument.source_file_url ? (
                    reviewingDocument.source_file?.toLowerCase().endsWith('.pdf') ? (
                      <iframe
                        src={`${process.env.NEXT_PUBLIC_API_URL || ''}${reviewingDocument.source_file_url}#view=FitH`}
                        className="w-full h-full border-0"
                        title="Document Preview"
                      />
                    ) : (
                      <>
                        {/* Zoom Controls */}
                        <div className="absolute top-3 right-3 z-10 flex gap-2">
                          <button
                            onClick={() => setImageZoom(Math.min(imageZoom + 0.25, 3))}
                            className="bg-white/90 hover:bg-white p-2 rounded-md shadow-md transition-colors"
                            title="Zoom In"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setImageZoom(Math.max(imageZoom - 0.25, 0.5))}
                            className="bg-white/90 hover:bg-white p-2 rounded-md shadow-md transition-colors"
                            title="Zoom Out"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              setImageZoom(1);
                              setImagePosition({ x: 0, y: 0 });
                            }}
                            className="bg-white/90 hover:bg-white p-2 rounded-md shadow-md transition-colors"
                            title="Reset"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        </div>
                        {/* Image Container */}
                        <div 
                          className="w-full h-full overflow-hidden relative flex items-center justify-center"
                          onWheel={(e) => {
                            e.preventDefault();
                            const delta = e.deltaY > 0 ? -0.05 : 0.05;
                            const newZoom = Math.max(0.5, Math.min(3, imageZoom + delta));
                            setImageZoom(newZoom);
                            if (newZoom === 1) {
                              setImagePosition({ x: 0, y: 0 });
                            }
                          }}
                        >
                          <div
                            style={{
                              transform: `scale(${imageZoom})`,
                              transformOrigin: 'center center',
                              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                              position: 'relative',
                              left: `${imagePosition.x}px`,
                              top: `${imagePosition.y}px`,
                            }}
                          >
                            <img
                              src={`${process.env.NEXT_PUBLIC_API_URL || ''}${reviewingDocument.source_file_url}`}
                              alt="Document Preview"
                              draggable={false}
                              style={{
                                display: 'block',
                                maxWidth: imageZoom === 1 ? '100%' : 'none',
                                maxHeight: imageZoom === 1 ? '80vh' : 'none',
                                cursor: isDragging ? 'grabbing' : 'grab',
                                userSelect: 'none',
                              }}
                              onDoubleClick={() => {
                                if (imageZoom === 1) {
                                  setImageZoom(2);
                                } else {
                                  setImageZoom(1);
                                  setImagePosition({ x: 0, y: 0 });
                                }
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setIsDragging(true);
                                setDragStart({ 
                                  x: e.clientX - imagePosition.x, 
                                  y: e.clientY - imagePosition.y 
                                });
                              }}
                              onMouseMove={(e) => {
                                if (isDragging) {
                                  setImagePosition({
                                    x: e.clientX - dragStart.x,
                                    y: e.clientY - dragStart.y
                                  });
                                }
                              }}
                              onMouseUp={() => setIsDragging(false)}
                              onMouseLeave={() => setIsDragging(false)}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.parentElement?.parentElement) {
                                  e.currentTarget.parentElement.parentElement.innerHTML = `
                                    <div class="flex flex-col items-center gap-2">
                                      <p class="text-muted-foreground">Cannot display preview</p>
                                      <a href="${process.env.NEXT_PUBLIC_API_URL || ''}${reviewingDocument.source_file_url}" target="_blank" class="text-[var(--medicai-green-dark)] hover:underline text-sm">Open in new tab</a>
                                    </div>
                                  `;
                                }
                              }}
                            />
                          </div>
                        </div>
                      </>
                    )
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-muted-foreground">No preview available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Extracted Data */}
              <div className="border rounded-lg overflow-hidden flex flex-col">
                <div className="bg-muted p-3 border-b flex items-center justify-between">
                  <h3 className="font-medium text-sm">Extracted Data</h3>
                  <div className="flex gap-2">
                    {!isEditingExtractedData && reviewingDocument?.review_status === 'pending' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setIsEditingExtractedData(true);
                          setEditedDocumentContent(JSON.parse(JSON.stringify(reviewingDocument.content)));
                        }}
                      >
                        <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </Button>
                    ) : isEditingExtractedData ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setIsEditingExtractedData(false);
                            setEditedDocumentContent(null);
                          }}
                          disabled={isSavingExtractedData}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-black hover:bg-neutral-800"
                          onClick={async () => {
                            if (!editedDocumentContent || !reviewingDocId) return;
                            
                            setIsSavingExtractedData(true);
                            try {
                              await documentsApi.updateExtractedData(reviewingDocId, editedDocumentContent);
                              toast.success('Extracted data updated successfully');
                              
                              // Refresh the document
                              queryClient.invalidateQueries({ queryKey: ['documents', reviewingDocId] });
                              
                              setIsEditingExtractedData(false);
                              setEditedDocumentContent(null);
                            } catch (error) {
                              console.error('Failed to update extracted data:', error);
                              toast.error('Failed to update extracted data');
                            } finally {
                              setIsSavingExtractedData(false);
                            }
                          }}
                          disabled={isSavingExtractedData}
                        >
                          {isSavingExtractedData ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-4">
                    {/* Document Type */}
                    <div>
                      <h4 className="font-medium text-sm mb-2">Document Type</h4>
                      <p className="text-sm">{reviewingDocument.document_type}</p>
                    </div>

                    {/* Date of Service */}
                    {(reviewingDocument.date_of_service || reviewingDocument.content?.metadata?.date_of_service) && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Date of Service</h4>
                        <p className="text-sm">
                          {new Date(
                            reviewingDocument.date_of_service || reviewingDocument.content.metadata.date_of_service
                          ).toLocaleDateString()}
                        </p>
                      </div>
                    )}

                    <Separator />

                    {/* Lab Results */}
                    {reviewingDocument.document_type === 'lab' && reviewingDocument.content?.structured?.tests && (
                      <div>
                        <h4 className="font-medium text-sm mb-3">Lab Tests</h4>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted">
                              <tr>
                                <th className="text-left p-3 font-medium">Test Name</th>
                                <th className="text-right p-3 font-medium">Value</th>
                                <th className="text-left p-3 font-medium">Unit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(isEditingExtractedData ? editedDocumentContent?.structured?.tests : reviewingDocument.content.structured.tests)?.map((test: any, idx: number) => (
                                <tr key={idx} className="border-t hover:bg-muted/50">
                                  <td className="p-3">
                                    {isEditingExtractedData ? (
                                      <Input
                                        value={test.name || ''}
                                        onChange={(e) => {
                                          const updated = { ...editedDocumentContent };
                                          updated.structured.tests[idx].name = e.target.value;
                                          setEditedDocumentContent(updated);
                                        }}
                                        className="h-7 text-sm"
                                      />
                                    ) : (
                                      test.name
                                    )}
                                  </td>
                                  <td className="p-3 text-right">
                                    {isEditingExtractedData ? (
                                      <Input
                                        value={test.value || ''}
                                        onChange={(e) => {
                                          const updated = { ...editedDocumentContent };
                                          updated.structured.tests[idx].value = e.target.value;
                                          setEditedDocumentContent(updated);
                                        }}
                                        className="h-7 text-sm text-right"
                                      />
                                    ) : (
                                      <span className="font-medium">{test.value}</span>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    {isEditingExtractedData ? (
                                      <Input
                                        value={test.unit || ''}
                                        onChange={(e) => {
                                          const updated = { ...editedDocumentContent };
                                          updated.structured.tests[idx].unit = e.target.value;
                                          setEditedDocumentContent(updated);
                                        }}
                                        className="h-7 text-sm"
                                      />
                                    ) : (
                                      test.unit
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Radiology Results */}
                    {reviewingDocument.document_type === 'radiology' && (
                      <div className="space-y-4">
                        {(isEditingExtractedData ? editedDocumentContent?.metadata?.type_examen : reviewingDocument.content?.metadata?.type_examen) && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">Exam Type</h4>
                            {isEditingExtractedData ? (
                              <Input
                                value={editedDocumentContent?.metadata?.type_examen || ''}
                                onChange={(e) => {
                                  const updated = { ...editedDocumentContent };
                                  if (!updated.metadata) updated.metadata = {};
                                  updated.metadata.type_examen = e.target.value;
                                  setEditedDocumentContent(updated);
                                }}
                                className="text-sm"
                              />
                            ) : (
                              <p className="text-sm">{reviewingDocument.content.metadata.type_examen}</p>
                            )}
                          </div>
                        )}
                        {(isEditingExtractedData ? editedDocumentContent?.structured?.contexte_clinique : reviewingDocument.content?.structured?.contexte_clinique) && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">Clinical Context</h4>
                            {isEditingExtractedData ? (
                              <Textarea
                                value={editedDocumentContent?.structured?.contexte_clinique || ''}
                                onChange={(e) => {
                                  const updated = { ...editedDocumentContent };
                                  if (!updated.structured) updated.structured = {};
                                  updated.structured.contexte_clinique = e.target.value;
                                  setEditedDocumentContent(updated);
                                }}
                                className="text-sm min-h-[80px]"
                              />
                            ) : (
                              <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">{reviewingDocument.content.structured.contexte_clinique}</p>
                            )}
                          </div>
                        )}
                        {(isEditingExtractedData ? editedDocumentContent?.structured?.technique_examen : reviewingDocument.content?.structured?.technique_examen) && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">Examination Technique</h4>
                            {isEditingExtractedData ? (
                              <Textarea
                                value={editedDocumentContent?.structured?.technique_examen || ''}
                                onChange={(e) => {
                                  const updated = { ...editedDocumentContent };
                                  if (!updated.structured) updated.structured = {};
                                  updated.structured.technique_examen = e.target.value;
                                  setEditedDocumentContent(updated);
                                }}
                                className="text-sm min-h-[80px]"
                              />
                            ) : (
                              <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">{reviewingDocument.content.structured.technique_examen}</p>
                            )}
                          </div>
                        )}
                        {(isEditingExtractedData ? editedDocumentContent?.structured?.resultats : reviewingDocument.content?.structured?.resultats) && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">Results</h4>
                            {isEditingExtractedData ? (
                              <Textarea
                                value={editedDocumentContent?.structured?.resultats || ''}
                                onChange={(e) => {
                                  const updated = { ...editedDocumentContent };
                                  if (!updated.structured) updated.structured = {};
                                  updated.structured.resultats = e.target.value;
                                  setEditedDocumentContent(updated);
                                }}
                                className="text-sm min-h-[100px]"
                              />
                            ) : (
                              <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">{reviewingDocument.content.structured.resultats}</p>
                            )}
                          </div>
                        )}
                        {(isEditingExtractedData ? editedDocumentContent?.structured?.conclusion : reviewingDocument.content?.structured?.conclusion) && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">Conclusion</h4>
                            {isEditingExtractedData ? (
                              <Textarea
                                value={editedDocumentContent?.structured?.conclusion || ''}
                                onChange={(e) => {
                                  const updated = { ...editedDocumentContent };
                                  if (!updated.structured) updated.structured = {};
                                  updated.structured.conclusion = e.target.value;
                                  setEditedDocumentContent(updated);
                                }}
                                className="text-sm min-h-[80px]"
                              />
                            ) : (
                              <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg border border-border">{reviewingDocument.content.structured.conclusion}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Prescription Results */}
                    {reviewingDocument.document_type === 'prescription' && (
                      <div className="space-y-4">
                        {/* Medications */}
                        {(isEditingExtractedData ? editedDocumentContent?.structured?.items : reviewingDocument.content?.structured?.items) && 
                         (isEditingExtractedData ? editedDocumentContent?.structured?.items?.length > 0 : reviewingDocument.content.structured.items.length > 0) && (
                          <div>
                            <h4 className="font-medium text-sm mb-3">Medications</h4>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted">
                                  <tr>
                                    <th className="text-left p-3 font-medium">Drug Name</th>
                                    <th className="text-left p-3 font-medium">Form</th>
                                    <th className="text-left p-3 font-medium">Dose</th>
                                    <th className="text-left p-3 font-medium">Frequency</th>
                                    <th className="text-left p-3 font-medium">Duration</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(isEditingExtractedData ? editedDocumentContent?.structured?.items : reviewingDocument.content.structured.items)?.map((med: any, idx: number) => (
                                    <tr key={idx} className="border-t hover:bg-muted/50">
                                      <td className="p-3">
                                        {isEditingExtractedData ? (
                                          <Input
                                            value={med.drug_name || ''}
                                            onChange={(e) => {
                                              const updated = { ...editedDocumentContent };
                                              if (!updated.structured.items) updated.structured.items = [];
                                              updated.structured.items[idx].drug_name = e.target.value;
                                              setEditedDocumentContent(updated);
                                            }}
                                            className="h-7 text-sm font-medium"
                                          />
                                        ) : (
                                          <span className="font-medium">{med.drug_name || 'Unnamed medication'}</span>
                                        )}
                                      </td>
                                      <td className="p-3">
                                        {isEditingExtractedData ? (
                                          <Input
                                            value={med.form || ''}
                                            onChange={(e) => {
                                              const updated = { ...editedDocumentContent };
                                              updated.structured.items[idx].form = e.target.value;
                                              setEditedDocumentContent(updated);
                                            }}
                                            className="h-7 text-sm"
                                          />
                                        ) : (
                                          med.form || '—'
                                        )}
                                      </td>
                                      <td className="p-3">
                                        {isEditingExtractedData ? (
                                          <Input
                                            value={med.dose || ''}
                                            onChange={(e) => {
                                              const updated = { ...editedDocumentContent };
                                              updated.structured.items[idx].dose = e.target.value;
                                              setEditedDocumentContent(updated);
                                            }}
                                            className="h-7 text-sm"
                                          />
                                        ) : (
                                          med.dose || '—'
                                        )}
                                      </td>
                                      <td className="p-3">
                                        {isEditingExtractedData ? (
                                          <Input
                                            value={med.frequency || ''}
                                            onChange={(e) => {
                                              const updated = { ...editedDocumentContent };
                                              updated.structured.items[idx].frequency = e.target.value;
                                              setEditedDocumentContent(updated);
                                            }}
                                            className="h-7 text-sm"
                                          />
                                        ) : (
                                          med.frequency || '—'
                                        )}
                                      </td>
                                      <td className="p-3">
                                        {isEditingExtractedData ? (
                                          <Input
                                            value={med.duration || ''}
                                            onChange={(e) => {
                                              const updated = { ...editedDocumentContent };
                                              updated.structured.items[idx].duration = e.target.value;
                                              setEditedDocumentContent(updated);
                                            }}
                                            className="h-7 text-sm"
                                          />
                                        ) : (
                                          med.duration || '—'
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Raw JSON for other types or debugging */}
                    {reviewingDocument.document_type !== 'lab' && 
                     reviewingDocument.document_type !== 'radiology' && 
                     reviewingDocument.document_type !== 'prescription' && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Raw Data</h4>
                        <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto">
                          {JSON.stringify(reviewingDocument.content, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-between px-6 py-4 border-t bg-background">
              {reviewingDocument?.review_status === 'reviewed' ? (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await documentsApi.markAsPending(reviewingDocId!);
                      toast.success('Document marked as pending');
                      queryClient.invalidateQueries({ queryKey: ['documents', reviewingDocId] });
                      queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'documents'] });
                      queryClient.invalidateQueries({ queryKey: ['patients', patientId] });
                    } catch (error) {
                      toast.error('Failed to update document');
                    }
                  }}
                  className="gap-2"
                >
                  <Clock className="h-4 w-4" />
                  Mark as Pending
                </Button>
              ) : (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Please review the extracted data before marking as complete
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDocumentSheetOpen(false);
                    setReviewingDocId(null);
                  }}
                >
                  Close
                </Button>
                {reviewingDocument?.review_status !== 'reviewed' && (
                  <Button
                    onClick={async () => {
                      try {
                        await documentsApi.markAsReviewed(reviewingDocId!);
                        toast.success('Document marked as reviewed');
                        queryClient.invalidateQueries({ queryKey: ['documents', reviewingDocId] });
                        queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'documents'] });
                        queryClient.invalidateQueries({ queryKey: ['patients', patientId] });
                        queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
                        setDocumentSheetOpen(false);
                        setReviewingDocId(null);
                      } catch (error) {
                        toast.error('Failed to update document');
                      }
                    }}
                    className="gap-2 bg-black hover:bg-neutral-800"
                  >
                    <Check className="h-4 w-4" />
                    Mark as Reviewed
                  </Button>
                )}
              </div>
            </div>
            </>
          ) : (
            <div className="flex items-center justify-center flex-1">
              <p className="text-muted-foreground">Loading document...</p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Consultation Summary Sheet */}
      <Sheet open={summarySheetOpen} onOpenChange={(open: boolean) => {
        setSummarySheetOpen(open);
        if (!open) {
          setViewingConsultationId(null);
        }
      }}>
        <SheetContent side="right" className="w-[600px] sm:max-w-[600px] p-0 flex flex-col h-full overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="flex items-center gap-3">
              <Stethoscope className="h-5 w-5 text-foreground" />
              Résumé de consultation
            </SheetTitle>
            <SheetDescription>
              Synthèse clinique de la consultation
            </SheetDescription>
          </SheetHeader>
          
          <ScrollArea className="flex-1 min-h-0">
            {summaryLoading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : consultationSummary ? (
              <div className="p-6 space-y-4">
                {/* Date */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarIcon className="h-4 w-4" />
                  <span>
                    {consultationSummary.created_at 
                      ? new Date(consultationSummary.created_at).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })
                      : 'Date non disponible'
                    }
                  </span>
                </div>

                <Separator />

                {/* Render structured JSON (v2) or fallback to plain text (v1) */}
                {(() => {
                  let parsed: any = null;
                  try {
                    parsed = JSON.parse(consultationSummary.summary);
                  } catch {
                    parsed = null;
                  }

                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    // --- Structured V2 summary ---
                    return (
                      <div className="space-y-4">
                        {/* Visit Focus */}
                        {parsed.visit_focus && (
                          <div className="bg-[var(--medicai-green-light)] border border-[var(--medicai-green)]/40 rounded-lg p-4">
                            <h3 className="font-medium text-sm mb-1 flex items-center gap-2">
                              <Target className="h-4 w-4 text-foreground" />
                              Motif de consultation
                            </h3>
                            <p className="text-sm">{parsed.visit_focus}</p>
                          </div>
                        )}

                        {/* HPI */}
                        {parsed.hpi && (
                          <div className="border rounded-lg p-4 space-y-3">
                            <h3 className="font-medium text-sm flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-muted-foreground" />
                              Histoire de la maladie
                            </h3>
                            {parsed.hpi.one_liner && (
                              <p className="text-sm text-foreground bg-muted/50 rounded p-2">{parsed.hpi.one_liner}</p>
                            )}
                            {parsed.hpi.symptoms && parsed.hpi.symptoms.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Symptômes</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {parsed.hpi.symptoms.map((s: any, i: number) => (
                                    <Badge key={i} variant="outline" className="text-xs font-normal">
                                      {s.name}{s.details ? ` — ${s.details}` : ''}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {parsed.hpi.red_flags && parsed.hpi.red_flags.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                  <ShieldAlert className="h-3 w-3" /> Signaux d'alarme
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {parsed.hpi.red_flags.map((rf: any, i: number) => (
                                    <Badge key={i} variant="outline" className={cn(
                                      "text-xs font-normal",
                                      rf.checked === true && "border-destructive/40 text-destructive",
                                      rf.checked === false && "border-border text-muted-foreground line-through"
                                    )}>
                                      {rf.checked === true ? '⚠ ' : rf.checked === false ? '✓ ' : ''}{rf.label}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {parsed.hpi.objective_highlights && parsed.hpi.objective_highlights.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Examens clés</p>
                                <ul className="space-y-0.5">
                                  {parsed.hpi.objective_highlights.map((h: string, i: number) => (
                                    <li key={i} className="text-sm flex items-start gap-1.5">
                                      <ChevronRight className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                                      {h}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {parsed.hpi.since_last_visit && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Depuis la dernière visite</p>
                                {typeof parsed.hpi.since_last_visit === 'string' ? (
                                  <p className="text-sm">{parsed.hpi.since_last_visit}</p>
                                ) : Array.isArray(parsed.hpi.since_last_visit) ? (
                                  <ul className="space-y-0.5">
                                    {(parsed.hpi.since_last_visit as string[]).map((item: string, i: number) => (
                                      <li key={i} className="text-sm flex items-start gap-1.5">
                                        <ChevronRight className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                                        {item}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            )}
                            {parsed.hpi.patient_goal && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                  <Heart className="h-3 w-3" /> Objectif patient
                                </p>
                                <p className="text-sm italic">{parsed.hpi.patient_goal}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Problems */}
                        {parsed.problems && parsed.problems.length > 0 && (
                          <div className="space-y-3">
                            <h3 className="font-medium text-sm flex items-center gap-2">
                              <ClipboardList className="h-4 w-4 text-muted-foreground" />
                              Problèmes ({parsed.problems.length})
                            </h3>
                            {parsed.problems.map((prob: any, idx: number) => (
                              <div key={idx} className="border rounded-lg p-4 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="font-medium text-sm">{prob.title}</h4>
                                  {prob.urgency && (
                                    <Badge variant="outline" className="text-[10px] shrink-0">{prob.urgency}</Badge>
                                  )}
                                </div>
                                {prob.assessment && (
                                  <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">{prob.assessment}</p>
                                )}
                                {prob.evidence && prob.evidence.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Éléments de preuve</p>
                                    <ul className="space-y-0.5">
                                      {prob.evidence.map((e: string, i: number) => (
                                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                          <CheckCircle2 className="h-3 w-3 mt-0.5 text-[var(--medicai-green-dark)] shrink-0" />
                                          {e}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {prob.plan && Object.keys(prob.plan).length > 0 && (
                                  <div className="space-y-2 pt-1">
                                    {Object.entries(prob.plan as Record<string, string[]>).map(([bucket, items]) => {
                                      const bucketLabels: Record<string, string> = {
                                        today: "Aujourd'hui",
                                        orders: "Ordonnances",
                                        treatment: "Traitement",
                                        follow_up: "Suivi",
                                        safety_net: "Sécurité",
                                      };
                                      return (
                                        <div key={bucket}>
                                          <p className="text-xs font-medium text-muted-foreground mb-0.5">
                                            {bucketLabels[bucket] || bucket}
                                          </p>
                                          <ul className="space-y-0.5">
                                            {(items as string[]).map((item: string, i: number) => (
                                              <li key={i} className="text-sm flex items-start gap-1.5">
                                                <span className="text-muted-foreground mt-0.5">•</span>
                                                {item}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Orders */}
                        {parsed.orders && Object.keys(parsed.orders).length > 0 && (
                          <div className="border rounded-lg p-4 space-y-2">
                            <h3 className="font-medium text-sm flex items-center gap-2">
                              <Pill className="h-4 w-4 text-muted-foreground" />
                              Ordonnances & Demandes
                            </h3>
                            {Object.entries(parsed.orders as Record<string, string[]>).map(([key, items]) => {
                              const orderLabels: Record<string, string> = {
                                rx_intents: "Prescriptions",
                                referral_intents: "Orientations",
                                followup_intents: "Suivis",
                                lab_imaging_intents: "Laboratoire / Imagerie",
                              };
                              return (
                                <div key={key}>
                                  <p className="text-xs font-medium text-muted-foreground mb-0.5">
                                    {orderLabels[key] || key}
                                  </p>
                                  <ul className="space-y-0.5">
                                    {(items as string[]).map((item: string, i: number) => (
                                      <li key={i} className="text-sm flex items-start gap-1.5">
                                        <span className="text-muted-foreground mt-0.5">•</span>
                                        {item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Generated documents / files */}
                        {parsed.documents && parsed.documents.length > 0 && (
                          <div className="border rounded-lg p-4 space-y-2">
                            <h3 className="font-medium text-sm flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              Documents générés ({parsed.documents.length})
                            </h3>
                            <div className="space-y-1">
                              {parsed.documents.map((doc: any, i: number) => {
                                const typeLabels: Record<string, string> = {
                                  prescription: 'Ordonnance',
                                  referral_letter: 'Lettre d\'orientation',
                                  followup_plan: 'Plan de suivi',
                                  lab_order: 'Demande d\'examens',
                                  visit_note: 'Note de visite',
                                };
                                const statusLabels: Record<string, string> = {
                                  draft: 'Brouillon',
                                  reviewed: 'Revu',
                                  signed: 'Signé',
                                  sent: 'Envoyé',
                                  delivered: 'Délivré',
                                  failed: 'Échoué',
                                };
                                return (
                                  <div key={i} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2 text-sm">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <span>{typeLabels[doc.type] || doc.type}</span>
                                      {doc.channel && (
                                        <Badge variant="outline" className="text-[10px] h-4 px-1">{doc.channel}</Badge>
                                      )}
                                    </div>
                                    <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                                      {statusLabels[doc.status] || doc.status}
                                    </Badge>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Quick notes */}
                        {parsed.quick_notes && parsed.quick_notes.length > 0 && (
                          <div className="border rounded-lg p-4 space-y-2">
                            <h3 className="font-medium text-sm flex items-center gap-2">
                              <StickyNote className="h-4 w-4 text-muted-foreground" />
                              Notes rapides
                            </h3>
                            <ul className="space-y-1">
                              {parsed.quick_notes.map((n: string, i: number) => (
                                <li key={i} className="text-sm text-muted-foreground">{n}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // --- Legacy plain-text rendering (v1) ---
                  if (consultationSummary.summary) {
                    return (
                      <div className="space-y-4">
                        {consultationSummary.summary.split('\n\n').map((section: string, idx: number) => {
                          const lines = section.split('\n');
                          const firstLine = lines[0] || '';
                          
                          if (firstLine.startsWith('Visit:')) {
                            return (
                              <div key={idx} className="bg-[var(--medicai-green-light)] border border-[var(--medicai-green)]/40 rounded-lg p-4">
                                <h3 className="font-medium text-sm mb-1 flex items-center gap-2">
                                  <Target className="h-4 w-4" />
                                  Motif de consultation
                                </h3>
                                <p className="text-sm">{firstLine.replace('Visit:', '').trim()}</p>
                              </div>
                            );
                          }
                          
                          if (firstLine.startsWith('HPI:')) {
                            return (
                              <div key={idx} className="border rounded-lg p-4">
                                <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
                                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                  Histoire de la maladie
                                </h3>
                                <p className="text-sm">{firstLine.replace('HPI:', '').trim()}</p>
                                {lines.slice(1).filter((l: string) => l.trim()).map((line: string, i: number) => (
                                  <p key={i} className="text-sm text-muted-foreground mt-1">{line}</p>
                                ))}
                              </div>
                            );
                          }
                          
                          if (firstLine.startsWith('Problem:')) {
                            return (
                              <div key={idx} className="border rounded-lg p-4">
                                <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                                  {firstLine.replace('Problem:', '').trim()}
                                </h3>
                                <ul className="space-y-1">
                                  {lines.slice(1).filter((l: string) => l.trim()).map((line: string, i: number) => (
                                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                      <span className="mt-0.5">•</span>
                                      <span>{line.replace(/^\s*-\s*/, '')}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          }
                          
                          return (
                            <div key={idx} className="bg-muted/50 rounded-lg p-4">
                              <p className="text-sm whitespace-pre-wrap">{section}</p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  return (
                    <div className="text-sm text-muted-foreground">
                      Aucun contenu de résumé disponible.
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p>Aucun résumé disponible</p>
                <p className="text-sm mt-1">La consultation n'a peut-être pas encore été complétée.</p>
              </div>
            )}
          </ScrollArea>

          <div className="px-6 py-4 border-t bg-background">
            <Button
              variant="outline"
              onClick={() => {
                setSummarySheetOpen(false);
                setViewingConsultationId(null);
              }}
              className="w-full"
            >
              Fermer
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
