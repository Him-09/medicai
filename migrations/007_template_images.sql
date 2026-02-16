-- Migration: Add header/footer images to document_templates
-- Date: 2025-01-15

-- Add header_image and footer_image columns to document_templates
ALTER TABLE document_templates 
ADD COLUMN IF NOT EXISTS header_image TEXT,
ADD COLUMN IF NOT EXISTS footer_image TEXT;

-- Update type constraint to include more document types
ALTER TABLE document_templates DROP CONSTRAINT IF EXISTS document_templates_type_check;
ALTER TABLE document_templates ADD CONSTRAINT document_templates_type_check 
  CHECK (type IN ('ordonnance', 'certificat', 'lettre', 'compte_rendu', 'autre', 'prescription', 'certificate', 'referral', 'note'));

-- Add a comment explaining the columns
COMMENT ON COLUMN document_templates.header_image IS 'Base64 encoded header image for the document template';
COMMENT ON COLUMN document_templates.footer_image IS 'Base64 encoded footer image for the document template';
