ALTER TABLE document_templates
ADD COLUMN IF NOT EXISTS header_image TEXT,
ADD COLUMN IF NOT EXISTS footer_image TEXT;

ALTER TABLE document_templates DROP CONSTRAINT IF EXISTS document_templates_type_check;
ALTER TABLE document_templates ADD CONSTRAINT document_templates_type_check
  CHECK (type IN ('ordonnance', 'certificat', 'lettre', 'compte_rendu', 'autre', 'prescription', 'certificate', 'referral', 'note'));

COMMENT ON COLUMN document_templates.header_image IS 'Base64 encoded header image for the document template';
COMMENT ON COLUMN document_templates.footer_image IS 'Base64 encoded footer image for the document template';
