import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi, consultationsApi, documentsApi, workspaceApi } from './api';
import { settingsApi } from './api/settings';
import { authService } from './auth';
import type { Patient, Consultation, PatientSnapshot, DocumentListItem, DocumentDetail, PatientChanges } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function authHeaders(): Record<string, string> {
  const token = authService.getToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () =>
      fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() }).then(r => r.ok ? r.json() : null),
  });
}

export function useDashboardStats() {
  const { data: consultations } = useConsultations();
  const { data: pendingDocs } = usePendingDocuments();
  const { data: patients } = usePatients();

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysConsultations = consultations?.filter((c: Consultation) =>
    c.consultationTime?.startsWith(todayStr)
  ).length || 0;

  return useQuery({
    queryKey: ['dashboardStats', todaysConsultations, pendingDocs?.count, patients?.length],
    queryFn: async () => ({
      todaysConsultations,
      patientsWithNewDocuments: pendingDocs?.count || 0,
      waitingForReview: pendingDocs?.count || 0,
    }),
    enabled: true,
  });
}

export function usePatients() {
  return useQuery<Patient[]>({
    queryKey: ['patients'],
    queryFn: async () => {
      const data = await patientsApi.list();
      return data.patients || [];
    },
  });
}

export function usePatient(patientId: string) {
  return useQuery<Patient>({
    queryKey: ['patient', patientId],
    queryFn: () => patientsApi.get(patientId),
    enabled: !!patientId,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => patientsApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patients'] }),
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      patientsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient'] });
    },
  });
}

export function useDeletePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => patientsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patients'] }),
  });
}

export function usePatientSnapshot(patientId: string) {
  return useQuery<PatientSnapshot>({
    queryKey: ['patientSnapshot', patientId],
    queryFn: () => patientsApi.snapshot(patientId),
    enabled: !!patientId,
  });
}

export function usePatientChanges(patientId: string, consultationId?: string) {
  return useQuery<PatientChanges>({
    queryKey: ['patientChanges', patientId, consultationId],
    queryFn: () => patientsApi.changes(patientId, consultationId),
    enabled: !!patientId,
  });
}

export function usePatientDocuments(patientId: string) {
  return useQuery<DocumentListItem[]>({
    queryKey: ['patientDocuments', patientId],
    queryFn: async () => {
      const data = await documentsApi.listByPatient(patientId);
      return Array.isArray(data) ? data : data.documents || [];
    },
    enabled: !!patientId,
  });
}

export function useConsultations() {
  return useQuery<Consultation[]>({
    queryKey: ['consultations'],
    queryFn: async () => {
      const data = await consultationsApi.list();
      return data.consultations || [];
    },
  });
}

export function useConsultation(consultationId: string) {
  return useQuery<Consultation>({
    queryKey: ['consultation', consultationId],
    queryFn: () => consultationsApi.get(consultationId),
    enabled: !!consultationId,
  });
}

export function useCreateConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => consultationsApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultations'] }),
  });
}

export function useUpdateConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      consultationsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      queryClient.invalidateQueries({ queryKey: ['consultation'] });
    },
  });
}

export function useCancelConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => consultationsApi.update(id, { status: 'canceled' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultations'] }),
  });
}

export function useResetConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => consultationsApi.update(id, { status: 'active' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultations'] }),
  });
}

export function useConsultationSummary(consultationId?: string) {
  return useQuery({
    queryKey: ['consultationSummary', consultationId],
    queryFn: () => consultationsApi.summary(consultationId!),
    enabled: !!consultationId,
  });
}

export function useConsultationPrep(consultationId: string) {
  return useMutation({
    mutationFn: () => consultationsApi.prep(consultationId),
  });
}

export function useGenerateWorkspace(consultationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => workspaceApi.create(consultationId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['workspace', consultationId] }),
  });
}

export function useDocument(docId: string) {
  return useQuery<DocumentDetail>({
    queryKey: ['document', docId],
    queryFn: () => documentsApi.get(docId),
    enabled: !!docId,
  });
}

export function useReassignDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, patientId }: { docId: string; patientId: string }) =>
      documentsApi.reassign(docId, patientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patientDocuments'] });
      queryClient.invalidateQueries({ queryKey: ['document'] });
    },
  });
}

export function usePendingDocuments(limit?: number) {
  return useQuery({
    queryKey: ['pendingDocuments', limit],
    queryFn: () => documentsApi.pending(limit),
  });
}

export function useWorkspace(consultationId: string) {
  return useQuery({
    queryKey: ['workspace', consultationId],
    queryFn: () => workspaceApi.get(consultationId),
    enabled: !!consultationId,
  });
}

export function useUpdateWorkspace(consultationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      workspaceApi.save(consultationId, data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['workspace', consultationId] }),
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const data = await settingsApi.getTemplates();
      return Array.isArray(data) ? data : data.templates || [];
    },
  });
}

export function useClinicSchedule() {
  return useQuery({
    queryKey: ['clinicSchedule'],
    queryFn: () => settingsApi.getSchedule(),
  });
}

export function useClinicSettings() {
  return useQuery({
    queryKey: ['clinicSettings'],
    queryFn: () => settingsApi.getClinic(),
  });
}

export function useSendMessage(_consultationId: string) {
  return useMutation({
    mutationFn: async (_msg: string) => {
      return { role: 'assistant' as const, content: 'Chat feature is not available.' };
    },
  });
}

export function useChatMessages(_consultationId: string) {
  return useQuery({
    queryKey: ['chatMessages', _consultationId],
    queryFn: async () => [] as Array<{ role: string; content: string }>,
    enabled: false,
  });
}
