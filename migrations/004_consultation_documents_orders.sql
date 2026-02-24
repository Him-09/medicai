CREATE TABLE IF NOT EXISTS consultation_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,

    intent_type TEXT NOT NULL CHECK (intent_type IN ('rx_intent', 'referral_intent', 'followup_intent', 'lab_imaging_intent')),

    intent_data JSONB NOT NULL,

    source_problem_id TEXT,

    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT consultation_orders_intent_type_idx UNIQUE (consultation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_consultation_orders_consultation ON consultation_orders(consultation_id);
CREATE INDEX IF NOT EXISTS idx_consultation_orders_patient ON consultation_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultation_orders_type ON consultation_orders(intent_type);

CREATE TABLE IF NOT EXISTS consultation_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,

    artifact_type TEXT NOT NULL CHECK (artifact_type IN ('prescription', 'referral_letter', 'followup_plan', 'visit_note', 'lab_order', 'imaging_order')),

    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'signed', 'sent', 'delivered', 'failed')),

    derived_from_intent_ids UUID[] NOT NULL DEFAULT '{}',

    template_id UUID,

    content_html TEXT,
    content_text TEXT,
    content_pdf BYTEA,

    channel TEXT CHECK (channel IN ('email', 'whatsapp', 'sms', 'print', 'fax', 'portal')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id),
    signed_at TIMESTAMPTZ,
    signed_by UUID REFERENCES users(id),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,

    delivery_status JSONB,

    CONSTRAINT consultation_documents_consultation_idx UNIQUE (consultation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_consultation_documents_consultation ON consultation_documents(consultation_id);
CREATE INDEX IF NOT EXISTS idx_consultation_documents_patient ON consultation_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultation_documents_status ON consultation_documents(status);
CREATE INDEX IF NOT EXISTS idx_consultation_documents_type ON consultation_documents(artifact_type);

CREATE TABLE IF NOT EXISTS action_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id TEXT NOT NULL,

    action_type TEXT NOT NULL CHECK (action_type IN (
        'send_prescription_whatsapp',
        'send_prescription_email',
        'send_referral_email',
        'send_referral_fax',
        'schedule_followup_consultation',
        'send_reminder_sms',
        'send_reminder_email',
        'create_lab_order',
        'create_imaging_order'
    )),

    source_document_id UUID REFERENCES consultation_documents(id),
    source_intent_id UUID REFERENCES consultation_orders(id),

    payload JSONB NOT NULL,

    scheduled_for TIMESTAMPTZ,

    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'cancelled')),

    idempotency_key TEXT UNIQUE,

    result JSONB,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    completed_at TIMESTAMPTZ,

    CONSTRAINT action_jobs_idempotency_idx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_action_jobs_consultation ON action_jobs(consultation_id);
CREATE INDEX IF NOT EXISTS idx_action_jobs_status ON action_jobs(status);
CREATE INDEX IF NOT EXISTS idx_action_jobs_type ON action_jobs(action_type);
CREATE INDEX IF NOT EXISTS idx_action_jobs_scheduled ON action_jobs(scheduled_for) WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS order_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES users(id),
    clinic_id UUID,

    template_type TEXT NOT NULL CHECK (template_type IN ('prescription', 'referral', 'followup', 'visit_note', 'lab_order', 'imaging_order')),

    name TEXT NOT NULL,
    description TEXT,

    specialty TEXT,
    visit_type TEXT,

    content_html TEXT NOT NULL,
    content_text TEXT,

    available_variables JSONB NOT NULL DEFAULT '[]',

    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_templates_default_per_user
ON order_templates(user_id, template_type) WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_order_templates_user ON order_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_order_templates_type ON order_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_order_templates_specialty ON order_templates(specialty);

CREATE TABLE IF NOT EXISTS patient_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id TEXT NOT NULL,

    contact_type TEXT NOT NULL CHECK (contact_type IN ('email', 'phone', 'whatsapp')),
    contact_value TEXT NOT NULL,

    verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verification_method TEXT,

    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    preferred_language TEXT DEFAULT 'fr',

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_contacts_primary_per_type
ON patient_contacts(patient_id, contact_type) WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_patient_contacts_patient ON patient_contacts(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_contacts_type ON patient_contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_patient_contacts_verified ON patient_contacts(verified) WHERE verified = TRUE;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_consultation_orders_updated_at') THEN
        CREATE TRIGGER trigger_consultation_orders_updated_at
            BEFORE UPDATE ON consultation_orders
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_order_templates_updated_at') THEN
        CREATE TRIGGER trigger_order_templates_updated_at
            BEFORE UPDATE ON order_templates
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_patient_contacts_updated_at') THEN
        CREATE TRIGGER trigger_patient_contacts_updated_at
            BEFORE UPDATE ON patient_contacts
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

COMMENT ON TABLE consultation_orders IS 'Structured order intents - source of truth for orders. Documents are derived from these.';
COMMENT ON TABLE consultation_documents IS 'Generated document artifacts (prescriptions, letters, etc). Status tracks lifecycle: draft→reviewed→signed→sent→delivered';
COMMENT ON TABLE action_jobs IS 'Event-driven actions queue. Review-gated: requires explicit approval before execution.';
COMMENT ON TABLE order_templates IS 'User/clinic templates for document generation. Supports specialty-based defaults.';
COMMENT ON TABLE patient_contacts IS 'Verified patient contact info. CRITICAL: Never send to unverified contacts.';

COMMENT ON COLUMN consultation_orders.intent_data IS 'JSONB containing typed intent data. Schema varies by intent_type.';
COMMENT ON COLUMN consultation_documents.derived_from_intent_ids IS 'Array of intent IDs this document was generated from. Enables traceability.';
COMMENT ON COLUMN action_jobs.idempotency_key IS 'Unique key preventing duplicate action execution. Format: action_type:source_id:timestamp';
COMMENT ON COLUMN patient_contacts.verified IS 'CRITICAL: Must be TRUE before sending any documents to this contact.';
