-- Migration 015: Add clinic_id to lab_results, radiology_reports, prescription_items
-- ==================================================================================
-- The indexer_sql.py code references clinic_id in these tables for tenant isolation,
-- but the column was never added by any prior migration.

-- 1. lab_results
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
CREATE INDEX IF NOT EXISTS idx_lab_results_clinic ON lab_results(clinic_id);

-- 2. radiology_reports
ALTER TABLE radiology_reports ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
CREATE INDEX IF NOT EXISTS idx_radiology_clinic ON radiology_reports(clinic_id);

-- 3. prescription_items
ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
CREATE INDEX IF NOT EXISTS idx_prescription_clinic ON prescription_items(clinic_id);

-- Backfill existing rows from documents table
UPDATE lab_results lr
SET clinic_id = d.clinic_id
FROM documents d
WHERE lr.doc_id = d.doc_id AND lr.clinic_id IS NULL AND d.clinic_id IS NOT NULL;

UPDATE radiology_reports rr
SET clinic_id = d.clinic_id
FROM documents d
WHERE rr.doc_id = d.doc_id AND rr.clinic_id IS NULL AND d.clinic_id IS NOT NULL;

UPDATE prescription_items pi
SET clinic_id = d.clinic_id
FROM documents d
WHERE pi.doc_id = d.doc_id AND pi.clinic_id IS NULL AND d.clinic_id IS NOT NULL;
