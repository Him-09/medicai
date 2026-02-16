// Order Intents - Structured data for generating documents
// These are the SOURCE OF TRUTH, documents are artifacts derived from them

// =============================================================================
// PRESCRIPTION (Rx) INTENT
// =============================================================================
export interface MedicationItem {
  id: string;
  name: string;                    // Drug name
  dosage: string;                  // e.g., "500mg"
  form: string;                    // e.g., "comprimé", "gélule", "sirop"
  frequency: string;               // e.g., "3x/jour", "matin et soir"
  duration: string;                // e.g., "7 jours", "1 mois"
  instructions?: string;           // e.g., "à prendre avec les repas"
  quantity?: number;               // Number of units to dispense
  refills?: number;                // Number of refills allowed
}

export interface RxIntent {
  id: string;
  type: 'rx';
  medications: MedicationItem[];
  general_instructions?: string;   // Global instructions for the prescription
  valid_until?: string;            // Prescription validity date
  renewable: boolean;              // Can pharmacy renew?
  destination_channels: ('print' | 'email' | 'whatsapp')[];
  // Metadata
  created_at: string;
  updated_at: string;
  source_problem_id?: string;      // Link to problem that triggered this
  source_plan_item_ids?: string[]; // Plan items that became this Rx
}

// =============================================================================
// REFERRAL INTENT
// =============================================================================
export interface ReferralIntent {
  id: string;
  type: 'referral';
  to_specialty: string;            // e.g., "Cardiologie", "Neurologie"
  to_provider_id?: string;         // If known provider
  to_provider_name?: string;       // If free text
  to_provider_contact?: string;    // Email/phone of receiving provider
  urgency: 'routine' | 'urgent' | 'emergency';
  reason: string;                  // Why referring
  clinical_summary: string;        // Patient summary for the specialist
  relevant_findings?: string[];    // Key findings to include
  attachments?: string[];          // Document IDs to attach
  questions_for_specialist?: string[]; // Specific questions
  destination_channels: ('print' | 'email' | 'fax')[];
  // Metadata
  created_at: string;
  updated_at: string;
  source_problem_id?: string;
  source_plan_item_ids?: string[];
}

// =============================================================================
// FOLLOW-UP INTENT
// =============================================================================
export interface FollowupIntent {
  id: string;
  type: 'followup';
  timeframe: string;               // e.g., "2 semaines", "1 mois"
  target_date?: string;            // Specific date if set
  reason: string;                  // Why follow-up needed
  focus_items: string[];           // What to check at follow-up
  pre_visit_instructions?: string; // e.g., "Venir à jeun"
  labs_before_visit?: string[];    // Labs to do before appointment
  reminders: {
    enabled: boolean;
    timing: '1_day' | '3_days' | '1_week';
    channels: ('sms' | 'email' | 'whatsapp')[];
  };
  auto_create_consultation: boolean; // Auto-create the follow-up consultation
  // Metadata
  created_at: string;
  updated_at: string;
  source_problem_id?: string;
  source_plan_item_ids?: string[];
}

// =============================================================================
// LAB/IMAGING ORDER INTENT (future, but define now)
// =============================================================================
export interface LabImagingIntent {
  id: string;
  type: 'lab' | 'imaging';
  tests: Array<{
    code?: string;                 // LOINC or local code
    name: string;
    indication?: string;
  }>;
  clinical_indication: string;
  urgency: 'routine' | 'urgent' | 'stat';
  fasting_required?: boolean;
  special_instructions?: string;
  destination_lab?: string;        // Preferred lab/imaging center
  destination_channels: ('print' | 'email')[];
  // Metadata
  created_at: string;
  updated_at: string;
  source_problem_id?: string;
  source_plan_item_ids?: string[];
}

// Union type for all intents
export type OrderIntent = RxIntent | ReferralIntent | FollowupIntent | LabImagingIntent;

// =============================================================================
// GENERATED DOCUMENT (Artifact)
// =============================================================================
export interface GeneratedDocument {
  id: string;
  consultation_id: string;
  artifact_type: 'prescription' | 'referral_letter' | 'followup_plan' | 'lab_order' | 'visit_note';
  status: 'draft' | 'reviewed' | 'signed' | 'sent' | 'delivered' | 'failed';
  
  // Source of truth
  derived_from_intent_ids: string[];
  
  // Content
  content_html?: string;           // Rendered HTML
  content_pdf_url?: string;        // Generated PDF URL
  content_text?: string;           // Plain text version
  
  // Delivery
  channel?: 'email' | 'whatsapp' | 'print' | 'fax';
  recipient_contact?: string;      // Email/phone where sent
  
  // Audit trail
  created_at: string;
  created_by: string;
  reviewed_at?: string;
  reviewed_by?: string;
  signed_at?: string;
  signed_by?: string;
  sent_at?: string;
  sent_by?: string;
  delivery_status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  delivery_error?: string;
}

// =============================================================================
// ACTION JOB (Event-driven actions)
// =============================================================================
export interface ActionJob {
  id: string;
  consultation_id: string;
  document_id: string;
  
  action_type: 
    | 'send_prescription_whatsapp'
    | 'send_prescription_email'
    | 'send_referral_email'
    | 'send_referral_fax'
    | 'schedule_followup_consultation'
    | 'send_reminder_sms'
    | 'send_reminder_whatsapp';
  
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  
  // Payload depends on action type
  payload: Record<string, any>;
  
  // Execution
  attempts: number;
  max_attempts: number;
  last_attempt_at?: string;
  error_message?: string;
  
  // Audit
  created_at: string;
  created_by: string;
  completed_at?: string;
  result?: Record<string, any>;
}

// =============================================================================
// TEMPLATE SYSTEM
// =============================================================================
export interface OrderTemplate {
  id: string;
  name: string;
  type: 'rx' | 'referral' | 'followup' | 'lab' | 'visit_note';
  specialty?: string;              // e.g., "general", "cardiology", "pediatrics"
  visit_type?: string;             // e.g., "initial", "followup", "urgent"
  is_default: boolean;             // MedicAI default template
  is_user_custom: boolean;         // User has customized it
  
  // Template content (Handlebars/Mustache style)
  template_html: string;
  template_text?: string;
  
  // Prefill suggestions based on context
  prefill_rules?: Array<{
    condition: string;             // e.g., "problem.title contains 'HTA'"
    prefill_data: Partial<OrderIntent>;
  }>;
  
  // Metadata
  created_at: string;
  updated_at: string;
  user_id?: string;                // null for system defaults
}

// =============================================================================
// WORKSPACE ORDERS (replaces standaloneOrders)
// =============================================================================
export interface WorkspaceOrders {
  rx_intents: RxIntent[];
  referral_intents: ReferralIntent[];
  followup_intents: FollowupIntent[];
  lab_imaging_intents: LabImagingIntent[];
  
  // Generated documents linked to this consultation
  documents: GeneratedDocument[];
  
  // Pending actions
  pending_actions: ActionJob[];
}

// =============================================================================
// PATIENT CONTACT VERIFICATION (for send safety)
// =============================================================================
export interface PatientContact {
  email?: string;
  email_verified: boolean;
  phone?: string;
  phone_verified: boolean;
  whatsapp_enabled: boolean;
  preferred_channel: 'email' | 'whatsapp' | 'sms' | 'print';
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
export const createRxIntent = (partial?: Partial<RxIntent>): RxIntent => ({
  id: crypto.randomUUID(),
  type: 'rx',
  medications: [],
  renewable: false,
  destination_channels: ['print'],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...partial,
});

export const createReferralIntent = (partial?: Partial<ReferralIntent>): ReferralIntent => ({
  id: crypto.randomUUID(),
  type: 'referral',
  to_specialty: '',
  urgency: 'routine',
  reason: '',
  clinical_summary: '',
  destination_channels: ['email'],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...partial,
});

export const createFollowupIntent = (partial?: Partial<FollowupIntent>): FollowupIntent => ({
  id: crypto.randomUUID(),
  type: 'followup',
  timeframe: '2 semaines',
  reason: '',
  focus_items: [],
  reminders: {
    enabled: true,
    timing: '1_day',
    channels: ['sms'],
  },
  auto_create_consultation: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...partial,
});

export const createLabImagingIntent = (type: 'lab' | 'imaging', partial?: Partial<LabImagingIntent>): LabImagingIntent => ({
  id: crypto.randomUUID(),
  type,
  tests: [],
  clinical_indication: '',
  urgency: 'routine',
  destination_channels: ['print'],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...partial,
});
