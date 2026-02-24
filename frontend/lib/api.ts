import { authService } from './auth';

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

export const patientsApi = {
  list: (status?: string) => {
    const q = status ? `?status=${status}` : '';
    return fetch(`${API_BASE}/api/patients${q}`, { headers: authHeaders() }).then(handleResponse);
  },
  get: (id: string) =>
    fetch(`${API_BASE}/api/patients/${id}`, { headers: authHeaders() }).then(handleResponse),
  create: (data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/patients`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  update: (id: string, data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/patients/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  delete: (id: string) =>
    fetch(`${API_BASE}/api/patients/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
  snapshot: (id: string) =>
    fetch(`${API_BASE}/api/patients/${id}/snapshot`, { headers: authHeaders() }).then(handleResponse),
  changes: (id: string, consultationId?: string) => {
    const q = consultationId ? `?current_consultation_id=${consultationId}` : '';
    return fetch(`${API_BASE}/api/patients/${id}/changes${q}`, { headers: authHeaders() }).then(handleResponse);
  },
};

export const consultationsApi = {
  list: (params?: { patient_id?: string; status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.patient_id) q.set('patient_id', params.patient_id);
    if (params?.status) q.set('status', params.status);
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetch(`${API_BASE}/api/consultations${qs}`, { headers: authHeaders() }).then(handleResponse);
  },
  get: (id: string) =>
    fetch(`${API_BASE}/api/consultations/${id}`, { headers: authHeaders() }).then(handleResponse),
  create: (data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/consultations`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  update: (id: string, data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/consultations/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) }).then(handleResponse),
  delete: (id: string) =>
    fetch(`${API_BASE}/api/consultations/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
  sign: (id: string) =>
    fetch(`${API_BASE}/api/consultations/${id}/sign`, { method: 'POST', headers: authHeaders() }).then(handleResponse),
  prep: (id: string) =>
    fetch(`${API_BASE}/api/consultations/${id}/prep`, { headers: authHeaders() }).then(handleResponse),
  summary: (id: string) =>
    fetch(`${API_BASE}/api/consultations/${id}/summary`, { headers: authHeaders() }).then(handleResponse),
  generateSummary: (id: string, patientId?: string) => {
    const q = patientId ? `?patient_id=${patientId}` : '';
    return fetch(`${API_BASE}/api/consultations/${id}/summary${q}`, { method: 'POST', headers: authHeaders() }).then(handleResponse);
  },
  patientConsultations: (patientId: string) =>
    fetch(`${API_BASE}/api/consultations/patients/${patientId}/consultations`, { headers: authHeaders() }).then(handleResponse),
};

export const documentsApi = {
  upload: (patientId: string, file: File) => {
    const token = authService.getToken();
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE}/api/patients/${patientId}/documents:upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(handleResponse);
  },
  listByPatient: (patientId: string, reviewStatus?: string) => {
    const q = reviewStatus ? `?review_status=${reviewStatus}` : '';
    return fetch(`${API_BASE}/api/patients/${patientId}/documents${q}`, { headers: authHeaders() }).then(handleResponse);
  },
  get: (docId: string) =>
    fetch(`${API_BASE}/api/documents/${docId}`, { headers: authHeaders() }).then(handleResponse),
  getRawUrl: (docId: string) => `${API_BASE}/api/documents/${docId}/raw`,
  pendingCount: () =>
    fetch(`${API_BASE}/api/documents/pending/count`, { headers: authHeaders() }).then(handleResponse),
  pending: (limit?: number) => {
    const q = limit ? `?limit=${limit}` : '';
    return fetch(`${API_BASE}/api/documents/pending${q}`, { headers: authHeaders() }).then(handleResponse);
  },
  review: (docId: string, status: string) =>
    fetch(`${API_BASE}/api/documents/${docId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ review_status: status }),
    }).then(handleResponse),
  reassign: (docId: string, patientId: string) =>
    fetch(`${API_BASE}/api/documents/${docId}/reassign`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ patient_id: patientId }),
    }).then(handleResponse),
  delete: (docId: string) =>
    fetch(`${API_BASE}/api/documents/${docId}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
  updateExtractedData: (docId: string, data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/documents/${docId}/extracted-data`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse),
};

export const workspaceApi = {
  get: (consultationId: string) =>
    fetch(`${API_BASE}/api/consultations/${consultationId}/workspace`, { headers: authHeaders() }).then(handleResponse),
  save: (consultationId: string, data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/consultations/${consultationId}/workspace`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse),
  create: (consultationId: string) =>
    fetch(`${API_BASE}/api/consultations/${consultationId}/workspace`, {
      method: 'POST',
      headers: authHeaders(),
    }).then(handleResponse),
};
