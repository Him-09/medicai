'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  usePatient,
  usePatientSnapshot,
  useChatMessages,
  useSendMessage,
  useConsultation,
  useResetConsultation,
  useConsultationPrep,
  useGenerateWorkspace,
  usePatientChanges,
  usePatientDocuments,
  useConsultations,
  useDocument,
  useUpdateConsultation,
  useUpdateWorkspace,
  useWorkspace,
  useTemplates,
} from '@/lib/hooks';
import { documentsApi, workspaceApi, consultationsApi } from '@/lib/api';
import { SmartInput, OrdersPanel, ScribePanel, VoiceScribe } from '@/components/workspace';
import { OrdoBucket, GenerateSendDrawer } from '@/components/workspace/ordo-system';
import type {
  WorkspaceOrders,
  RxIntent,
  ReferralIntent,
  FollowupIntent,
} from '@/types/orders';
import {
  createRxIntent,
  createReferralIntent,
  createFollowupIntent,
} from '@/types/orders';
import type { OrdoItem, OrdoItemType, OrdoCandidate } from '@/types/ordo';
import {
  createOrdoItemsFromText,
  createOrdoItemFromTextWithType,
  getOrdoTypeIcon,
  getOrdoTypeLabel,
  resolveOrdoCandidates,
} from '@/types/ordo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Send,
  FileText,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  RotateCcw,
  Copy,
  Check,
  X,
  Sparkles,
  Pencil,
  User,
  Calendar,
  Mail,
  Phone,
  Activity,
  Stethoscope,
  ChevronRight,
  Search,
  ChevronDown,
  Plus,
  MoreVertical,
  Printer,
  FileCheck,
  Clock,
  Pill,
  ClipboardList,
  FileImage,
  Mail as MailIcon,
  FileSignature,
  ChevronUp,
  Archive,
  MessageSquare,
  StickyNote,
  Undo2,
  ArrowRight,
  ArrowUp,
  HelpCircle,
  CheckCircle,
  Ban,
  Pin,
  Trash2,
  Mic,
  ExternalLink,
} from 'lucide-react';

type TimelineFilter = 'all' | 'consultations' | 'labs' | 'imaging' | 'prescriptions' | 'documents';

export default function ConsultationWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const consultationId = params.id as string;
  
  const [message, setMessage] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showPrep, setShowPrep] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [showSignConfirm, setShowSignConfirm] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [showInsights, setShowInsights] = useState(true);
  
  // Composer mode: 'ask' for AI chat, 'note' for quick notes
  const [composerMode, setComposerMode] = useState<'ask' | 'note'>('ask');
  const [noteInput, setNoteInput] = useState('');
  
  // Voice mode state
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  
  // Quick actions floating button
  const [showQuickActions, setShowQuickActions] = useState(false);
  
  // Quick commands dropdown
  const [showQuickCommands, setShowQuickCommands] = useState(false);
  const [quickCommandSearch, setQuickCommandSearch] = useState('');
  
  // Undo send state
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [undoTimeout, setUndoTimeout] = useState<NodeJS.Timeout | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const inputRef = useRef<HTMLDivElement>(null);
  const [documentSheetOpen, setDocumentSheetOpen] = useState(false);
  const [reviewingDocId, setReviewingDocId] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isEditingExtractedData, setIsEditingExtractedData] = useState(false);
  const [editedDocumentContent, setEditedDocumentContent] = useState<any>(null);
  const [isSavingExtractedData, setIsSavingExtractedData] = useState(false);
  
  // Consultation workspace state
  const [visitFocus, setVisitFocus] = useState('');
  const [agendaItems, setAgendaItems] = useState([
    { id: 1, text: 'Review symptoms', checked: true },
    { id: 2, text: 'Review labs (anemia)', checked: true },
  ]);
  const [newAgendaItem, setNewAgendaItem] = useState('');
  
  // Separate HPI section states
  const [hpiOneLiner, setHpiOneLiner] = useState('');
  const [hpiSymptoms, setHpiSymptoms] = useState<Array<{name: string, details: string}>>([]);
  const [hpiRedFlags, setHpiRedFlags] = useState<Array<{label: string, checked: boolean | null}>>([]);
  // Since last visit can be string (legacy) or structured array (new format)
  const [hpiSinceLastVisit, setHpiSinceLastVisit] = useState<string | Array<{type: string, label: string, source: any}>>('');
  const [hpiObjectiveHighlights, setHpiObjectiveHighlights] = useState<Array<{text: string, source: string}>>([]);
  const [hpiPatientGoal, setHpiPatientGoal] = useState('');
  
  // Edit states for each HPI section
  const [editingHpiSection, setEditingHpiSection] = useState<string | null>(null);
  const [isSigningConsultation, setIsSigningConsultation] = useState(false);
  
  const [examText, setExamText] = useState('');
  const [followUpText, setFollowUpText] = useState('');
  // Plan item type with optional order linking (old system) or ordo linking (new system)
  type PlanItem = {
    id: string;
    text: string;
    checked: boolean;
    linkedOrderId?: string; // Links to a converted order (old intent system)
    linkedOrdoId?: string;  // Links to structured Ordo item (new system)
    linkedOrdoIds?: string[]; // Links to multiple Ordo items when text contains multiple intents
  };
  
  // Problem state - preserves structured plan buckets from generator
  const [problems, setProblems] = useState<Array<{
    id: string;
    title: string;
    urgency?: string;
    assessment?: string;
    evidence: Array<{label: string; docId?: string; date?: string; type?: string}>;
    plan: {
      today: Array<PlanItem>;
      orders: Array<PlanItem>;
      treatment: Array<PlanItem>;
      follow_up: Array<PlanItem>;
      safety_net: Array<PlanItem>;
    };
    sources: string[];
    // Track enrichment origin for hybrid KB/LLM approach
    enrichmentOrigin?: 'knowledge_base' | 'llm_generated' | 'default_template';
    requiresReview?: boolean;
  }>>([]);
  // Active plan tab per problem
  const [activePlanTabs, setActivePlanTabs] = useState<Record<string, string>>({});
  // Track which problems are being enriched (Fill button loading state)
  const [enrichingProblems, setEnrichingProblems] = useState<Set<string>>(new Set());
  // Last A&P destination (remembers user's last selection)
  const [lastAPDestination, setLastAPDestination] = useState<{problemId: string; bucket: string} | null>(null);
  // Regenerate mode: 'merge' (default) fills empty, appends evidence; 'overwrite' replaces all
  const [regenerateMode, setRegenerateMode] = useState<'merge' | 'overwrite'>('merge');
  const [showForceOverwriteConfirm, setShowForceOverwriteConfirm] = useState(false);
  const [quickNotes, setQuickNotes] = useState<Array<{id: number, timestamp: string, text: string}>>([]);
  const [newQuickNote, setNewQuickNote] = useState('');
  // Orders state - new intent-based architecture
  const [workspaceOrders, setWorkspaceOrders] = useState<WorkspaceOrders>({
    rx_intents: [],
    referral_intents: [],
    followup_intents: [],
    lab_imaging_intents: [],
    documents: [],
    pending_actions: [],
  });
  // New structured Ordo items (medications, labs, imaging, procedures)
  const [ordoItems, setOrdoItems] = useState<OrdoItem[]>([]);
  const [showGenerateSendDrawer, setShowGenerateSendDrawer] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    agenda: true,
    hpi: true,
    exam: false,
    problems: true,
    quickNotes: true,
    orders: true,
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wordBufferRef = useRef('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [workspaceVersion, setWorkspaceVersion] = useState(0); // Track regeneration
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const workspaceGenerationAttemptedRef = useRef(false);
  const lastFilledVersionRef = useRef(-1); // Track which version we last filled from

  // Get consultation to find patient ID
  const { data: consultation } = useConsultation(consultationId);
  const patientId = consultation?.patientId?.replace('#', '') || 'patient1';

  const { data: patient } = usePatient(patientId);
  const { data: snapshot } = usePatientSnapshot(patientId);
  const { data: patientChanges } = usePatientChanges(patientId, consultationId);
  const { data: patientDocuments } = usePatientDocuments(patientId);
  const { data: allConsultations } = useConsultations();
  const { data: reviewingDocument } = useDocument(reviewingDocId || '');
  const { mutate: updateConsultation } = useUpdateConsultation();
  const queryClient = useQueryClient();
  const { mutate: getPrep, data: prepData, isPending: isPreparing } = useConsultationPrep(consultationId);
  const { data: chatHistory } = useChatMessages(consultationId);
  const { mutate: sendMessage, isPending: isSending } = useSendMessage(consultationId);
  const { mutate: resetConsultation, isPending: isResetting } = useResetConsultation();
  const { mutate: generateWorkspace, isPending: isGeneratingWorkspace } = useGenerateWorkspace(consultationId);
  const { data: workspaceData } = useWorkspace(consultationId);
  const { mutate: saveWorkspace } = useUpdateWorkspace(consultationId);
  
  // Fetch templates for order generation
  const { data: templates = [] } = useTemplates();

  // Calculate age from DOB
  const calculateAge = (dob: string) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const patientAge = patient?.dob ? calculateAge(patient.dob) : patient?.age;

  // Helper to convert a plan item to an order intent (new architecture)
  const handleConvertToOrder = (
    problemId: string,
    problemTitle: string,
    planItemId: string,
    planItemText: string,
    bucket: string,
    orderType: 'ordonnance' | 'referral' | 'follow_up'
  ) => {
    let newIntentId: string;
    
    if (orderType === 'ordonnance') {
      // Create RxIntent with the plan item as a medication placeholder
      const newIntent = createRxIntent({
        medications: [{
          id: crypto.randomUUID(),
          name: planItemText,
          dosage: '',
          form: 'comprimé',
          frequency: '',
          duration: '',
        }],
        source_problem_id: problemId,
        source_plan_item_ids: [planItemId],
      });
      newIntentId = newIntent.id;
      setWorkspaceOrders(prev => ({
        ...prev,
        rx_intents: [...prev.rx_intents, newIntent],
      }));
    } else if (orderType === 'referral') {
      // Create ReferralIntent
      const newIntent = createReferralIntent({
        to_specialty: '',
        reason: planItemText,
        clinical_summary: problemTitle,
        source_problem_id: problemId,
        source_plan_item_ids: [planItemId],
      });
      newIntentId = newIntent.id;
      setWorkspaceOrders(prev => ({
        ...prev,
        referral_intents: [...prev.referral_intents, newIntent],
      }));
    } else {
      // Create FollowupIntent
      const newIntent = createFollowupIntent({
        reason: planItemText,
        focus_items: [problemTitle],
        source_problem_id: problemId,
        source_plan_item_ids: [planItemId],
      });
      newIntentId = newIntent.id;
      setWorkspaceOrders(prev => ({
        ...prev,
        followup_intents: [...prev.followup_intents, newIntent],
      }));
    }
    
    // Link the plan item to the order intent
    setProblems(prev => prev.map(p =>
      p.id === problemId
        ? {
            ...p,
            plan: {
              ...p.plan,
              [bucket]: p.plan[bucket as keyof typeof p.plan].map(item =>
                item.id === planItemId ? { ...item, linkedOrderId: newIntentId } : item
              )
            }
          }
        : p
    ));
    
    const typeLabel = orderType === 'ordonnance' ? 'ordonnance' : orderType === 'referral' ? 'référence' : 'suivi';
    toast.success(`Converti en ${typeLabel}`);
  };

  // Smart conversion of plan item to structured Ordo item (new system)
  const handleSmartConvertToOrdo = (
    problemId: string,
    planItemId: string,
    planItemText: string,
    bucket: string,
    options?: { forcedType?: OrdoItemType; ctxProblemTitle?: string }
  ) => {
    const text = planItemText.trim();
    if (!text) return;

    const ctx = { bucket, problemTitle: options?.ctxProblemTitle };
    const newItems = options?.forcedType
      ? [createOrdoItemFromTextWithType(text, options.forcedType, problemId, planItemId, ctx)]
      : createOrdoItemsFromText(text, problemId, planItemId, ctx);

    if (newItems.length === 0) {
      toast.error('Conversion impossible', { description: 'Texte trop ambigu ou vide' });
      return;
    }

    const newIds = newItems.map(i => i.id);
    setOrdoItems(prev => [...prev, ...newItems]);

    // Link the plan item to the Ordo item(s)
    setProblems(prev => prev.map(p =>
      p.id === problemId
        ? {
            ...p,
            plan: {
              ...p.plan,
              [bucket]: p.plan[bucket as keyof typeof p.plan].map(item =>
                item.id === planItemId
                  ? { ...item, linkedOrdoId: newIds[0], linkedOrdoIds: newIds }
                  : item
              )
            }
          }
        : p
    ));

    // Feedback
    const first = newItems[0];
    const typeIcon = getOrdoTypeIcon(first.type);
    if (newItems.length === 1) {
      toast.success(`${typeIcon} Converti en ${getOrdoTypeLabel(first.type)}`, {
        description: 'Ouvrez Ordo pour compléter les champs'
      });
    } else {
      toast.success(`📄 Converti en ${newItems.length} éléments`, {
        description: 'Plusieurs intentions détectées (split)'
      });
    }
  };

  // Load consultation name into visit focus
  useEffect(() => {
    if (consultation?.name) {
      setVisitFocus(consultation.name);
    }
  }, [consultation?.name]);

  // Sync visitFocus changes back to consultation name (debounced)
  useEffect(() => {
    // Skip if visitFocus matches current consultation name (avoid unnecessary updates)
    if (!visitFocus || visitFocus === consultation?.name) return;

    const timer = setTimeout(() => {
      updateConsultation({
        id: consultationId,
        data: { name: visitFocus }
      }, {
        onSuccess: () => {
          // Invalidate consultation query to refresh the data
          queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] });
        },
      });
    }, 2000); // 2 second debounce

    return () => clearTimeout(timer);
  }, [visitFocus, consultationId, consultation?.name, updateConsultation, queryClient]);

  // Auto-fill workspace from workspace API data
  useEffect(() => {
    // Fill if: (1) new version OR (2) data loaded but never filled (page reload)
    const shouldFill = workspaceData && (
      lastFilledVersionRef.current !== workspaceVersion ||
      lastFilledVersionRef.current === -1
    );
    
    if (shouldFill) {
      lastFilledVersionRef.current = workspaceVersion;
      
      // 1. Visit Focus - always update from workspace data
      if (workspaceData.visit_focus) {
        setVisitFocus(workspaceData.visit_focus);
      }
      
      // 2. Agenda
      if (workspaceData.agenda && workspaceData.agenda.length > 0) {
        setAgendaItems(workspaceData.agenda);
      }
      
      // 3. HPI - store structured data
      if (workspaceData.hpi) {
        const hpi = workspaceData.hpi;
        
        setHpiOneLiner(hpi.one_liner || '');
        setHpiSymptoms(hpi.symptoms || []);
        setHpiRedFlags((hpi.red_flags || []).map((rf: any) => ({
          label: rf.label,
          checked: rf.checked ?? null
        })));
        setHpiSinceLastVisit(hpi.since_last_visit || '');
        setHpiObjectiveHighlights(hpi.objective_highlights || []);
        setHpiPatientGoal(hpi.patient_goal || '');
      }
      
      // 4. Problems - preserve structured plan buckets and UUIDs from generator
      if (workspaceData.problems && workspaceData.problems.length > 0) {
        const problemsFromWorkspace = workspaceData.problems.map((prob: any) => ({
          id: prob.id, // Preserve UUID from generator
          title: prob.title, // Keep title pure - urgency rendered as badge only
          urgency: prob.urgency,
          assessment: prob.assessment,
          evidence: prob.evidence || [],
          plan: {
            // Preserve plan buckets structure with original UUIDs AND linkedOrderId/linkedOrdoId
            today: (prob.plan.today || []).map((item: any) => ({
              id: item.id, // Keep generator UUID
              text: item.text,
              checked: item.checked ?? false,
              linkedOrderId: item.linkedOrderId, // Preserve order link (old)
              linkedOrdoId: item.linkedOrdoId, // Preserve ordo link (new)
              linkedOrdoIds: item.linkedOrdoIds, // Preserve multi-ordo links
            })),
            orders: (prob.plan.orders || []).map((item: any) => ({
              id: item.id,
              text: item.text,
              checked: item.checked ?? false,
              linkedOrderId: item.linkedOrderId,
              linkedOrdoId: item.linkedOrdoId,
              linkedOrdoIds: item.linkedOrdoIds,
            })),
            treatment: (prob.plan.treatment || []).map((item: any) => ({
              id: item.id,
              text: item.text,
              checked: item.checked ?? false,
              linkedOrderId: item.linkedOrderId,
              linkedOrdoId: item.linkedOrdoId,
              linkedOrdoIds: item.linkedOrdoIds,
            })),
            follow_up: (prob.plan.follow_up || []).map((item: any) => ({
              id: item.id,
              text: item.text,
              checked: item.checked ?? false,
              linkedOrderId: item.linkedOrderId,
              linkedOrdoId: item.linkedOrdoId,
              linkedOrdoIds: item.linkedOrdoIds,
            })),
            safety_net: (prob.plan.safety_net || []).map((item: any) => ({
              id: item.id,
              text: item.text,
              checked: item.checked ?? false,
              linkedOrderId: item.linkedOrderId,
              linkedOrdoId: item.linkedOrdoId,
              linkedOrdoIds: item.linkedOrdoIds,
            })),
          },
          sources: prob.sources || [],
          // Preserve enrichment tracking fields
          enrichmentOrigin: prob.enrichmentOrigin,
          requiresReview: prob.requiresReview,
        }));
        
        setProblems(problemsFromWorkspace);
        
        // Initialize active tabs for each problem
        const initialTabs: Record<string, string> = {};
        problemsFromWorkspace.forEach((p: any) => {
          initialTabs[p.id] = 'today'; // Default to Today tab
        });
        setActivePlanTabs(initialTabs);
      }
      
      // 5. Workspace Orders - load intents from workspace (new architecture)
      if (workspaceData.workspaceOrders) {
        setWorkspaceOrders({
          rx_intents: workspaceData.workspaceOrders.rx_intents || [],
          referral_intents: workspaceData.workspaceOrders.referral_intents || [],
          followup_intents: workspaceData.workspaceOrders.followup_intents || [],
          lab_imaging_intents: workspaceData.workspaceOrders.lab_imaging_intents || [],
          documents: workspaceData.workspaceOrders.documents || [],
          pending_actions: workspaceData.workspaceOrders.pending_actions || [],
        });
      } else if (workspaceData.orders && workspaceData.orders.length > 0) {
        // Legacy migration: convert old orders to intents
        const rxIntents: RxIntent[] = [];
        const referralIntents: ReferralIntent[] = [];
        const followupIntents: FollowupIntent[] = [];
        
        workspaceData.orders.forEach((order: any) => {
          const orderType = order.type || 'ordonnance';
          if (orderType === 'ordonnance' || orderType === 'prescription') {
            rxIntents.push(createRxIntent({
              id: order.id,
              medications: [{
                id: crypto.randomUUID(),
                name: order.title,
                dosage: '',
                form: 'comprimé',
                frequency: '',
                duration: '',
              }],
              source_problem_id: order.sourceProblemId || order.problemId,
              source_plan_item_ids: order.sourcePlanItemId ? [order.sourcePlanItemId] : [],
              created_at: order.createdAt || new Date().toISOString(),
            }));
          } else if (orderType === 'referral') {
            referralIntents.push(createReferralIntent({
              id: order.id,
              reason: order.title,
              clinical_summary: order.details || '',
              source_problem_id: order.sourceProblemId || order.problemId,
              source_plan_item_ids: order.sourcePlanItemId ? [order.sourcePlanItemId] : [],
              created_at: order.createdAt || new Date().toISOString(),
            }));
          } else if (orderType === 'follow_up') {
            followupIntents.push(createFollowupIntent({
              id: order.id,
              reason: order.title,
              focus_items: order.sourceProblemTitle ? [order.sourceProblemTitle] : [],
              source_problem_id: order.sourceProblemId || order.problemId,
              source_plan_item_ids: order.sourcePlanItemId ? [order.sourcePlanItemId] : [],
              created_at: order.createdAt || new Date().toISOString(),
            }));
          }
        });
        
        setWorkspaceOrders({
          rx_intents: rxIntents,
          referral_intents: referralIntents,
          followup_intents: followupIntents,
          lab_imaging_intents: [],
          documents: [],
          pending_actions: [],
        });
      }
      
      // 6. Load structured Ordo items
      if (workspaceData.ordoItems && workspaceData.ordoItems.length > 0) {
        setOrdoItems(workspaceData.ordoItems);
      }
    }
  }, [workspaceData, workspaceVersion]); // Need both to trigger on data load AND regeneration

  // Sync contenteditable div with state
  useEffect(() => {
    if (inputRef.current) {
      const currentValue = composerMode === 'ask' ? message : noteInput;
      // Always update to ensure placeholder works correctly
      if (!currentValue) {
        // Ensure completely empty for placeholder to show
        inputRef.current.textContent = '';
      } else if (inputRef.current.textContent !== currentValue) {
        inputRef.current.textContent = currentValue;
      }
    }
  }, [message, noteInput, composerMode]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Auto-save workspace changes with debouncing
  useEffect(() => {
    // Skip autosave if workspace hasn't been loaded yet
    if (lastFilledVersionRef.current === -1) return;
    
    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    
    // Debounce save by 2 seconds after last change
    saveTimerRef.current = setTimeout(() => {
      saveWorkspace({
        visit_focus: visitFocus,
        agenda: agendaItems,
        hpi: {
          one_liner: hpiOneLiner,
          symptoms: hpiSymptoms,
          red_flags: hpiRedFlags,
          since_last_visit: hpiSinceLastVisit,
          objective_highlights: hpiObjectiveHighlights,
          patient_goal: hpiPatientGoal,
        },
        problems: problems,
        quick_notes: quickNotes,
        orders: workspaceOrders,
      });
    }, 2000);
  }, [
    visitFocus,
    agendaItems,
    hpiOneLiner,
    hpiSymptoms,
    hpiRedFlags,
    hpiSinceLastVisit,
    hpiObjectiveHighlights,
    hpiPatientGoal,
    problems,
    quickNotes,
    workspaceOrders,
    saveWorkspace,
  ]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatHistory, isSending, streamingMessage]);

  // Keyboard shortcuts for doctor productivity
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      const isTyping = ['INPUT', 'TEXTAREA'].includes(target.tagName) ||
                       target.isContentEditable ||
                       target.contentEditable === 'true';
      
      // Ctrl/Cmd + key shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 's': // Save / Sign
            if (e.shiftKey && !isTyping) {
              e.preventDefault();
              setShowSignConfirm(true);
            }
            break;
          case 'g': // Generate workspace
            if (!isTyping) {
              e.preventDefault();
              if (!isGeneratingWorkspace) {
                generateWorkspace({}, {
                  onSuccess: () => {
                    setWorkspaceVersion(prev => prev + 1);
                    toast.success('Espace de travail généré');
                  }
                });
              }
            }
            break;
          case 'q': // Switch to Ask mode (Ctrl+Q for Query/Question)
            if (!isTyping) {
              e.preventDefault();
              setComposerMode('ask');
              setTimeout(() => inputRef.current?.focus(), 0);
            }
            break;
          case 'n': // Switch to Note mode (Ctrl+Shift+N to avoid conflict)
            if (e.shiftKey && !isTyping) {
              e.preventDefault();
              setComposerMode('note');
              setTimeout(() => inputRef.current?.focus(), 0);
            }
            break;
          case 'o': // Open Ordo bucket
            if (!isTyping) {
              e.preventDefault();
              setShowGenerateSendDrawer(true);
            }
            break;
        }
      }
      
      // Escape key
      if (e.key === 'Escape') {
        setShowQuickActions(false);
        setEditingHpiSection(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGeneratingWorkspace, generateWorkspace]);

  const handleSignConsultation = async () => {
    if (!consultationId || !patientId) return;

    setIsSigningConsultation(true);
    try {
      // First, save current workspace state with orders
      const workspaceState = {
        patient_id: patientId,
        visit_focus: visitFocus,
        agenda: agendaItems,
        hpi: {
          one_liner: hpiOneLiner,
          symptoms: hpiSymptoms,
          red_flags: hpiRedFlags,
          since_last_visit: hpiSinceLastVisit,
          objective_highlights: hpiObjectiveHighlights,
          patient_goal: hpiPatientGoal,
        },
        problems: problems,
        quick_notes: quickNotes,
        workspaceOrders: workspaceOrders, // Use new intent-based orders
      };

      // Save workspace
      await saveWorkspace(workspaceState);

      // Sign the consultation using apiClient (includes auth token)
      const response = await consultationsApi.sign(consultationId, { workspaceOrders });

      const rxCount = workspaceOrders.rx_intents.length;
      if (rxCount > 0) {
        toast.success(`Consultation signée ! ${rxCount} ordonnance${rxCount > 1 ? 's' : ''} prête${rxCount > 1 ? 's' : ''} à envoyer.`);
      } else {
        toast.success('Consultation signée avec succès !');
      }
      
      // Redirect to consultations list
      setTimeout(() => {
        router.push('/consultations');
      }, 1000);
    } catch (error) {
      console.error('Failed to sign consultation:', error);
      toast.error('Échec de la signature');
    } finally {
      setIsSigningConsultation(false);
    }
  };

  // Handle enriching a problem with clinical content (Fill button)
  const handleEnrichProblem = async (problem: typeof problems[0]) => {
    if (!consultationId) return;
    
    // Mark problem as being enriched
    setEnrichingProblems(prev => new Set(prev).add(problem.id));
    
    try {
      const enrichedData = await workspaceApi.enrichProblem(
        consultationId,
        problem.id,
        problem.title,
        problem.evidence,
        problem.urgency
      );
      
      // Use functional state update to ensure we have the latest problems array
      setProblems(currentProblems => {
        const updatedProblems = currentProblems.map(p => {
          if (p.id !== problem.id) return p;
          
          return {
            ...p,
            assessment: enrichedData.assessment || p.assessment,
            // Track if this problem's content was LLM-generated
            enrichmentOrigin: enrichedData.origin,
            requiresReview: enrichedData.requires_review,
            plan: {
              today: enrichedData.plan?.today?.length > 0 
                ? enrichedData.plan.today.map((item: any) => ({
                    id: item.id || crypto.randomUUID(),
                    text: item.text,
                    checked: item.checked ?? false
                  }))
                : p.plan.today,
              orders: enrichedData.plan?.orders?.length > 0
                ? enrichedData.plan.orders.map((item: any) => ({
                    id: item.id || crypto.randomUUID(),
                    text: item.text,
                    checked: item.checked ?? false
                  }))
                : p.plan.orders,
              treatment: enrichedData.plan?.treatment?.length > 0
                ? enrichedData.plan.treatment.map((item: any) => ({
                    id: item.id || crypto.randomUUID(),
                    text: item.text,
                    checked: item.checked ?? false
                  }))
                : p.plan.treatment,
              follow_up: enrichedData.plan?.follow_up?.length > 0
                ? enrichedData.plan.follow_up.map((item: any) => ({
                    id: item.id || crypto.randomUUID(),
                    text: item.text,
                    checked: item.checked ?? false
                  }))
                : p.plan.follow_up,
              safety_net: enrichedData.plan?.safety_net?.length > 0
                ? enrichedData.plan.safety_net.map((item: any) => ({
                    id: item.id || crypto.randomUUID(),
                    text: item.text,
                    checked: item.checked ?? false
                  }))
                : p.plan.safety_net,
            }
          };
        });
        
        // Save workspace with updated problems
        saveWorkspace({
          visit_focus: visitFocus,
          agenda: agendaItems,
          hpi: {
            one_liner: hpiOneLiner,
            symptoms: hpiSymptoms,
            red_flags: hpiRedFlags,
            since_last_visit: hpiSinceLastVisit,
            objective_highlights: hpiObjectiveHighlights,
            patient_goal: hpiPatientGoal,
          },
          problems: updatedProblems,
          quick_notes: quickNotes,
          orders: workspaceOrders,
        });
        
        return updatedProblems;
      });
      
      // Also update HPI red flags if returned
      if (enrichedData.red_flags?.length > 0) {
        setHpiRedFlags(prev => {
          const existingLabels = new Set(prev.map(rf => rf.label));
          const newFlags = enrichedData.red_flags
            .filter((rf: any) => !existingLabels.has(rf.label))
            .map((rf: any) => ({ label: rf.label, checked: rf.checked ?? null }));
          return [...prev, ...newFlags];
        });
      }
      
      // Update HPI symptoms if returned
      if (enrichedData.symptoms?.length > 0) {
        setHpiSymptoms(prev => {
          const existingNames = new Set(prev.map(s => s.name));
          const newSymptoms = enrichedData.symptoms
            .filter((s: any) => !existingNames.has(s.name))
            .map((s: any) => ({ name: s.name, details: s.details || '' }));
          return [...prev, ...newSymptoms];
        });
      }
      
      // Show different toast based on origin
      if (enrichedData.requires_review) {
        toast.info(`Contenu IA généré pour "${problem.title}" (vérification recommandée)`, {
          duration: 5000,
        });
      } else {
        toast.success(`Contenu clinique ajouté pour "${problem.title}"`);
      }
    } catch (error) {
      console.error('Failed to enrich problem:', error);
      toast.error('Échec du remplissage du contenu clinique');
    } finally {
      // Remove from enriching set
      setEnrichingProblems(prev => {
        const next = new Set(prev);
        next.delete(problem.id);
        return next;
      });
    }
  };

  // Handle filling all problems with clinical content
  const handleFillAllProblems = async () => {
    if (!consultationId || problems.length === 0) return;
    
    toast.info(`Remplissage de ${problems.length} problème${problems.length !== 1 ? 's' : ''}...`);
    
    // Enrich all problems in parallel
    const enrichPromises = problems.map(problem => handleEnrichProblem(problem));
    
    try {
      await Promise.all(enrichPromises);
      toast.success('Tous les problèmes remplis avec succès');
    } catch (error) {
      // Individual errors are already handled in handleEnrichProblem
      console.error('Some problems failed to enrich:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !consultationId) return;

    const userMessage = message;
    setMessage('');
    setStreamingMessage('');
    setIsStreaming(true);
    wordBufferRef.current = '';

    try {
      await sendMessage(
        { 
          patientId, 
          text: userMessage,
          onToken: (token: string) => {
            // Word-by-word buffering
            wordBufferRef.current += token;
            const words = wordBufferRef.current.split(' ');
            
            // Keep last partial word in buffer
            wordBufferRef.current = words.pop() || '';
            
            // Commit complete words to UI
            if (words.length > 0) {
              const newWords = words.join(' ') + ' ';
              setStreamingMessage(prev => prev + newWords);
            }
          },
        },
        {
          onSuccess: () => {
            // Flush any remaining buffer
            if (wordBufferRef.current) {
              setStreamingMessage(prev => prev + wordBufferRef.current);
            }
            
            setTimeout(() => {
              setIsStreaming(false);
              setStreamingMessage('');
              wordBufferRef.current = '';
            }, 500);
          },
          onError: () => {
            setIsStreaming(false);
            setStreamingMessage('');
            wordBufferRef.current = '';
          },
        }
      );
    } catch (error) {
      console.error('Send message error:', error);
      setIsStreaming(false);
      setStreamingMessage('');
      wordBufferRef.current = '';
    }
  };

  // Handle sending Ask message with undo capability
  const handleSendWithUndo = () => {
    if (!message.trim() || !consultationId) return;
    
    const msgToSend = message;
    setMessage('');
    setPendingMessage(msgToSend);
    
    // Set single 1.5s timeout (same as ECG animation duration)
    const timeout = setTimeout(() => {
      setPendingMessage(null);
      // Actually send the message
      setMessage(msgToSend);
      setTimeout(() => handleSendMessage(), 0);
      setMessage('');
    }, 1500);
    
    setUndoTimeout(timeout);
  };

  // Cancel pending message
  const handleUndoSend = () => {
    if (undoTimeout) {
      clearTimeout(undoTimeout);
      setUndoTimeout(null);
    }
    if (pendingMessage) {
      setMessage(pendingMessage);
      setPendingMessage(null);
      toast.success('Message annulé');
    }
  };

  // Handle adding a quick note from composer
  const handleAddNote = () => {
    if (!noteInput.trim()) return;
    
    const newNote = {
      id: Date.now(),
      timestamp: format(new Date(), 'h:mm a'),
      text: noteInput.trim(),
    };
    
    setQuickNotes(prev => [...prev, newNote]);
    setNoteInput('');
    toast.success('Note ajoutée');
    
    // Focus back on input
    inputRef.current?.focus();
  };

  // Insert content into a specific Now strip destination
  const handleInsertToNowStrip = (content: string, destination: 'oneliner' | 'symptom' | 'redflag' | 'evidence') => {
    switch (destination) {
      case 'oneliner':
        setHpiOneLiner(prev => prev ? `${prev} ${content}` : content);
        toast.success('Ajouté au résumé');
        break;
      case 'symptom':
        setHpiSymptoms(prev => [...prev, { name: content.slice(0, 50), details: content }]);
        toast.success('Ajouté comme symptôme');
        break;
      case 'redflag':
        setHpiRedFlags(prev => [...prev, { label: content.slice(0, 40), checked: null }]);
        toast.success('Ajouté comme signal d\'alarme');
        break;
      case 'evidence':
        setHpiObjectiveHighlights(prev => [...prev, { text: content, source: 'manual' }]);
        toast.success('Ajouté aux preuves');
        break;
    }
  };

  // Add content to a specific problem + bucket
  const handleAddToAP = (content: string, problemId: string, bucket: string) => {
    setProblems(prev => prev.map(p =>
      p.id === problemId
        ? {
            ...p,
            plan: {
              ...p.plan,
              [bucket]: [...p.plan[bucket as keyof typeof p.plan], {
                id: crypto.randomUUID(),
                text: content.slice(0, 300),
                checked: false
              }]
            }
          }
        : p
    ));
    setLastAPDestination({ problemId, bucket });
    toast.success(`Added to ${bucket}`);
  };

  // Keyboard shortcuts for composer mode
  // A/N switch only when composer is focused AND empty, or with Ctrl modifier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isComposerFocused = activeElement === inputRef.current;
      const composerValue = composerMode === 'ask' ? message : noteInput;
      const isComposerEmpty = !composerValue.trim();
      
      // Ctrl+A / Ctrl+N always work (safe override)
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          setComposerMode('ask');
          setTimeout(() => inputRef.current?.focus(), 0);
          return;
        } else if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          setComposerMode('note');
          setTimeout(() => inputRef.current?.focus(), 0);
          return;
        }
      }
      
      // A/N without modifier only when composer focused AND empty
      if (isComposerFocused && isComposerEmpty) {
        if (e.key.toLowerCase() === 'a' && composerMode !== 'ask') {
          e.preventDefault();
          setComposerMode('ask');
        } else if (e.key.toLowerCase() === 'n' && composerMode !== 'note') {
          e.preventDefault();
          setComposerMode('note');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [composerMode, message, noteInput]);

  const handlePrepConsultation = () => {
    getPrep();
  };

  // Auto-generate workspace on consultation load (only once)
  useEffect(() => {
    if (consultationId && patientId && !workspaceGenerationAttemptedRef.current && !isGeneratingWorkspace) {
      workspaceGenerationAttemptedRef.current = true;
      generateWorkspace({ force: false, mode: 'merge' });
    }
  }, [consultationId, patientId, isGeneratingWorkspace, generateWorkspace]);

  // Auto-save workspace with debouncing (2 seconds after last change)
  useEffect(() => {
    // Skip auto-save during workspace generation to prevent race condition
    if (!workspaceData || !patientId || isGeneratingWorkspace) return;

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Set new timer
    saveTimerRef.current = setTimeout(() => {
      const workspaceState = {
        patient_id: patientId,
        visit_focus: visitFocus,
        agenda: agendaItems,
        hpi: {
          one_liner: hpiOneLiner,
          symptoms: hpiSymptoms,
          red_flags: hpiRedFlags,
          since_last_visit: hpiSinceLastVisit,
          objective_highlights: hpiObjectiveHighlights,
          patient_goal: hpiPatientGoal,
        },
        problems: problems,
        quick_notes: quickNotes,
        workspaceOrders: workspaceOrders, // Use new intent-based orders
        ordoItems: ordoItems, // Structured Ordo items (medications, labs, imaging, procedures)
      };

      saveWorkspace(workspaceState, {
        onError: (error) => {
          console.error('Failed to auto-save workspace:', error);
        },
      });
    }, 2000); // 2 second debounce

    // Cleanup
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    visitFocus,
    agendaItems,
    hpiOneLiner,
    hpiSymptoms,
    hpiRedFlags,
    hpiSinceLastVisit,
    hpiObjectiveHighlights,
    hpiPatientGoal,
    problems,
    quickNotes,
    workspaceOrders,
    ordoItems,
    patientId,
    saveWorkspace,
    isGeneratingWorkspace,
  ]);

  useEffect(() => {
    if (prepData) {
      setShowPrep(true);
    }
  }, [prepData]);

  const handleCopyMessage = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!patient) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  const initials = patient.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  // Build timeline from real data
  interface TimelineItem {
    id: string;
    date: string;
    dateObj: Date;
    type: string;
    title: string;
    description?: string;
    patient: string;
    patientId: string;
    documents: number;
    status?: string;
    review_status?: 'pending' | 'reviewed';
  }

  const timelineItems: TimelineItem[] = [];

  // Add patient's consultations to timeline
  if (allConsultations) {
    const patientConsultations = allConsultations.filter(
      (c) => c.patientId === `#${patientId}`
    );
    patientConsultations.forEach((consultation) => {
      const date = consultation.consultationTime 
        ? new Date(consultation.consultationTime)
        : consultation.createdAt
        ? new Date(consultation.createdAt)
        : new Date();
      
      timelineItems.push({
        id: consultation.id,
        date: format(date, 'MMM. d, yyyy'),
        dateObj: date,
        type: 'consultation',
        title: 'Follow-up consultation',
        description: `Status: ${consultation.status}`,
        patient: patient.name,
        patientId: patient.patientId,
        documents: consultation.documentsCount || 0,
        status: consultation.status,
      });
    });
  }

  // Add patient's documents to timeline
  if (patientDocuments && patientDocuments.length > 0) {
    patientDocuments.forEach((doc) => {
      const dateStr = doc.date_of_service || doc.doc_date;
      if (!dateStr) return;
      
      const date = new Date(dateStr);
      let type = 'document';
      let title = doc.document_type || 'Document';
      
      // Map document types to timeline types - normalize the type names
      const docType = doc.document_type?.toLowerCase() || '';
      if (docType.includes('lab')) {
        type = 'lab';
        title = 'Lab Report';
      } else if (docType.includes('radiology') || docType.includes('imaging')) {
        type = 'imaging';
        title = 'Radiology Report';
      } else if (docType.includes('prescription')) {
        type = 'prescription';
        title = 'Prescription';
      } else {
        // Keep the original document type as title for other types
        title = doc.document_type || 'Document';
      }
      
      timelineItems.push({
        id: doc.doc_id,
        date: format(date, 'MMM. d, yyyy'),
        dateObj: date,
        type,
        title,
        description: '',
        patient: patient.name,
        patientId: patient.patientId,
        documents: 0,
        review_status: doc.review_status,
      });
    });
  }

  // Sort timeline items by date (newest first)
  timelineItems.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

  // Filter timeline items
  const filteredTimelineItems = timelineItems.filter(item => {
    // Filter by type
    if (timelineFilter === 'consultations' && item.type !== 'consultation') return false;
    if (timelineFilter === 'labs' && item.type !== 'lab') return false;
    if (timelineFilter === 'imaging' && item.type !== 'imaging') return false;
    if (timelineFilter === 'prescriptions' && item.type !== 'prescription') return false;
    if (timelineFilter === 'documents' && item.type !== 'document') return false;
    
    // Filter by search
    if (timelineSearch && !item.title.toLowerCase().includes(timelineSearch.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  // Group by date
  const groupedTimeline = filteredTimelineItems.reduce((acc: any, item) => {
    if (!acc[item.date]) {
      acc[item.date] = [];
    }
    acc[item.date].push(item);
    return acc;
  }, {});

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* LEFT COLUMN - Timeline Section */}
      <div className={`${showTimeline ? 'w-[15%] min-w-[250px]' : 'w-10'} bg-background border-r flex flex-col transition-all duration-300`}>
        {showTimeline ? (
          <>
        {/* Fixed Header */}
        <div className="flex-shrink-0 border-b bg-background">
          {/* Title */}
          <div className="px-4 py-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Chronologie</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowTimeline(false)}
              className="h-7 w-7"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
          </div>
          
          {/* Filter Tabs */}
          <div className="px-3 pb-3">
            <div className="w-full grid grid-cols-4 h-9 gap-1 bg-muted/50 p-1 rounded-lg">
              <button
                onClick={() => setTimelineFilter('all')}
                className={`text-xs rounded-md transition-all ${
                  timelineFilter === 'all'
                    ? 'bg-background border border-border shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Tout
              </button>
              <button
                onClick={() => setTimelineFilter('consultations')}
                className={`text-xs rounded-md transition-all flex items-center justify-center ${
                  timelineFilter === 'consultations'
                    ? 'bg-background border border-border shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Stethoscope className="h-3 w-3" />
              </button>
              <button
                onClick={() => setTimelineFilter('labs')}
                className={`text-xs rounded-md transition-all flex items-center justify-center ${
                  timelineFilter === 'labs'
                    ? 'bg-background border border-border shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Activity className="h-3 w-3" />
              </button>
              <button
                onClick={() => setTimelineFilter('imaging')}
                className={`text-xs rounded-md transition-all flex items-center justify-center ${
                  timelineFilter === 'imaging'
                    ? 'bg-background border border-border shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="h-3 w-3" />
              </button>
            </div>
            
            {/* More Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-muted-foreground h-8">
                  Plus <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[260px]">
                <DropdownMenuItem onClick={() => setTimelineFilter('prescriptions')}>
                  <FileText className="mr-2 h-4 w-4" />
                  Prescriptions
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTimelineFilter('documents')}>
                  <FileText className="mr-2 h-4 w-4" />
                  Documents
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Search Field */}
          <div className="px-3 pb-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={timelineSearch}
                onChange={(e) => setTimelineSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>
        </div>

        {/* Scrollable Timeline List */}
        <div className="flex-1 overflow-y-auto">
          {Object.entries(groupedTimeline).map(([date, items]: [string, any]) => (
            <div key={date} className="border-b last:border-b-0">
              {/* Date Header */}
              <div className="sticky top-0 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                {date}
              </div>
              
              {/* Timeline Items */}
              <div className="divide-y">
                {items.map((item: any) => (
                  <div
                    key={item.id}
                    className="group relative block px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div 
                      className="flex items-start space-x-3 cursor-pointer"
                      onClick={() => {
                        if (item.type !== 'consultation') {
                          setReviewingDocId(item.id);
                          setDocumentSheetOpen(true);
                        }
                      }}
                    >
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          {item.type === 'consultation' && <Stethoscope className="h-4 w-4 text-foreground" />}
                          {item.type === 'lab' && <Activity className="h-4 w-4 text-foreground" />}
                          {item.type === 'imaging' && <FileText className="h-4 w-4 text-foreground" />}
                          {item.type === 'prescription' && <FileText className="h-4 w-4 text-foreground" />}
                          {item.type === 'document' && <FileText className="h-4 w-4 text-foreground" />}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">
                            {item.title}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {item.review_status === 'pending' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground border-border">
                                En attente
                              </Badge>
                            )}
                            {item.documents > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {item.documents}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.patient}
                        </p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>                    
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {Object.keys(groupedTimeline).length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {timelineFilter === 'all' && !timelineSearch && 'No timeline items yet'}
              {timelineFilter === 'consultations' && 'No consultations found'}
              {timelineFilter === 'labs' && 'No lab reports found'}
              {timelineFilter === 'imaging' && 'No imaging reports found'}
              {timelineFilter === 'prescriptions' && 'No prescriptions found'}
              {timelineFilter === 'documents' && 'No documents found'}
              {timelineSearch && 'No items match your search'}
            </div>
          )}
        </div>
          </>
        ) : (
          <div className="flex flex-col items-center py-3 h-full">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowTimeline(true)}
              className="h-7 w-7 mb-3"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm font-bold text-foreground [writing-mode:vertical-lr] rotate-180 flex-1 flex items-center justify-center">Chronologie</span>
          </div>
        )}
      </div>

      {/* MIDDLE Section - Consultation Workspace */}
      <div className="flex-1 bg-background border-l flex flex-col overflow-hidden transition-all duration-300 relative">
        {showSidebar && (
          <>
        {/* Visit Control Header with Completion Meter */}
        <div className="flex-shrink-0 bg-background border-b px-3 py-2.5 z-10 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/consultations')}
                className="h-7 w-7 p-0"
              >
                <ArrowLeft className="h-3 w-3" />
              </Button>
              <div>
              <h2 className="text-m font-semibold">Espace de travail</h2>
              {/* Completion meter - shows closure signals */}
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              {problems.length > 0 && (
                <>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{problems.length}</span> problème{problems.length !== 1 ? 's' : ''}
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    {(() => {
                      const totalItems = problems.reduce((acc, p) => 
                        acc + p.plan.today.length + p.plan.orders.length + p.plan.treatment.length + p.plan.follow_up.length + p.plan.safety_net.length, 0);
                      const checkedItems = problems.reduce((acc, p) => 
                        acc + p.plan.today.filter(i => i.checked).length + 
                        p.plan.orders.filter(i => i.checked).length + 
                        p.plan.treatment.filter(i => i.checked).length + 
                        p.plan.follow_up.filter(i => i.checked).length + 
                        p.plan.safety_net.filter(i => i.checked).length, 0);
                      return (
                        <>
                          <span className={`font-medium ${checkedItems === totalItems && totalItems > 0 ? 'text-accent-foreground' : ''}`}>
                            {checkedItems}/{totalItems}
                          </span>
                          <span>éléments</span>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
              {/* Triage status */}
              {quickNotes.length > 0 ? (
                <Badge variant="outline" className="h-4 text-[10px] px-1.5 text-muted-foreground border-border">
                  {quickNotes.length} à trier
                </Badge>
              ) : (
                <Badge variant="outline" className="h-4 text-[10px] px-1.5 text-accent-foreground border-accent">
                  <Check className="h-2.5 w-2.5 mr-0.5" /> Trié
                </Badge>
              )}
              {/* Orders status */}
              {(() => {
                const totalIntents = workspaceOrders.rx_intents.length + 
                                    workspaceOrders.referral_intents.length + 
                                    workspaceOrders.followup_intents.length;
                const draftDocs = workspaceOrders.documents.filter(d => d.status === 'draft').length;
                const pendingActions = workspaceOrders.pending_actions.filter(a => a.status === 'pending').length;
                
                if (totalIntents === 0) return null;
                return (
                  <Badge variant="outline" className={`h-4 text-[10px] px-1.5 ${
                    draftDocs > 0 || pendingActions > 0 ? 'text-muted-foreground border-border' : 
                    'text-accent-foreground border-accent'
                  }`}>
                    {draftDocs > 0 ? `${draftDocs} brouillon${draftDocs !== 1 ? 's' : ''}` : 
                    pendingActions > 0 ? `${pendingActions} action${pendingActions !== 1 ? 's' : ''} en attente` : 
                    <><Check className="h-2.5 w-2.5 mr-0.5" /> {totalIntents} ordonnance{totalIntents !== 1 ? 's' : ''}</>}
                  </Badge>
                );
              })()}
              {/* Follow-up status */}
              {(() => {
                const hasFollowUp = problems.some(p => p.plan.follow_up.length > 0);
                return hasFollowUp ? (
                  <Badge variant="outline" className="h-4 text-[10px] px-1.5 text-accent-foreground border-accent">
                    <Check className="h-2.5 w-2.5 mr-0.5" /> Suivi planifié
                  </Badge>
                ) : problems.length > 0 ? (
                  <Badge variant="outline" className="h-4 text-[10px] px-1.5 text-muted-foreground">
                    Pas de suivi
                  </Badge>
                ) : null;
              })()}
              </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Actions dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem 
                    onClick={handleFillAllProblems}
                    disabled={enrichingProblems.size > 0}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    <div>
                      <div className="font-medium">{enrichingProblems.size > 0 ? 'Remplissage...' : 'Enrichir le contenu clinique'}</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setShowForceOverwriteConfirm(true)}
                    disabled={isGeneratingWorkspace}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    <div>
                      <div className="font-medium">Réinitialiser l'espace</div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => setShowSignConfirm(true)}
                disabled={isSigningConsultation}
              >
                
                {isSigningConsultation ? 'Signature...' : 'Signer'}
              </Button>
            </div>
          </div>
          
          {/* Scribe - Compact inline on bottom border right */}
          <div className="absolute bottom-0 right-27 transform translate-y-1/2 z-20">
            <VoiceScribe
              consultationId={consultationId}
              language="fr"
              onTranscriptChange={(transcript) => {
                console.log('Transcript updated:', transcript.length, 'chars');
              }}
              onSOAPGenerated={(soap) => {
                const soapText = `**S:** ${soap.subjective}\n**O:** ${soap.objective}\n**A:** ${soap.assessment}\n**P:** ${soap.plan}`;
                setQuickNotes(prev => [...prev, {
                  id: Date.now(),
                  timestamp: format(new Date(), 'h:mm a'),
                  text: `[SOAP Scribe]\n${soapText.slice(0, 800)}`,
                }]);
                toast.success('Note SOAP générée et ajoutée');
              }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6">

          {/* Visit Focus */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Motif de consultation</h3>
            <Input
              value={visitFocus}
              onChange={(e) => setVisitFocus(e.target.value)}
              placeholder="Motif de la visite"
              className="font-medium"
            />

            {/* Agenda */}
            <div className="space-y-2">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedSections({...expandedSections, agenda: !expandedSections.agenda})}
              >
                <h4 className="text-sm font-medium text-muted-foreground">Ordre du jour</h4>
                {expandedSections.agenda ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
              
              {expandedSections.agenda && (
                <div className="space-y-2 pl-4">
                  {agendaItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={(checked) => {
                          setAgendaItems(prev => prev.map(i => 
                            i.id === item.id ? { ...i, checked: checked as boolean } : i
                          ));
                        }}
                      />
                      <span className={`text-sm ${item.checked ? 'line-through text-muted-foreground' : ''}`}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 -mx-2">
                    <Plus className="h-4 w-4 text-muted-foreground ml-2" />
                    <SmartInput
                      placeholder="Ajouter un élément..."
                      value={newAgendaItem}
                      onChange={setNewAgendaItem}
                      patientId={patientId}
                      consultationId={consultationId}
                      section="agenda"
                      fieldType="agenda_item"
                      activeProblems={problems.map(p => p.title)}
                      visitFocus={visitFocus}
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newAgendaItem.trim()) {
                          e.preventDefault();
                          setAgendaItems(prev => [...prev, {
                            id: Date.now(),
                            text: newAgendaItem,
                            checked: false,
                          }]);
                          setNewAgendaItem('');
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Insights Panel - What Changed Since Last Visit */}
          {patientChanges && (
            <div className="space-y-2">
              {/* Compact Header */}
              <div 
                className="flex items-center justify-between cursor-pointer px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                onClick={() => setShowInsights(!showInsights)}
              >
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Évolution depuis la dernière visite</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {patientChanges.new_abnormals?.length > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive">
                      {patientChanges.new_abnormals.length}
                    </span>
                  )}
                  {patientChanges.worsening_trends?.length > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      {patientChanges.worsening_trends.length}
                    </span>
                  )}
                  {patientChanges.new_documents?.length > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                      {patientChanges.new_documents.length}
                    </span>
                  )}
                  {showInsights ? <ChevronUp className="h-4 w-4 text-muted-foreground ml-1" /> : <ChevronDown className="h-4 w-4 text-muted-foreground ml-1" />}
                </div>
              </div>

              {/* Compact Content */}
              {showInsights && (
                <div className="space-y-2 pl-2">
                  {/* New Abnormals - Priority 1 */}
                  {patientChanges.new_abnormals && patientChanges.new_abnormals.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                        <AlertCircle className="h-3 w-3 text-destructive" />
                        Nouvelles anomalies
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {patientChanges.new_abnormals.slice(0, 5).map((lab, idx) => (
                          <span 
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-destructive/5 border border-destructive/20 text-foreground"
                          >
                            <span className="font-medium">{lab.test_name}</span>
                            <span className="text-muted-foreground">{lab.value}{lab.unit ? ` ${lab.unit}` : ''}</span>
                            <span className={`text-[10px] font-medium ${lab.flag === 'high' ? 'text-destructive' : 'text-blue-600 dark:text-blue-400'}`}>
                              {lab.flag === 'high' ? '↑' : '↓'}
                            </span>
                          </span>
                        ))}
                        {patientChanges.new_abnormals.length > 5 && (
                          <span className="text-xs text-muted-foreground self-center">+{patientChanges.new_abnormals.length - 5}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Worsening Trends - Priority 2 */}
                  {patientChanges.worsening_trends && patientChanges.worsening_trends.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                        <TrendingDown className="h-3 w-3 text-orange-500" />
                        Tendances défavorables
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {patientChanges.worsening_trends.slice(0, 4).map((trend, idx) => (
                          <span 
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-foreground"
                          >
                            <span className="font-medium">{trend.test_name}</span>
                            <span className="text-muted-foreground">{trend.previous_value}</span>
                            <ArrowRight className="h-2.5 w-2.5 text-orange-500" />
                            <span className="font-medium text-orange-600 dark:text-orange-400">{trend.value}</span>
                          </span>
                        ))}
                        {patientChanges.worsening_trends.length > 4 && (
                          <span className="text-xs text-muted-foreground self-center">+{patientChanges.worsening_trends.length - 4}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* New Documents & Imaging - Priority 3 */}
                  {((patientChanges.new_documents && patientChanges.new_documents.length > 0) || 
                    (patientChanges.new_imaging && patientChanges.new_imaging.length > 0)) && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                        <FileText className="h-3 w-3" />
                        Nouveaux documents
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {patientChanges.new_documents?.slice(0, 3).map((doc, idx) => (
                          <button 
                            key={`doc-${idx}`}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-muted border border-border text-foreground hover:bg-accent transition-colors"
                            onClick={() => {
                              setReviewingDocId(doc.doc_id);
                              setDocumentSheetOpen(true);
                            }}
                          >
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            <span>{doc.document_type}</span>
                            <span className="text-muted-foreground">
                              {doc.date_of_service ? format(new Date(doc.date_of_service), 'dd/MM') : ''}
                            </span>
                          </button>
                        ))}
                        {patientChanges.new_imaging?.slice(0, 2).map((img, idx) => (
                          <button 
                            key={`img-${idx}`}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-muted border border-border text-foreground hover:bg-accent transition-colors"
                            onClick={() => {
                              setReviewingDocId(img.report_id);
                              setDocumentSheetOpen(true);
                            }}
                          >
                            <FileImage className="h-3 w-3 text-muted-foreground" />
                            <span>{img.type_examen}</span>
                          </button>
                        ))}
                        {((patientChanges.new_documents?.length || 0) + (patientChanges.new_imaging?.length || 0)) > 5 && (
                          <span className="text-xs text-muted-foreground self-center">
                            +{(patientChanges.new_documents?.length || 0) + (patientChanges.new_imaging?.length || 0) - 5}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {(() => {
                    const hasAnyData = 
                      (patientChanges.new_documents?.length || 0) > 0 ||
                      (patientChanges.new_abnormals?.length || 0) > 0 ||
                      (patientChanges.worsening_trends?.length || 0) > 0 ||
                      (patientChanges.new_imaging?.length || 0) > 0;
                    
                    if (!hasAnyData) {
                      return (
                        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>Pas de changement significatif depuis la dernière visite</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Now Strip - Compact context summary */}
          <div className="space-y-3 bg-[#F9F9F9] rounded-xl p-3">
            {/* One-liner - always visible, click to edit */}
            <div 
              className="text-sm cursor-pointer group"
              onClick={() => !editingHpiSection && setEditingHpiSection('oneLiner')}
            >
              {editingHpiSection === 'oneLiner' ? (
                <div className="space-y-1.5">
                  <SmartInput
                    value={hpiOneLiner}
                    onChange={setHpiOneLiner}
                    placeholder="Brief summary: age, chief complaint, key findings"
                    className="font-medium"
                    autoFocus
                    multiline
                    minHeight="40px"
                    patientId={patientId}
                    consultationId={consultationId}
                    section="hpi"
                    fieldType="one_liner"
                    activeProblems={problems.map(p => p.title)}
                    visitFocus={visitFocus}
                    showTriggerHints
                    onBlur={() => setEditingHpiSection(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingHpiSection(null);
                      }
                    }}
                  />
                  <div className="text-[10px] text-muted-foreground">Échap ou cliquer à l'extérieur pour enregistrer</div>
                </div>
              ) : hpiOneLiner ? (
                <span className="font-medium group-hover:text-primary transition-colors">{hpiOneLiner}</span>
              ) : (
                <span className="text-muted-foreground italic group-hover:text-primary transition-colors">Cliquer pour ajouter un résumé...</span>
              )}
            </div>

            {/* Symptoms - compact chips (max 3) with edit popover */}
            {hpiSymptoms.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {hpiSymptoms.slice(0, 3).map((symptom, idx) => (
                  <Popover 
                    key={idx} 
                    open={editingHpiSection === `symptom-${idx}`}
                    onOpenChange={(open) => setEditingHpiSection(open ? `symptom-${idx}` : null)}
                  >
                    <PopoverTrigger asChild>
                      <Badge 
                        variant="secondary" 
                        className="text-xs cursor-pointer hover:bg-secondary/80 border-black/20"
                      >
                        {symptom.name}
                      </Badge>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <div className="space-y-3">
                        <div className="text-sm font-medium">Modifier le symptôme</div>
                        <Input
                          defaultValue={symptom.name}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const newName = e.currentTarget.value.trim();
                              if (newName) {
                                setHpiSymptoms(prev => prev.map((s, i) => 
                                  i === idx ? { ...s, name: newName } : s
                                ));
                              }
                              setEditingHpiSection(null);
                            } else if (e.key === 'Escape') {
                              setEditingHpiSection(null);
                            }
                          }}
                          autoFocus
                          className="text-sm"
                        />
                        <div className="flex justify-between">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setHpiSymptoms(prev => prev.filter((_, i) => i !== idx));
                              setEditingHpiSection(null);
                            }}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Supprimer
                          </Button>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              const input = e.currentTarget.parentElement?.parentElement?.querySelector('input');
                              const newName = input?.value.trim();
                              if (newName) {
                                setHpiSymptoms(prev => prev.map((s, i) => 
                                  i === idx ? { ...s, name: newName } : s
                                ));
                              }
                              setEditingHpiSection(null);
                            }}
                          >
                            Enregistrer
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ))}
                {hpiSymptoms.length > 3 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                        +{hpiSymptoms.length - 3} autre{hpiSymptoms.length - 3 !== 1 ? 's' : ''}
                      </Badge>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3" align="start">
                      <div className="space-y-3">
                        <div className="text-sm font-medium">Tous les symptômes ({hpiSymptoms.length})</div>
                        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                          {hpiSymptoms.map((symptom, idx) => (
                            <Badge 
                              key={idx}
                              variant="secondary" 
                              className="text-xs cursor-pointer hover:bg-secondary/80 group"
                              onClick={() => setEditingHpiSection(`symptom-${idx}`)}
                            >
                              {symptom.name}
                              <X 
                                className="h-2.5 w-2.5 ml-1 opacity-0 group-hover:opacity-100" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHpiSymptoms(prev => prev.filter((_, i) => i !== idx));
                                }}
                              />
                            </Badge>
                          ))}
                        </div>
                        <Separator />
                        <div className="flex gap-2">
                          <Input
                            placeholder="Nouveau symptôme..."
                            className="text-sm h-8"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                setHpiSymptoms(prev => [...prev, { name: e.currentTarget.value.trim(), details: '' }]);
                                e.currentTarget.value = '';
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={(e) => {
                              const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                              if (input?.value.trim()) {
                                setHpiSymptoms(prev => [...prev, { name: input.value.trim(), details: '' }]);
                                input.value = '';
                              }
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {/* Add button when 3 or fewer symptoms */}
                {hpiSymptoms.length <= 3 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted border-dashed">
                        <Plus className="h-2.5 w-2.5 mr-0.5" />
                        Ajouter
                      </Badge>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Ajouter un symptôme</div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Nom du symptôme..."
                            className="text-sm h-8"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                setHpiSymptoms(prev => [...prev, { name: e.currentTarget.value.trim(), details: '' }]);
                                e.currentTarget.value = '';
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={(e) => {
                              const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                              if (input?.value.trim()) {
                                setHpiSymptoms(prev => [...prev, { name: input.value.trim(), details: '' }]);
                                input.value = '';
                              }
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}

            {/* Red Flags - tri-state toggle: null=unknown, true=present, false=absent */}
            {hpiRedFlags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {hpiRedFlags.slice(0, 4).map((rf, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      const updated = [...hpiRedFlags];
                      // Cycle: null → true → false → null
                      if (rf.checked === null) updated[idx].checked = true;
                      else if (rf.checked === true) updated[idx].checked = false;
                      else updated[idx].checked = null;
                      setHpiRedFlags(updated);
                    }}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-all ${
                      rf.checked === null
                        ? 'border-muted-foreground/30 bg-muted/30 text-muted-foreground'
                        : rf.checked === true
                        ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
                        : 'border-muted bg-muted/10 text-muted-foreground line-through'
                    }`}
                  >
                    {rf.checked === null && <HelpCircle className="h-3 w-3" />}
                    {rf.checked === true && <CheckCircle className="h-3 w-3" />}
                    {rf.checked === false && <Ban className="h-3 w-3" />}
                    {rf.label}
                  </button>
                ))}
                {hpiRedFlags.length > 4 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                        +{hpiRedFlags.length - 4} autre{hpiRedFlags.length - 4 !== 1 ? 's' : ''}
                      </Badge>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3" align="start">
                      <div className="space-y-3">
                        <div className="text-sm font-medium">Tous les drapeaux rouges ({hpiRedFlags.length})</div>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {hpiRedFlags.map((rf, idx) => (
                            <div key={idx} className="flex items-center justify-between py-1">
                              <button
                                onClick={() => {
                                  const updated = [...hpiRedFlags];
                                  if (rf.checked === null) updated[idx].checked = true;
                                  else if (rf.checked === true) updated[idx].checked = false;
                                  else updated[idx].checked = null;
                                  setHpiRedFlags(updated);
                                }}
                                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-all flex-1 mr-2 ${
                                  rf.checked === null
                                    ? 'border-muted-foreground/30 bg-muted/30 text-muted-foreground'
                                    : rf.checked === true
                                    ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
                                    : 'border-muted bg-muted/10 text-muted-foreground line-through'
                                }`}
                              >
                                {rf.checked === null && <HelpCircle className="h-3 w-3" />}
                                {rf.checked === true && <CheckCircle className="h-3 w-3" />}
                                {rf.checked === false && <Ban className="h-3 w-3" />}
                                {rf.label}
                              </button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => setHpiRedFlags(prev => prev.filter((_, i) => i !== idx))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Separator />
                        <div className="flex gap-2">
                          <Input
                            placeholder="Nouveau drapeau rouge..."
                            className="text-sm h-8"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                setHpiRedFlags(prev => [...prev, { label: e.currentTarget.value.trim(), checked: null }]);
                                e.currentTarget.value = '';
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={(e) => {
                              const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                              if (input?.value.trim()) {
                                setHpiRedFlags(prev => [...prev, { label: input.value.trim(), checked: null }]);
                                input.value = '';
                              }
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {/* Add button when 4 or fewer red flags */}
                {hpiRedFlags.length <= 4 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-muted-foreground/30 hover:bg-muted/30 text-muted-foreground transition-all">
                        <Plus className="h-3 w-3" />
                        Ajouter
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Ajouter un drapeau rouge</div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Ex: fièvre, dyspnée..."
                            className="text-sm h-8"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                setHpiRedFlags(prev => [...prev, { label: e.currentTarget.value.trim(), checked: null }]);
                                e.currentTarget.value = '';
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={(e) => {
                              const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                              if (input?.value.trim()) {
                                setHpiRedFlags(prev => [...prev, { label: input.value.trim(), checked: null }]);
                                input.value = '';
                              }
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}

            {/* Changes since last visit - structured list */}
            {Array.isArray(hpiSinceLastVisit) && hpiSinceLastVisit.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Évolution :</span>
                <div className="flex flex-wrap gap-1.5">
                  {hpiSinceLastVisit.map((change: any, idx: number) => (
                    <Badge 
                      key={idx} 
                      variant={change.type === 'worsening' ? 'destructive' : change.type === 'new_abnormal' ? 'default' : 'outline'}
                      className="text-[10px]"
                    >
                      {change.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {typeof hpiSinceLastVisit === 'string' && hpiSinceLastVisit && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Évolution : </span>{hpiSinceLastVisit}
              </div>
            )}

            {/* Evidence chips - from documents/AI with expandable view */}
            {/*
            {hpiObjectiveHighlights.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Preuves :</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]">
                        <Plus className="h-2.5 w-2.5 mr-0.5" />
                        Ajouter
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3" align="end">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Ajouter une preuve</div>
                        <Input
                          placeholder="Ex: Hb 8.5 g/dL (labo 15/01)"
                          className="text-sm h-8"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                              setHpiObjectiveHighlights(prev => [...prev, { text: e.currentTarget.value.trim(), source: 'manual' }]);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          className="w-full h-8"
                          onClick={(e) => {
                            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                            if (input?.value.trim()) {
                              setHpiObjectiveHighlights(prev => [...prev, { text: input.value.trim(), source: 'manual' }]);
                              input.value = '';
                            }
                          }}
                        >
                          Ajouter
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hpiObjectiveHighlights.slice(0, 5).map((ev, idx) => (
                    <Popover key={idx}>
                      <PopoverTrigger asChild>
                        <Badge 
                          variant="outline" 
                          className="text-[10px] group cursor-pointer hover:bg-muted"
                        >
                          <FileText className="h-2.5 w-2.5 mr-1" />
                          {ev.text.slice(0, 30)}{ev.text.length > 30 ? '...' : ''}
                        </Badge>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-3" align="start">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <span className="text-xs font-medium">Preuve objective</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-muted-foreground hover:text-destructive"
                              onClick={() => setHpiObjectiveHighlights(prev => prev.filter((_, i) => i !== idx))}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-sm">{ev.text}</p>
                          {ev.source && ev.source !== 'manual' && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <FileText className="h-3 w-3" />
                              Source: {ev.source}
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ))}
                  {hpiObjectiveHighlights.length > 5 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-muted">
                          +{hpiObjectiveHighlights.length - 5} autres
                        </Badge>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-3" align="start">
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Toutes les preuves ({hpiObjectiveHighlights.length})</div>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {hpiObjectiveHighlights.map((ev, idx) => (
                              <div key={idx} className="flex items-start justify-between p-2 bg-muted/50 rounded text-xs">
                                <span className="flex-1">{ev.text}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 ml-2 text-muted-foreground hover:text-destructive flex-shrink-0"
                                  onClick={() => setHpiObjectiveHighlights(prev => prev.filter((_, i) => i !== idx))}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            )}
              */}
            {/* Show add button even when no evidence */}
            {hpiObjectiveHighlights.length === 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Preuves :</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-muted border-dashed">
                      <Plus className="h-2.5 w-2.5 mr-0.5" />
                      Ajouter une preuve
                    </Badge>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="start">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Ajouter une preuve</div>
                      <Input
                        placeholder="Ex: Hb 8.5 g/dL (labo 15/01)"
                        className="text-sm h-8"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            setHpiObjectiveHighlights(prev => [...prev, { text: e.currentTarget.value.trim(), source: 'manual' }]);
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="w-full h-8"
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                          if (input?.value.trim()) {
                            setHpiObjectiveHighlights(prev => [...prev, { text: input.value.trim(), source: 'manual' }]);
                            input.value = '';
                          }
                        }}
                      >
                        Ajouter
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          <Separator />

          {/* Assessment & Plan - Main body with problem cards and tabbed plan buckets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div 
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setExpandedSections({...expandedSections, problems: !expandedSections.problems})}
              >
                <h3 className="text-sm font-semibold">Évaluation & Plan</h3>
                {expandedSections.problems ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => {
                  const newId = crypto.randomUUID();
                  const newProblem = {
                    id: newId,
                    title: 'Nouveau problème',
                    urgency: undefined,
                    assessment: '',
                    evidence: [],
                    plan: {
                      today: [],
                      orders: [],
                      treatment: [],
                      follow_up: [],
                      safety_net: [],
                    },
                    sources: []
                  };
                  setProblems(prev => [...prev, newProblem]);
                  setActivePlanTabs(prev => ({ ...prev, [newId]: 'today' }));
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Ajouter un problème
              </Button>
            </div>

            {expandedSections.problems && (
              <div className="space-y-3">
                {problems.map((problem) => {
                  const activeTab = activePlanTabs[problem.id] || 'today';
                  const planBuckets = [
                    { key: 'today', label: 'Aujourd\'hui', items: problem.plan.today },
                    { key: 'orders', label: 'Ordo', items: problem.plan.orders },
                    { key: 'treatment', label: 'Tx', items: problem.plan.treatment },
                    { key: 'follow_up', label: 'Suivi', items: problem.plan.follow_up },
                    { key: 'safety_net', label: 'Alertes', items: problem.plan.safety_net },
                  ];
                  const activeBucket = planBuckets.find(b => b.key === activeTab) || planBuckets[0];
                  
                  return (
                  <div 
                    key={problem.id}
                    className="border border-[#EAEAEA] rounded-xl bg-white overflow-hidden"
                  >
                    {/* Problem Header */}
                    <div className="p-3 border-b border-[#EAEAEA] bg-[#F9F9F9]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            value={problem.title}
                            onChange={(e) => {
                              setProblems(prev => prev.map(p =>
                                p.id === problem.id ? { ...p, title: e.target.value } : p
                              ));
                            }}
                            className="h-7 text-sm font-semibold border-0 px-0 focus-visible:ring-0 shadow-none bg-transparent flex-1"
                            placeholder="Titre du problème"
                          />
                          {problem.urgency && (
                            <Badge variant="destructive" className="text-[10px] h-4 flex-shrink-0">
                              {problem.urgency}
                            </Badge>
                          )}
                          {/* LLM-generated content indicator */}
                          {problem.requiresReview && (
                            <Badge 
                              variant="outline" 
                              className="text-[10px] h-4 flex-shrink-0 bg-muted text-muted-foreground border-border"
                              title="Contenu généré par l'IA - vérification recommandée"
                            >
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                              AI
                            </Badge>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setProblems(prev => prev.filter(p => p.id !== problem.id))}
                              className="text-destructive"
                            >
                              <X className="h-4 w-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Plan Bucket Tabs */}
                    <div className="border-b">
                      <div className="flex">
                        {planBuckets.map((bucket) => {
                          const count = bucket.items.length;
                          const checkedCount = bucket.items.filter(i => i.checked).length;
                          return (
                            <button
                              key={bucket.key}
                              onClick={() => setActivePlanTabs(prev => ({ ...prev, [problem.id]: bucket.key }))}
                              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors relative
                                ${activeTab === bucket.key 
                                  ? 'text-foreground border-b-2 border-primary bg-background' 
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                }`}
                            >
                              {bucket.label}
                              {count > 0 && (
                                <span className={`ml-1 text-[10px] ${checkedCount === count ? 'text-accent-foreground' : ''}`}>
                                  {checkedCount}/{count}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Active Plan Bucket Items */}
                    <div className="p-3 space-y-1.5 min-h-[80px]">
                      {activeBucket.items.length > 0 ? (
                        activeBucket.items.map((planItem) => {
                          // Find linked order from new intent-based architecture
                          const linkedRxIntent = planItem.linkedOrderId 
                            ? workspaceOrders.rx_intents.find(rx => rx.id === planItem.linkedOrderId)
                            : null;
                          const linkedReferralIntent = planItem.linkedOrderId 
                            ? workspaceOrders.referral_intents.find(ref => ref.id === planItem.linkedOrderId)
                            : null;
                          const linkedFollowupIntent = planItem.linkedOrderId 
                            ? workspaceOrders.followup_intents.find(fu => fu.id === planItem.linkedOrderId)
                            : null;
                          const hasLinkedOrder = linkedRxIntent || linkedReferralIntent || linkedFollowupIntent;
                          
                          // Check for linked Ordo item(s) (new system)
                          const linkedOrdoIds = planItem.linkedOrdoIds ?? (planItem.linkedOrdoId ? [planItem.linkedOrdoId] : []);
                          const linkedOrdoItems = linkedOrdoIds
                            .map(id => ordoItems.find(o => o.id === id))
                            .filter(Boolean) as OrdoItem[];
                          const hasLinkedOrdo = linkedOrdoItems.length > 0;
                          const hasAnyLink = hasLinkedOrder || hasLinkedOrdo;

                          // Get predicted candidates for smart conversion preview
                          const candidates: OrdoCandidate[] = planItem.text.trim() && !hasAnyLink
                            ? resolveOrdoCandidates(planItem.text, { bucket: activeTab, problemTitle: problem.title })
                            : [];
                          const best = candidates[0];
                          const second = candidates[1];
                          const isLowConfidence = !best || best.score < 0.45;
                          const isAmbiguous = !!(best && second && best.score >= 0.45 && (best.score - second.score) < 0.15);
                          
                          return (
                          <div key={planItem.id} className={`group flex items-start gap-2 relative pr-16 ${hasAnyLink ? 'bg-accent/10 dark:bg-accent/5 rounded px-2 py-1 -mx-2' : ''}`}>
                            {editingHpiSection === `plan-${problem.id}-${planItem.id}` ? (
                              <div className="flex-1">
                                <SmartInput
                                  value={planItem.text}
                                  onChange={(newText) => {
                                    setProblems(prev => prev.map(p =>
                                      p.id === problem.id
                                        ? {
                                            ...p,
                                            plan: {
                                              ...p.plan,
                                              [activeTab]: p.plan[activeTab as keyof typeof p.plan].map(item =>
                                                item.id === planItem.id ? { ...item, text: newText } : item
                                              ),
                                            }
                                          }
                                        : p
                                    ));
                                  }}
                                  placeholder="dx: rx: lab: order:"
                                  autoFocus
                                  patientId={patientId}
                                  consultationId={consultationId}
                                  section="plan"
                                  fieldType="plan_item"
                                  problemId={problem.id}
                                  bucket={activeTab as any}
                                  activeProblems={problems.map(p => p.title)}
                                  visitFocus={visitFocus}
                                  showTriggerHints
                                  onBlur={() => {
                                    setEditingHpiSection(null);
                                    // Remove item if text is blank
                                    if (!planItem.text.trim()) {
                                      setProblems(prev => prev.map(p =>
                                        p.id === problem.id
                                          ? {
                                              ...p,
                                              plan: {
                                                ...p.plan,
                                                [activeTab]: p.plan[activeTab as keyof typeof p.plan].filter(item =>
                                                  item.id !== planItem.id
                                                ),
                                              }
                                            }
                                          : p
                                      ));
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                                      e.preventDefault();
                                      setEditingHpiSection(null);
                                      // Remove item if text is blank
                                      if (!planItem.text.trim()) {
                                        setProblems(prev => prev.map(p =>
                                          p.id === problem.id
                                            ? {
                                                ...p,
                                                plan: {
                                                  ...p.plan,
                                                  [activeTab]: p.plan[activeTab as keyof typeof p.plan].filter(item =>
                                                    item.id !== planItem.id
                                                  ),
                                                }
                                              }
                                            : p
                                        ));
                                      }
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <>
                                <Checkbox
                                  checked={planItem.checked}
                                  onCheckedChange={(checked) => {
                                    setProblems(prev => prev.map(p =>
                                      p.id === problem.id
                                        ? {
                                            ...p,
                                            plan: {
                                              ...p.plan,
                                              [activeTab]: p.plan[activeTab as keyof typeof p.plan].map(item =>
                                                item.id === planItem.id ? { ...item, checked: checked as boolean } : item
                                              ),
                                            }
                                          }
                                        : p
                                    ));
                                  }}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <span className={`text-sm leading-relaxed ${planItem.checked ? 'line-through text-muted-foreground' : ''}`}>
                                    {planItem.text}
                                  </span>
                                  {/* Linked order indicator (old system) */}
                                  {hasLinkedOrder && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <Badge 
                                        variant="outline" 
                                        className="text-[9px] h-4 px-1.5 cursor-pointer bg-accent/10 text-accent-foreground border-accent"
                                        onClick={() => setExpandedSections({...expandedSections, orders: true})}
                                        title="Cliquer pour voir dans les ordonnances"
                                      >
                                        {linkedRxIntent && '💊 Rx'}
                                        {linkedReferralIntent && '👤 Référence'}
                                        {linkedFollowupIntent && '📅 Suivi'}
                                      </Badge>
                                    </div>
                                  )}
                                  {/* Linked Ordo indicator (new system) */}
                                  {hasLinkedOrdo && linkedOrdoItems[0] && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <Badge 
                                        variant="outline" 
                                        className="text-[9px] h-4 px-1.5 cursor-pointer bg-accent/10 text-accent-foreground border-accent"
                                        onClick={() => setExpandedSections({...expandedSections, orders: true})}
                                        title="Cliquer pour voir dans Ordo Bucket"
                                      >
                                        {linkedOrdoItems.length === 1 ? (
                                          <>
                                            {getOrdoTypeIcon(linkedOrdoItems[0].type)} {linkedOrdoItems[0].type === 'medication' ? 'Rx' : linkedOrdoItems[0].type === 'lab' ? 'Labo' : linkedOrdoItems[0].type === 'imaging' ? 'Imagerie' : 'Acte'}
                                          </>
                                        ) : (
                                          <>
                                            📄 Ordo x{linkedOrdoItems.length}
                                          </>
                                        )}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                                <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                                  
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingHpiSection(`plan-${problem.id}-${planItem.id}`)}
                                    className="h-5 w-5"
                                  >
                                    <Pencil className="h-2.5 w-2.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      // Also remove linked order from workspaceOrders if exists
                                      if (planItem.linkedOrderId) {
                                        setWorkspaceOrders(prev => ({
                                          ...prev,
                                          rx_intents: prev.rx_intents.filter(rx => rx.id !== planItem.linkedOrderId),
                                          referral_intents: prev.referral_intents.filter(ref => ref.id !== planItem.linkedOrderId),
                                          followup_intents: prev.followup_intents.filter(fu => fu.id !== planItem.linkedOrderId),
                                        }));
                                      }
                                      // Also remove linked Ordo item(s) if exists
                                      const ids = planItem.linkedOrdoIds ?? (planItem.linkedOrdoId ? [planItem.linkedOrdoId] : []);
                                      if (ids.length > 0) {
                                        setOrdoItems(prev => prev.filter(o => !ids.includes(o.id)));
                                      }
                                      setProblems(prev => prev.map(p =>
                                        p.id === problem.id
                                          ? {
                                              ...p,
                                              plan: {
                                                ...p.plan,
                                                [activeTab]: p.plan[activeTab as keyof typeof p.plan].filter(item => item.id !== planItem.id),
                                              }
                                            }
                                          : p
                                      ));
                                    }}
                                    className="h-5 w-5 text-destructive"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        )})
                      ) : (
                        <p className="text-xs text-muted-foreground italic text-center py-2">
                          Aucun élément {activeBucket.label.toLowerCase()}
                        </p>
                      )}
                      
                      {/* Add item to current bucket */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newItemId = crypto.randomUUID();
                          setProblems(prev => prev.map(p =>
                            p.id === problem.id
                              ? {
                                  ...p,
                                  plan: {
                                    ...p.plan,
                                    [activeTab]: [
                                      ...p.plan[activeTab as keyof typeof p.plan],
                                      { id: newItemId, text: '', checked: false }
                                    ],
                                  }
                                }
                              : p
                          ));
                          // Start editing the new item
                          setTimeout(() => setEditingHpiSection(`plan-${problem.id}-${newItemId}`), 50);
                        }}
                        className="h-6 text-xs w-full justify-start text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Ajouter un élément
                      </Button>
                    </div>

                    {/* Evidence/Assessment - compact clickable chips */}
                    {problem.evidence.length > 0 && (
                      <div className="px-3 py-2 border-t bg-muted/10">
                        <div className="flex flex-wrap gap-1.5">
                          {problem.evidence.map((ev, idx) => {
                            // Handle both string (legacy) and object (new) formats
                            const label = typeof ev === 'string' ? ev : ev.label;
                            const docId = typeof ev === 'string' ? null : ev.docId;
                            
                            return (
                              <Badge 
                                key={idx} 
                                variant="secondary" 
                                className={`text-[10px] h-5 font-normal ${docId ? 'cursor-pointer hover:bg-secondary/80' : ''}`}
                                onClick={docId ? () => {
                                  setReviewingDocId(docId);
                                  setDocumentSheetOpen(true);
                                } : undefined}
                                title={docId ? `Click to view document` : undefined}
                              >
                                {label}
                                {docId && <FileText className="h-2.5 w-2.5 ml-1 opacity-50" />}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
                
                {problems.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Aucun problème ajouté. Cliquez sur "+ Ajouter un problème" pour en créer un.
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Quick Notes - Inbox Zero pattern */}
          {quickNotes.length > 0 && (
            <div className="space-y-2">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedSections({...expandedSections, quickNotes: !expandedSections.quickNotes})}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="h-5 px-2">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    {quickNotes.length} note{quickNotes.length !== 1 ? 's' : ''} to triage
                  </Badge>
                </div>
                {expandedSections.quickNotes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>

              {expandedSections.quickNotes && (
                <div className="space-y-2">
                  {quickNotes.map((note) => (
                    <div 
                      key={note.id} 
                      className="group relative bg-muted dark:bg-muted/30 border border-border dark:border-border rounded-lg p-3 hover:shadow-sm transition-all"
                    >
                      {/* Timestamp badge */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground dark:text-muted-foreground font-medium">
                          <Clock className="h-3 w-3" />
                          {note.timestamp}
                        </div>
                        <Badge variant="outline" className="h-4 text-[9px] px-1.5 border-border text-muted-foreground dark:text-muted-foreground">
                          À trier
                        </Badge>
                      </div>
                      
                      {/* Note content */}
                      <p className="text-sm leading-relaxed text-foreground pr-20">{note.text}</p>
                      
                      {/* Action buttons - visible on hover */}
                      <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 backdrop-blur-sm rounded-md p-0.5 border shadow-sm">
                        {/* Insert to Now Strip - dropdown with destinations */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 hover:bg-muted dark:hover:bg-muted" 
                              title="Ajouter au résumé"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem 
                              onClick={() => {
                                handleInsertToNowStrip(note.text.slice(0, 150), 'oneliner');
                                setQuickNotes(prev => prev.filter(n => n.id !== note.id));
                              }}
                              className="text-xs"
                            >
                              <FileText className="h-3.5 w-3.5 mr-2" />
                              Résumé
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                handleInsertToNowStrip(note.text.slice(0, 100), 'symptom');
                                setQuickNotes(prev => prev.filter(n => n.id !== note.id));
                              }}
                              className="text-xs"
                            >
                              <Activity className="h-3.5 w-3.5 mr-2" />
                              Ajouter comme symptôme
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                handleInsertToNowStrip(note.text.slice(0, 60), 'redflag');
                                setQuickNotes(prev => prev.filter(n => n.id !== note.id));
                              }}
                              className="text-xs"
                            >
                              <AlertCircle className="h-3.5 w-3.5 mr-2" />
                              Ajouter comme signal d'alarme
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                handleInsertToNowStrip(note.text, 'evidence');
                                setQuickNotes(prev => prev.filter(n => n.id !== note.id));
                              }}
                              className="text-xs"
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-2" />
                              Ajouter aux preuves
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        
                        {/* Add to A&P - popover with problem + bucket picker */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 hover:bg-muted dark:hover:bg-muted" 
                              title="Ajouter au plan"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-56 p-2">
                            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                              <Pin className="h-3.5 w-3.5" />
                              Ajouter au problème
                            </div>
                            {problems.length > 0 ? (
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {problems.map(p => (
                                  <div key={p.id} className="space-y-1.5 pb-2 border-b last:border-b-0">
                                    <div className="text-xs font-medium truncate">{p.title}</div>
                                    <div className="flex flex-wrap gap-1">
                                      {['today', 'orders', 'treatment', 'follow_up', 'safety_net'].map(bucket => (
                                        <Button
                                          key={bucket}
                                          variant={lastAPDestination?.problemId === p.id && lastAPDestination?.bucket === bucket ? 'secondary' : 'outline'}
                                          size="sm"
                                          className="h-6 text-[10px] px-2"
                                          onClick={() => {
                                            handleAddToAP(note.text, p.id, bucket);
                                            setQuickNotes(prev => prev.filter(n => n.id !== note.id));
                                          }}
                                        >
                                          {bucket === 'today' ? '📋 Today' : bucket === 'orders' ? '🔬 Orders' : bucket === 'treatment' ? '💊 Tx' : bucket === 'follow_up' ? '📅 F/U' : '🛡️ Safety'}
                                        </Button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground text-center py-2">Aucun problème</div>
                            )}
                          </PopoverContent>
                        </Popover>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:bg-red-100 dark:hover:bg-red-950"
                          title="Supprimer"
                          onClick={() => {
                            setQuickNotes(prev => prev.filter(n => n.id !== note.id));
                            toast.success('Note supprimée');
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Orders Section - Structured Ordo System */}
          <Separator />
          <div className="space-y-3">
            <OrdoBucket
              items={ordoItems}
              onChange={setOrdoItems}
              onGenerateAndSend={() => setShowGenerateSendDrawer(true)}
              problemTitle={problems[0]?.title}
              patientId={patientId}
              consultationId={consultationId}
            />
          </div>

          {/* Generate & Send Drawer */}
          <GenerateSendDrawer
            open={showGenerateSendDrawer}
            onOpenChange={setShowGenerateSendDrawer}
            items={ordoItems}
            patientName={patient?.name || ''}
            patientEmail={patient?.email}
            patientPhone={patient?.phone}
            onSend={async (documents, recipients) => {
              // TODO: Implement actual send logic via API
              console.log('Sending documents:', documents, 'to:', recipients);
              toast.success('Documents envoyés avec succès');
            }}
          />

        </div>
        </div>
          </>
        )}
        {!showSidebar && (
          <div className="sticky top-0 p-2 flex justify-center border-b">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSidebar(true)}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN - Chat Area (Existing) */}
      <div className={`${showChat ? 'w-[30%]' : 'w-10'} flex flex-col border-r transition-all duration-300`}>
        {showChat ? (
          <>
        {/* Header */}
        <div className="border-b px-3 py-2.5 bg-gradient-to-r from-primary/5 to-transparent">
          <div 
            className="flex items-start gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => router.push(`/patients/${patientId}`)}
            title="Voir le profil patient"
          >
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {patient?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'PT'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold truncate">{patient?.name || 'Patient'}</h2>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                <span>{patientAge || '—'} ans</span>
                {patient?.allergies && patient.allergies.length > 0 && patient.allergies[0] !== 'Aucune' && (
                  <>
                    <span>•</span>
                    <span className="text-orange-600 dark:text-orange-400 flex items-center gap-0.5">
                      <AlertCircle className="h-2.5 w-2.5" />
                      {patient.allergies.slice(0, 2).join(', ')}{patient.allergies.length > 2 ? ` +${patient.allergies.length - 2}` : ''}
                    </span>
                  </>
                )}
                {patient?.active_problems && patient.active_problems.length > 0 && (
                  <>
                    <span>•</span>
                    <span>{patient.active_problems.slice(0, 2).join(', ')}{patient.active_problems.length > 2 ? ` +${patient.active_problems.length - 2}` : ''}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem 
                  onClick={() => {
                    resetConsultation(consultationId, {
                      onSuccess: () => {
                        toast.success('Chat réinitialisé');
                        queryClient.invalidateQueries({ queryKey: ['chat', consultationId] });
                      },
                      onError: () => toast.error('Échec de la réinitialisation du chat')
                    });
                  }}
                  disabled={isResetting}
                  className="text-destructive focus:text-destructive"
                >
                  <RotateCcw className={`h-4 w-4 mr-2 ${isResetting ? 'animate-spin' : ''}`} />
                  Réinitialiser le chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowChat(false)}
              className="h-7 w-7"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          </div>
          
        </div>

        {/* Chat Messages */}
        <div ref={scrollContainerRef} className="flex-1 p-3 overflow-y-auto scroll-smooth bg-muted/20">
          <div className="space-y-3">
          {(() => {
            const allMessages = chatHistory?.messages || [];
            // Process messages to extract user questions from system prompt
            const visibleMessages = allMessages
              .map((msg) => {
                // If it's a user message containing the prompt wrapper, extract just the question
                if (msg.role === 'user' && (msg.content.includes('You are a clinical documentation') || msg.content.includes('Current patient_id:'))) {
                  const questionMatch = msg.content.match(/Question:\s*([\s\S]+?)(?=\n\n(?:Utilise le patient_id|Use patient_id|Sois bref|Be brief)|$)/);
                  if (questionMatch && questionMatch[1] && questionMatch[1].trim()) {
                    return { ...msg, content: questionMatch[1].trim() };
                  }
                  // If no question found, skip this message
                  return null;
                }
                return msg;
              })
              .filter((msg): msg is NonNullable<typeof msg> => {
                if (!msg) return false;
                // Skip empty assistant messages
                if (msg.role === 'assistant' && !msg.content.trim()) return false;
                return true;
              });
            
            if (visibleMessages.length === 0) {
              return (
                <div className="flex flex-col items-center pt-8 justify-center h-full text-center space-y-3">
                  <div className="bg-muted rounded-full p-3">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-semibold">Bonjour ! Je suis prêt à vous aider à examiner le dossier de {patient.name}.</h3>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Je peux analyser les résultats de laboratoire, résumer les conclusions et vous assister en fonction des documents pour préparer votre consultation. Que souhaitez-vous aborder ?
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setMessage('Peux-tu me résumer rapidement ses derniers résultats de laboratoire ?');
                      }}
                    >
                      Résumer les analyses
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setMessage('Quelles tendances dois-je surveiller ?');
                      }}
                    >
                      Voir les tendances
                    </Button>
                  </div>
                </div>
              );
            }
            
            return (
              <div className="space-y-3">
                {visibleMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`group flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}
                >
                  {msg.role === 'assistant' && (
                    <Avatar className="h-6 w-6 flex-shrink-0 hidden">
                      <AvatarFallback className="bg-[var(--medicai-green-dark)] text-foreground text-[10px]">AI</AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex flex-col max-w-[85%] gap-1.5">
                    <div
                      className={`rounded-xl px-3 py-2 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground ml-auto'
                          : 'bg-muted'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-normal prose-pre:p-0">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="mb-2.5 last:mb-0 text-xs leading-normal">{children}</p>,
                              ul: ({ children }) => <ul className="mb-2.5 ml-3 list-disc text-xs space-y-1">{children}</ul>,
                              ol: ({ children }) => <ol className="mb-2.5 ml-3 list-decimal text-xs space-y-1">{children}</ol>,
                              li: ({ children }) => <li className="text-xs leading-normal">{children}</li>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              code: ({ children, node, ...props }) => {
                                const isInline = node?.position?.start.line === node?.position?.end.line;
                                return isInline ? (
                                  <code className="bg-muted-foreground/10 rounded px-1 py-0.5 text-[11px] font-mono" {...props}>{children}</code>
                                ) : (
                                  <code className="block bg-muted-foreground/10 rounded-lg p-2 text-[11px] font-mono overflow-x-auto" {...props}>{children}</code>
                                );
                              },
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                          {/* Doc traceability badges */}
                          {(() => {
                            // Collect doc_ids from both: 1) structured sources field, 2) inline text (legacy)
                            const sourcesFromField = (msg as any).sources
                              ? (msg as any).sources.split(',').filter(Boolean)
                              : [];
                            const sourcesFromText = Array.from(msg.content.matchAll(/doc_id:\s*([a-f0-9]{8,})/gi)).map(m => m[1]);
                            const docIds = [...new Set([...sourcesFromField, ...sourcesFromText])];
                            if (docIds.length === 0) return null;
                            return (
                              <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-border/40">
                                <FileText className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                                {docIds.map(docId => {
                                  const doc = patientDocuments?.find((d: any) => d.doc_id === docId);
                                  const label = doc?.document_type || docId.slice(0, 8);
                                  const dateLabel = doc?.date_of_service ? format(new Date(doc.date_of_service), 'dd/MM') : '';
                                  return (
                                    <button
                                      key={docId}
                                      className="group/src inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-[10px] transition-all cursor-pointer border bg-[var(--medicai-green)]/10 text-foreground border-[var(--medicai-green)]/30 hover:bg-[var(--medicai-green)]/20 hover:border-[var(--medicai-green)]/50"
                                      onClick={() => {
                                        setReviewingDocId(docId);
                                        setDocumentSheetOpen(true);
                                      }}
                                      title={`Voir: ${label}${dateLabel ? ` (${dateLabel})` : ''}`}
                                    >
                                      <FileText className="h-2.5 w-2.5 shrink-0 text-[var(--medicai-green-dark)]" />
                                      <span className="font-medium truncate max-w-[100px]">{label}</span>
                                      {dateLabel && <span className="text-[9px] opacity-60">{dateLabel}</span>}
                                      <ExternalLink className="h-2 w-2 opacity-0 group-hover/src:opacity-70 transition-opacity shrink-0 -mr-0.5" />
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <p className="text-xs leading-relaxed">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px]"
                          onClick={() => handleCopyMessage(msg.content, idx)}
                        >
                          {copiedIndex === idx ? (
                            <><Check className="h-2.5 w-2.5 mr-0.5" /> Copié</>
                          ) : (
                            <><Copy className="h-2.5 w-2.5 mr-0.5" /> Copier</>
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]">
                              <ArrowRight className="h-2.5 w-2.5 mr-0.5" /> Insérer
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-48 text-xs">
                            {/* Now Strip destinations */}
                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Résumé</div>
                            <DropdownMenuItem onClick={() => handleInsertToNowStrip(msg.content.slice(0, 150), 'oneliner')}>
                              Résumé
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleInsertToNowStrip(msg.content.slice(0, 100), 'symptom')}>
                              Ajouter comme symptôme
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleInsertToNowStrip(msg.content.slice(0, 60), 'redflag')}>
                              Ajouter comme signal d'alarme
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleInsertToNowStrip(msg.content, 'evidence')}>
                              Ajouter aux preuves
                            </DropdownMenuItem>
                            
                            {/* A&P destinations - with bucket picker */}
                            {problems.length > 0 && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1 pt-1">Évaluation & Plan</div>
                                {problems.map(p => (
                                  <div key={p.id} className="px-2 py-1">
                                    <div className="text-xs font-medium mb-1 truncate">{p.title.slice(0, 25)}</div>
                                    <div className="flex flex-wrap gap-1">
                                      {['today', 'orders', 'treatment', 'follow_up', 'safety_net'].map(bucket => (
                                        <Button
                                          key={bucket}
                                          variant={lastAPDestination?.problemId === p.id && lastAPDestination?.bucket === bucket ? 'secondary' : 'outline'}
                                          size="sm"
                                          className="h-5 text-[10px] px-1.5"
                                          onClick={() => handleAddToAP(msg.content.slice(0, 200), p.id, bucket)}
                                        >
                                          {bucket === 'today' ? 'Aujourd\'hui' : bucket === 'orders' ? 'Ordo' : bucket === 'treatment' ? 'Tx' : bucket === 'follow_up' ? 'Suivi' : 'Alertes'}
                                        </Button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                            
                            <div className="border-t mt-1 pt-1">
                              <DropdownMenuItem onClick={() => {
                                setQuickNotes(prev => [...prev, {
                                  id: Date.now(),
                                  timestamp: format(new Date(), 'h:mm a'),
                                  text: msg.content.slice(0, 300),
                                }]);
                                toast.success('Ajouté aux notes');
                              }}>
                                <MessageSquare className="h-3 w-3 mr-2" />
                                Sauvegarder dans les notes
                              </DropdownMenuItem>
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <Avatar className="h-8 w-8 flex-shrink-0 hidden">
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              {isStreaming && !streamingMessage && (
                <div className="flex justify-start gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0 hidden">
                    <AvatarFallback className="bg-[var(--medicai-green-dark)] text-foreground">AI</AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <svg 
                      width="60" 
                      height="20" 
                      viewBox="0 0 100 28"
                    >
                      <polyline
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points="0,14 10,14 12,8 14,20 16,14 20,14 22,10 24,18 26,14 35,14 37,6 39,22 41,14 50,14 52,9 54,19 56,14 100,14"
                        className="text-foreground"
                        strokeDasharray="150"
                        strokeDashoffset="0"
                      >
                        <animate
                          id="ecgAnim"
                          attributeName="stroke-dashoffset"
                          from="150"
                          to="0"
                          dur="1.5s"
                          repeatCount="indefinite"
                        />
                      </polyline>
                    </svg>
                  </div>
                </div>
              )}
              {isStreaming && streamingMessage && (
                <div className="group flex justify-start gap-2">
                  <Avatar className="h-6 w-6 flex-shrink-0 hidden">
                    <AvatarFallback className="bg-[var(--medicai-green-dark)] text-foreground text-[10px]">AI</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col max-w-[85%] gap-1.5">
                    <div className="rounded-xl px-3 py-2 bg-muted">
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-normal prose-pre:p-0">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p className="mb-2.5 last:mb-0 text-xs leading-normal">{children}</p>,
                            ul: ({ children }) => <ul className="mb-2.5 ml-3 list-disc text-xs space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="mb-2.5 ml-3 list-decimal text-xs space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="text-xs leading-normal">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            code: ({ children, node, ...props }) => {
                              const isInline = node?.position?.start.line === node?.position?.end.line;
                              return isInline ? (
                                <code className="bg-muted-foreground/10 rounded px-1 py-0.5 text-[11px] font-mono" {...props}>{children}</code>
                              ) : (
                                <code className="block bg-muted-foreground/10 rounded-lg p-2 text-[11px] font-mono overflow-x-auto" {...props}>{children}</code>
                              );
                            },
                          }}
                        >
                          {streamingMessage}
                        </ReactMarkdown>
                        <span className="inline-block w-1.5 h-3 bg-[var(--medicai-green-dark)] animate-pulse ml-1" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {isSending && !isStreaming && (
                <div className="flex justify-start">
                  <Avatar className="h-8 w-8 mr-2 hidden">
                    <AvatarFallback className="bg-[var(--medicai-green-dark)] text-foreground">AI</AvatarFallback>
                  </Avatar>
                  <div className="max-w-[70%] rounded-lg p-4 bg-muted">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            );
          })()}
          </div>
        </div>

        {/* Input Area - Modern Integrated Design */}
        <div className="border-t bg-muted/50">
          {/* Pending message undo banner */}
          {pendingMessage && (
            <div className="px-3 py-2 bg-muted border-b flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Sending message...</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndoSend}
                className="h-6 text-xs ml-2 flex-shrink-0"
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </div>
          )}
          
          {/* Main Input Container */}
          <div className="p-2">
            {/* Mode indicator bar */}
            <div className="flex items-center gap-1 mb-1.5 px-1">
              <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
                <button
                  onClick={() => {
                    setComposerMode('ask');
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                    composerMode === 'ask'
                      ? 'bg-background shadow-sm font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <MessageSquare className="h-2.5 w-2.5" />
                  Ask
                </button>
                <button
                  onClick={() => {
                    setComposerMode('note');
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                    composerMode === 'note'
                      ? 'bg-accent text-accent-foreground shadow-sm font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <StickyNote className="h-2.5 w-2.5" />
                  Note
                </button>
              </div>
              {/*<span className="text-[9px] text-muted-foreground ml-1">⌃Q / ⌃⇧N</span>*/}
            </div>

            {/* Input Row */}
            <div className="flex items-center gap-1.5 px-1.5 py-1 bg-background relative">
              {/* Contenteditable input */}
              <div className="flex-1 relative min-h-[20px] max-h-[100px] overflow-y-auto">
                <div
                  ref={inputRef}
                  contentEditable={composerMode === 'ask' ? !(isSending || !consultationId || !!pendingMessage) : true}
                  suppressContentEditableWarning
                  className="outline-none text-xs leading-relaxed break-words whitespace-pre-wrap empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none"
                  data-placeholder={composerMode === 'ask' ? "Tapez / pour les commandes" : "Note rapide..."}
                  onInput={(e) => {
                    const value = e.currentTarget.textContent || '';
                    if (composerMode === 'ask') {
                      setMessage(value);
                      // Check for quick command trigger
                      if (value === '/' || (value.startsWith('/') && value.length <= 10)) {
                        setShowQuickCommands(true);
                        setQuickCommandSearch(value.slice(1));
                      } else {
                        setShowQuickCommands(false);
                      }
                    } else {
                      setNoteInput(value);
                    }
                  }}
                  onKeyDown={(e) => {
                    // Enter to send (without shift)
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (composerMode === 'ask' && message.trim()) {
                        handleSendWithUndo();
                        setMessage('');
                      } else if (composerMode === 'note' && noteInput.trim()) {
                        handleAddNote();
                        setNoteInput('');
                      }
                    }
                    // Escape to close quick commands
                    if (showQuickCommands && e.key === 'Escape') {
                      e.preventDefault();
                      setShowQuickCommands(false);
                    }
                  }}
                  onPaste={(e) => {
                    // Handle paste as plain text
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                  }}
                />
              </div>

              {/* Quick commands dropdown */}
              {showQuickCommands && composerMode === 'ask' && (
                <div className="absolute bottom-full left-0 mb-1 w-44 bg-popover border rounded-lg shadow-lg overflow-hidden z-50">
                  <div className="p-0.5">
                    {[{cmd: '/prep', desc: 'Préparer'}, {cmd: '/labs', desc: 'Analyses'}, {cmd: '/plan', desc: 'Générer plan'}]
                      .filter(item => item.cmd.includes(quickCommandSearch) || !quickCommandSearch)
                      .map((item) => (
                        <button
                          key={item.cmd}
                          onClick={() => {
                            setMessage(item.cmd);
                            setShowQuickCommands(false);
                            if (inputRef.current) {
                              inputRef.current.textContent = item.cmd;
                              inputRef.current.focus();
                              // Move cursor to end
                              const range = document.createRange();
                              const sel = window.getSelection();
                              range.selectNodeContents(inputRef.current);
                              range.collapse(false);
                              sel?.removeAllRanges();
                              sel?.addRange(range);
                            }
                          }}
                          className="w-full text-left px-1.5 py-1 rounded hover:bg-muted transition-colors flex items-center gap-1.5"
                        >
                          <code className="text-[10px] text-primary font-medium">{item.cmd}</code>
                          <span className="text-[10px] text-muted-foreground">{item.desc}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Right Action Buttons */}
              <div className="flex items-center gap-1">
                <Button 
                  onClick={composerMode === 'ask' ? handleSendWithUndo : handleAddNote}
                  disabled={
                    composerMode === 'ask'
                      ? (isSending || !consultationId || !message.trim() || !!pendingMessage)
                      : !noteInput.trim()
                  }
                  size="icon"
                  className={`h-8 w-8 ${
                    composerMode === 'note' ? 'bg-accent text-accent-foreground hover:bg-accent/90' : ''
                  }`}
                  title={composerMode === 'ask' ? 'Envoyer (Entrée)' : 'Ajouter note (Entrée)'}
                >
                  {composerMode === 'ask' ? (
                    <Send className="h-3 w-3" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
          </>
        ) : (
          <div className="flex flex-col items-center py-3 h-full">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowChat(true)}
              className="h-7 w-7 mb-3"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <span className="text-sm font-bold text-foreground [writing-mode:vertical-lr] rotate-180 flex-1 flex items-center justify-center">Chat</span>
          </div>
        )}
      </div>

      

      {/* Force Overwrite Confirmation Dialog */}
      <Dialog open={showForceOverwriteConfirm} onOpenChange={setShowForceOverwriteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Forcer l'écrasement de l'espace ?
            </DialogTitle>
            <DialogDescription>
              Ceci remplacera toutes vos modifications par du contenu nouvellement généré. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowForceOverwriteConfirm(false)}>
              Annuler
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowForceOverwriteConfirm(false);
                setRegenerateMode('overwrite');
                // Reset local state before regenerating
                setHpiOneLiner('');
                setHpiSymptoms([]);
                setHpiRedFlags([]);
                setHpiSinceLastVisit('');
                setHpiObjectiveHighlights([]);
                setProblems([]);
                lastFilledVersionRef.current = -1; // Force re-fill
                generateWorkspace({ force: true, mode: 'overwrite' }, {
                  onSuccess: () => {
                    setWorkspaceVersion(prev => prev + 1);
                    toast.success('Espace de travail régénéré');
                  },
                  onError: () => toast.error('Échec de la régénération')
                });
              }}
            >
              Oui, tout écraser
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sign Consultation Confirmation Dialog */}
      <Dialog open={showSignConfirm} onOpenChange={setShowSignConfirm}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 flex flex-col max-h-[85vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Signer et clôturer la consultation
            </DialogTitle>
            <DialogDescription>
              Ceci va finaliser toute la documentation et préparer les ordonnances pour envoi au patient.
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable content */}
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="px-6 py-4 space-y-4">

              {/* Consultation recap */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Récapitulatif</p>
                <div className="space-y-1.5 text-sm">
                  {visitFocus && (
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-[var(--medicai-green-dark)] mt-0.5 shrink-0" />
                      <span>Motif : <span className="font-medium">{visitFocus}</span></span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-[var(--medicai-green-dark)] mt-0.5 shrink-0" />
                    <span>{problems.length} problème{problems.length !== 1 ? 's' : ''} documenté{problems.length !== 1 ? 's' : ''}</span>
                  </div>
                  {hpiOneLiner && (
                    <div className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-[var(--medicai-green-dark)] mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">HPI renseigné</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Prescriptions */}
              {workspaceOrders.rx_intents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Pill className="h-3 w-3" /> Prescriptions ({workspaceOrders.rx_intents.length})
                  </p>
                  <div className="space-y-1">
                    {workspaceOrders.rx_intents.map((rx, i) => (
                      <div key={rx.id || i} className="text-sm bg-muted/50 rounded-md px-3 py-2 space-y-0.5">
                        {rx.medications.map((med, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <span>
                              <span className="font-medium">{med.name}</span>
                              {med.dosage && <span className="text-muted-foreground"> {med.dosage}</span>}
                              {med.frequency && <span className="text-muted-foreground"> — {med.frequency}</span>}
                              {med.duration && <span className="text-muted-foreground"> × {med.duration}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Referrals */}
              {workspaceOrders.referral_intents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ExternalLink className="h-3 w-3" /> Orientations ({workspaceOrders.referral_intents.length})
                  </p>
                  <div className="space-y-1">
                    {workspaceOrders.referral_intents.map((ref, i) => (
                      <div key={ref.id || i} className="text-sm bg-muted/50 rounded-md px-3 py-2 flex items-start gap-2">
                        <span className="text-muted-foreground mt-0.5">•</span>
                        <span>
                          <span className="font-medium">{ref.to_specialty}</span>
                          {ref.to_provider_name && <span className="text-muted-foreground"> — Dr. {ref.to_provider_name}</span>}
                          {ref.reason && <span className="text-muted-foreground"> : {ref.reason}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Follow-ups */}
              {workspaceOrders.followup_intents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" /> Suivis ({workspaceOrders.followup_intents.length})
                  </p>
                  <div className="space-y-1">
                    {workspaceOrders.followup_intents.map((fu, i) => (
                      <div key={fu.id || i} className="text-sm bg-muted/50 rounded-md px-3 py-2 flex items-start gap-2">
                        <span className="text-muted-foreground mt-0.5">•</span>
                        <span>
                          <span className="font-medium">{fu.timeframe}</span>
                          {fu.reason && <span className="text-muted-foreground"> — {fu.reason}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lab / Imaging */}
              {workspaceOrders.lab_imaging_intents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <FileImage className="h-3 w-3" /> Laboratoire / Imagerie ({workspaceOrders.lab_imaging_intents.length})
                  </p>
                  <div className="space-y-1">
                    {workspaceOrders.lab_imaging_intents.map((li, i) => (
                      <div key={li.id || i} className="text-sm bg-muted/50 rounded-md px-3 py-2">
                        {li.tests.map((t, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <span className="font-medium">{t.name}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated documents */}
              {workspaceOrders.documents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Documents générés ({workspaceOrders.documents.length})
                  </p>
                  <div className="space-y-1">
                    {workspaceOrders.documents.map((doc, i) => {
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
                        <div key={doc.id || i} className="text-sm bg-muted/50 rounded-md px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{typeLabels[doc.artifact_type] || doc.artifact_type}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {statusLabels[doc.status] || doc.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {(workspaceOrders.documents.filter(d => d.status === 'draft').length > 0 ||
                workspaceOrders.pending_actions.filter(a => a.status === 'pending').length > 0 ||
                quickNotes.length > 0) && (
                <div className="space-y-1.5 pt-1">
                  {workspaceOrders.documents.filter(d => d.status === 'draft').length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-amber-600">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{workspaceOrders.documents.filter(d => d.status === 'draft').length} document{workspaceOrders.documents.filter(d => d.status === 'draft').length !== 1 ? 's' : ''} encore en brouillon</span>
                    </div>
                  )}
                  {workspaceOrders.pending_actions.filter(a => a.status === 'pending').length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-amber-600">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{workspaceOrders.pending_actions.filter(a => a.status === 'pending').length} action{workspaceOrders.pending_actions.filter(a => a.status === 'pending').length !== 1 ? 's' : ''} en attente</span>
                    </div>
                  )}
                  {quickNotes.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-amber-600">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{quickNotes.length} note{quickNotes.length !== 1 ? 's' : ''} non triée{quickNotes.length !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              )}

            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSignConfirm(false)}>
              Annuler
            </Button>
            <Button 
              onClick={() => {
                setShowSignConfirm(false);
                handleSignConsultation();
              }}
              disabled={isSigningConsultation}
            >
              <FileCheck className="h-4 w-4 mr-2" />
              {isSigningConsultation ? 'Signature...' : 'Signer et clôturer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Review Sheet */}
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
                      <Check className="h-5 w-5 text-accent-foreground" />
                      Document revu
                    </>
                  ) : (
                    <>
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      En attente de revue
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
                  <h3 className="font-medium text-sm">Document original</h3>
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
                            title="Zoom +"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setImageZoom(Math.max(imageZoom - 0.25, 0.5))}
                            className="bg-white/90 hover:bg-white p-2 rounded-md shadow-md transition-colors"
                            title="Zoom -"
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
                            title="Réinitialiser"
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
                                      <p class="text-muted-foreground">Aperçu non disponible</p>
                                      <a href="${process.env.NEXT_PUBLIC_API_URL || ''}${reviewingDocument.source_file_url}" target="_blank" class="text-accent-foreground hover:underline text-sm">Ouvrir dans un nouvel onglet</a>
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
                      <p className="text-muted-foreground">Aperçu non disponible</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Extracted Data */}
              <div className="border rounded-lg overflow-hidden flex flex-col">
                <div className="bg-muted p-3 border-b flex items-center justify-between">
                  <h3 className="font-medium text-sm">Données extraites</h3>
                  <div className="flex gap-2">
                    {!isEditingExtractedData && reviewingDocument?.review_status === 'pending' && (
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
                        Modifier
                      </Button>
                    )}
                    {isEditingExtractedData && (
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
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-black hover:bg-neutral-800"
                          onClick={async () => {
                            if (!editedDocumentContent || !reviewingDocId) return;
                            
                            setIsSavingExtractedData(true);
                            try {
                              await documentsApi.updateExtractedData(reviewingDocId, editedDocumentContent);
                              toast.success('Données mises à jour avec succès');
                              
                              // Refresh the document
                              queryClient.invalidateQueries({ queryKey: ['documents', reviewingDocId] });
                              
                              setIsEditingExtractedData(false);
                              setEditedDocumentContent(null);
                            } catch (error) {
                              console.error('Failed to update extracted data:', error);
                              toast.error('Échec de la mise à jour des données');
                            } finally {
                              setIsSavingExtractedData(false);
                            }
                          }}
                          disabled={isSavingExtractedData}
                        >
                          {isSavingExtractedData ? 'Enregistrement...' : 'Enregistrer'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-4">
                    {/* Document Type */}
                    <div>
                      <h4 className="font-medium text-sm mb-2">Type de document</h4>
                      <p className="text-sm">{reviewingDocument.document_type}</p>
                    </div>

                    {/* Date of Service */}
                    {(reviewingDocument.date_of_service || reviewingDocument.content?.metadata?.date_of_service) && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Date de service</h4>
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
                        <h4 className="font-medium text-sm mb-3">Analyses de laboratoire</h4>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted">
                              <tr>
                                <th className="text-left p-3 font-medium">Nom du test</th>
                                <th className="text-right p-3 font-medium">Valeur</th>
                                <th className="text-left p-3 font-medium">Unité</th>
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
                            <h4 className="font-medium text-sm mb-2">Type d'examen</h4>
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
                            <h4 className="font-medium text-sm mb-2">Contexte clinique</h4>
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
                            <h4 className="font-medium text-sm mb-2">Technique d'examen</h4>
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
                            <h4 className="font-medium text-sm mb-2">Résultats</h4>
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
                            <h4 className="font-medium text-sm mb-3">Médicaments</h4>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted">
                                  <tr>
                                    <th className="text-left p-3 font-medium">Nom du médicament</th>
                                    <th className="text-left p-3 font-medium">Forme</th>
                                    <th className="text-left p-3 font-medium">Dosage</th>
                                    <th className="text-left p-3 font-medium">Fréquence</th>
                                    <th className="text-left p-3 font-medium">Durée</th>
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
                        <h4 className="font-medium text-sm mb-2">Données brutes</h4>
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
                      toast.success('Document marqué comme en attente');
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
                  Marquer comme en attente
                </Button>
              ) : (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Veuillez vérifier les données extraites avant de marquer comme revu
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
                  Fermer
                </Button>
                {reviewingDocument?.review_status !== 'reviewed' && (
                  <Button
                    onClick={async () => {
                      try {
                        await documentsApi.markAsReviewed(reviewingDocId!);
                        toast.success('Document marqué comme revu');
                        queryClient.invalidateQueries({ queryKey: ['documents', reviewingDocId] });
                        queryClient.invalidateQueries({ queryKey: ['patients', patientId, 'documents'] });
                        queryClient.invalidateQueries({ queryKey: ['patients', patientId] });
                        queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
                        setDocumentSheetOpen(false);
                        setReviewingDocId(null);
                      } catch (error) {
                        toast.error('Erreur lors de la mise à jour du document');
                      }
                    }}
                    className="gap-2 bg-black hover:bg-neutral-800"
                  >
                    <Check className="h-4 w-4" />
                    Marquer comme revu
                  </Button>
                )}
              </div>
            </div>
          </>
          ) : (
            <div className="flex items-center justify-center flex-1">
              <p className="text-muted-foreground">Chargement du document...</p>
            </div>
          )}
        </SheetContent>
      </Sheet>

    </div>
  );
}
