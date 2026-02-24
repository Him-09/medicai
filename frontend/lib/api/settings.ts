import { authService } from '../auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function authHeaders(): Record<string, string> {
  const token = authService.getToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  specialty?: string;
  phone?: string;
  license_number?: string;
  clinic_id?: string;
  photo_url?: string;
  signature_url?: string;
  stamp_url?: string;
}

export interface DaySchedule {
  day: string;
  enabled: boolean;
  start: string;
  end: string;
  break_start?: string;
  break_end?: string;
}

export interface Session {
  session_id: string;
  device?: string;
  ip_address?: string;
  created_at: string;
  last_active?: string;
  is_current?: boolean;
}

export interface TeamMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  specialty?: string;
  status: string;
  joined_at?: string;
}

export interface TeamListResponse {
  members: TeamMember[];
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
  }>;
}

export interface Template {
  id: string;
  name: string;
  category?: string;
  content: Record<string, unknown>;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Snippet {
  id: string;
  trigger: string;
  content: string;
  category?: string;
  created_at?: string;
}

export interface ReportStat {
  label: string;
  value: number;
  change?: number;
}

export interface WeeklyData {
  day: string;
  consultations: number;
  documents: number;
}

export interface DocumentTypeBreakdown {
  type: string;
  count: number;
  percentage: number;
}

export interface ReportStats {
  overview: ReportStat[];
  weekly: WeeklyData[];
  document_types: DocumentTypeBreakdown[];
}

export interface NotificationSettings {
  email_notifications: boolean;
  document_ready: boolean;
  consultation_reminders: boolean;
  team_updates: boolean;
}

export const settingsApi = {
  getProfile: () =>
    fetch(`${API_BASE}/api/settings/profile`, { headers: authHeaders() }).then(handleResponse),
  updateProfile: (data: Partial<UserProfile>) =>
    fetch(`${API_BASE}/api/settings/profile`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  changePassword: (data: { current_password: string; new_password: string }) =>
    fetch(`${API_BASE}/api/settings/change-password`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),

  getClinic: () =>
    fetch(`${API_BASE}/api/settings/clinic`, { headers: authHeaders() }).then(handleResponse),
  getClinicSettings: () =>
    fetch(`${API_BASE}/api/settings/clinic`, { headers: authHeaders() }).then(handleResponse),
  updateClinic: (data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/settings/clinic`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  getSchedule: () =>
    fetch(`${API_BASE}/api/settings/clinic/schedule`, { headers: authHeaders() }).then(handleResponse),
  updateSchedule: (data: DaySchedule[]) =>
    fetch(`${API_BASE}/api/settings/clinic/schedule`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),

  getSessions: () =>
    fetch(`${API_BASE}/api/settings/sessions`, { headers: authHeaders() }).then(handleResponse),
  deleteSession: (id: string) =>
    fetch(`${API_BASE}/api/settings/sessions/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
  logoutAll: () =>
    fetch(`${API_BASE}/api/settings/sessions/logout-all`, { method: 'POST', headers: authHeaders() }).then(handleResponse),

  uploadPhoto: (file: File) => {
    const token = authService.getToken();
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE}/api/settings/profile/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(handleResponse);
  },
  deletePhoto: () =>
    fetch(`${API_BASE}/api/settings/profile/photo`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
  uploadSignature: (file: File) => {
    const token = authService.getToken();
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE}/api/settings/profile/signature`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(handleResponse);
  },
  deleteSignature: () =>
    fetch(`${API_BASE}/api/settings/profile/signature`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
  uploadStamp: (file: File) => {
    const token = authService.getToken();
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE}/api/settings/profile/stamp`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(handleResponse);
  },
  deleteStamp: () =>
    fetch(`${API_BASE}/api/settings/profile/stamp`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
  getProfileImages: () =>
    fetch(`${API_BASE}/api/settings/profile/images`, { headers: authHeaders() }).then(handleResponse),

  getSystemStatus: () =>
    fetch(`${API_BASE}/api/settings/system/status`, { headers: authHeaders() }).then(handleResponse),
  getAuditLog: () =>
    fetch(`${API_BASE}/api/settings/audit-log`, { headers: authHeaders() }).then(handleResponse),

  getNotifications: () =>
    fetch(`${API_BASE}/api/settings/notifications`, { headers: authHeaders() }).then(handleResponse),
  updateNotifications: (data: Partial<NotificationSettings>) =>
    fetch(`${API_BASE}/api/settings/notifications`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),

  getPrivacy: () =>
    fetch(`${API_BASE}/api/settings/privacy`, { headers: authHeaders() }).then(handleResponse),
  updatePrivacy: (data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/settings/privacy`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  exportData: () =>
    fetch(`${API_BASE}/api/settings/export-data`, { method: 'POST', headers: authHeaders() }).then(handleResponse),
  deleteAccount: (data: { password: string }) =>
    fetch(`${API_BASE}/api/settings/delete-account`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),

  getTemplates: () =>
    fetch(`${API_BASE}/api/settings/templates`, { headers: authHeaders() }).then(handleResponse),
  createTemplate: (data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/settings/templates`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  updateTemplate: (id: string, data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/settings/templates/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  deleteTemplate: (id: string) =>
    fetch(`${API_BASE}/api/settings/templates/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),

  getSnippets: () =>
    fetch(`${API_BASE}/api/settings/snippets`, { headers: authHeaders() }).then(handleResponse),
  createSnippet: (data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/settings/snippets`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  updateSnippet: (id: string, data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/settings/snippets/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  deleteSnippet: (id: string) =>
    fetch(`${API_BASE}/api/settings/snippets/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),

  getReportStats: () =>
    fetch(`${API_BASE}/api/settings/reports/stats`, { headers: authHeaders() }).then(handleResponse),

  getTeam: () =>
    fetch(`${API_BASE}/api/settings/team`, { headers: authHeaders() }).then(handleResponse),
  inviteTeamMember: (data: { email: string; role: string }) =>
    fetch(`${API_BASE}/api/settings/team/invite`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  updateMemberRole: (memberId: string, role: string) =>
    fetch(`${API_BASE}/api/settings/team/${memberId}/role`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ role }) }).then(handleResponse),
  removeMember: (memberId: string) =>
    fetch(`${API_BASE}/api/settings/team/${memberId}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
  cancelInvitation: (invitationId: string) =>
    fetch(`${API_BASE}/api/settings/team/invitations/${invitationId}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
  getMyRole: () =>
    fetch(`${API_BASE}/api/settings/team/role`, { headers: authHeaders() }).then(handleResponse),
};
