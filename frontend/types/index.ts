export interface Patient {
  id: string;
  name: string;
  dob: string;
  sex?: 'M' | 'F';
  age?: number;
  patientId: string;
  lastConsultation?: string;
  documentsCount: number;
  pendingDocumentsCount?: number;
  status: 'active' | 'archived';
  email?: string;
  phone?: string;
  scheduled?: boolean;
  medical_history?: string;
  allergies?: string[];
  active_problems?: string[];
}

export interface Consultation {
  id: string;
  patientId: string;
  patientName: string;
  patientDob: string;
  name?: string;
  consultationTime?: string;
  documentsCount: number;
  status: 'active' | 'completed' | 'canceled' | 'archived';
  createdAt: string;
}

export interface PatientSnapshot {
  patient_id: string;
  active_problems?: string[];
  current_medications?: Array<{ name: string; dose?: string } | string>;
  allergies?: string[];
  latest_lab?: {
    doc_id: string;
    date_of_service?: string;
    panel_name?: string;
    tests?: Array<{
      name: string;
      value: string | number;
      unit?: string;
      ref_low?: number | null;
      ref_high?: number | null;
      flag?: string | null;
    }>;
  };
  latest_radiology?: {
    doc_id: string;
    date_of_service?: string;
    type_examen?: string;
    conclusion?: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface DashboardStats {
  todaysConsultations: number;
  patientsWithNewDocuments: number;
  waitingForReview: number;
}

export interface DocumentListItem {
  doc_id: string;
  patient_id: string;
  document_type: string;
  date_of_service?: string;
  source_file?: string;
  doc_date?: string;
  review_status?: 'pending' | 'reviewed';
  reviewed_at?: string;
}

export interface DocumentDetail {
  doc_id: string;
  patient_id: string;
  document_type: string;
  date_of_service?: string;
  source_file?: string;
  source_file_url?: string;
  doc_date?: string;
  review_status?: 'pending' | 'reviewed';
  reviewed_at?: string;
  content: Record<string, any>;
}

export interface NewDocument {
  doc_id: string;
  document_type: string;
  date_of_service?: string;
  processed_at: string;
}

export interface AbnormalLab {
  test_name: string;
  value: string;
  unit: string;
  flag: string;
  date_of_service: string;
  trend: 'new_abnormal' | 'worsening';
  previous_value?: string;
}

export interface NewImaging {
  report_id: string;
  type_examen: string;
  date_of_service: string;
  conclusion?: string;
}

export interface PatientChanges {
  since?: string;
  new_documents: NewDocument[];
  new_abnormals: AbnormalLab[];
  worsening_trends: AbnormalLab[];
  new_imaging: NewImaging[];
}

export interface CanvasSections {
  summary?: string;
  red_flags?: string;
  timeline?: string;
  active_problems?: string;
  meds?: string;
  labs_highlights?: string;
  imaging_highlights?: string;
  questions?: string;
}

export interface Canvas {
  patient_id: string;
  consultation_id: string;
  sections: CanvasSections;
  finalized?: boolean;
}

export * from './default-templates';
