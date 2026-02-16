// =============================================================================
// STRUCTURED ORDO ITEM TYPES
// =============================================================================
// "Ordo" bucket contains items that will generate different document types:
// - Médicaments → Ordonnance médicale (Rx PDF)
// - Biologie → Demande de bilan (Lab request)
// - Imagerie → Demande d'examen (Imaging request)
// - Actes/Procédures → Referral / Consent form

export type OrdoItemType = 'medication' | 'lab' | 'imaging' | 'procedure';

// =============================================================================
// BASE ORDO ITEM
// =============================================================================
interface BaseOrdoItem {
  id: string;
  type: OrdoItemType;
  created_at: string;
  updated_at: string;
  // Source tracking
  source_problem_id?: string;
  source_plan_item_id?: string;
  // Validation state
  validation_errors?: string[];
  is_complete: boolean;
}

// =============================================================================
// MEDICATION ITEM (Ordonnance médicale)
// =============================================================================
export interface OrdoMedicationItem extends BaseOrdoItem {
  type: 'medication';
  drug_name: string;
  dosage?: string;              // e.g., "500mg"
  form?: string;                // comprimé, gélule, sirop, etc.
  posology?: string;            // e.g., "1 matin, 1 soir"
  frequency?: string;           // e.g., "2x/jour"
  duration?: string;            // e.g., "7 jours", "3 mois"
  quantity?: number;            // Number of boxes/units
  refills?: number;             // Renouvellements
  instructions?: string;        // Special instructions (à jeun, etc.)
  substitution_allowed: boolean;
  // Output
  generates: 'rx_pdf';
}

// =============================================================================
// LAB ITEM (Demande de bilan / biologie)
// =============================================================================
export interface OrdoLabItem extends BaseOrdoItem {
  type: 'lab';
  panel_name?: string;          // e.g., "Bilan lipidique", "NFS"
  tests: Array<{
    code?: string;              // LOINC or local code
    name: string;
    is_urgent?: boolean;
  }>;
  clinical_indication: string;
  fasting_required: boolean;
  urgency: 'routine' | 'urgent' | 'stat';
  preferred_lab?: string;       // Preferred laboratory
  notes?: string;
  // Output
  generates: 'lab_request';
}

// =============================================================================
// IMAGING ITEM (Demande d'examen / imagerie)
// =============================================================================
export interface OrdoImagingItem extends BaseOrdoItem {
  type: 'imaging';
  modality: 'xray' | 'ultrasound' | 'ct' | 'mri' | 'mammography' | 'dexa' | 'other';
  modality_label: string;       // Human readable: "Échographie", "IRM", etc.
  body_region: string;          // e.g., "Abdomen", "Thorax"
  clinical_indication: string;
  urgency: 'routine' | 'urgent' | 'stat';
  contrast_required?: boolean;
  pregnancy_status?: 'not_applicable' | 'negative' | 'unknown' | 'positive';
  preferred_center?: string;
  notes?: string;
  // Output
  generates: 'imaging_request';
}

// =============================================================================
// PROCEDURE ITEM (Actes / Procédures)
// =============================================================================
export interface OrdoProcedureItem extends BaseOrdoItem {
  type: 'procedure';
  procedure_name: string;
  procedure_type: 'minor_procedure' | 'referral' | 'scheduling' | 'consent';
  specialist_type?: string;     // e.g., "Cardiologue", "Chirurgien"
  indication: string;
  urgency: 'routine' | 'urgent' | 'stat';
  requires_consent: boolean;
  notes?: string;
  // Output
  generates: 'referral' | 'consent_form' | 'scheduling_request';
}

// Union type
export type OrdoItem = OrdoMedicationItem | OrdoLabItem | OrdoImagingItem | OrdoProcedureItem;

// =============================================================================
// QUICK TEMPLATES
// =============================================================================
export interface OrdoTemplate {
  id: string;
  name: string;
  category: OrdoItemType;
  icon?: string;
  // Pre-filled values
  preset: Partial<OrdoItem>;
}

// Common lab panels
export const LAB_TEMPLATES: OrdoTemplate[] = [
  {
    id: 'nfs',
    name: 'NFS',
    category: 'lab',
    preset: {
      type: 'lab',
      panel_name: 'Numération Formule Sanguine',
      tests: [
        { name: 'Hémoglobine' },
        { name: 'Hématocrite' },
        { name: 'Globules blancs' },
        { name: 'Plaquettes' },
      ],
      fasting_required: false,
      urgency: 'routine',
    } as Partial<OrdoLabItem>,
  },
  {
    id: 'bilan-lipidique',
    name: 'Bilan lipidique',
    category: 'lab',
    preset: {
      type: 'lab',
      panel_name: 'Bilan lipidique',
      tests: [
        { name: 'Cholestérol total' },
        { name: 'HDL' },
        { name: 'LDL' },
        { name: 'Triglycérides' },
      ],
      fasting_required: true,
      urgency: 'routine',
    } as Partial<OrdoLabItem>,
  },
  {
    id: 'hba1c',
    name: 'HbA1c',
    category: 'lab',
    preset: {
      type: 'lab',
      panel_name: 'HbA1c',
      tests: [{ name: 'Hémoglobine glyquée (HbA1c)' }],
      fasting_required: false,
      urgency: 'routine',
    } as Partial<OrdoLabItem>,
  },
  {
    id: 'bilan-renal',
    name: 'Bilan rénal',
    category: 'lab',
    preset: {
      type: 'lab',
      panel_name: 'Bilan rénal',
      tests: [
        { name: 'Créatinine' },
        { name: 'Urée' },
        { name: 'DFG estimé' },
        { name: 'Ionogramme' },
      ],
      fasting_required: false,
      urgency: 'routine',
    } as Partial<OrdoLabItem>,
  },
  {
    id: 'bilan-hepatique',
    name: 'Bilan hépatique',
    category: 'lab',
    preset: {
      type: 'lab',
      panel_name: 'Bilan hépatique',
      tests: [
        { name: 'ASAT' },
        { name: 'ALAT' },
        { name: 'GGT' },
        { name: 'Phosphatases alcalines' },
        { name: 'Bilirubine' },
      ],
      fasting_required: false,
      urgency: 'routine',
    } as Partial<OrdoLabItem>,
  },
  {
    id: 'tsh',
    name: 'TSH',
    category: 'lab',
    preset: {
      type: 'lab',
      panel_name: 'Bilan thyroïdien',
      tests: [{ name: 'TSH' }],
      fasting_required: false,
      urgency: 'routine',
    } as Partial<OrdoLabItem>,
  },
  {
    id: 'crp',
    name: 'CRP',
    category: 'lab',
    preset: {
      type: 'lab',
      panel_name: 'Marqueur inflammatoire',
      tests: [{ name: 'CRP (Protéine C-réactive)' }],
      fasting_required: false,
      urgency: 'routine',
    } as Partial<OrdoLabItem>,
  },
  {
    id: 'ferritine',
    name: 'Ferritine',
    category: 'lab',
    preset: {
      type: 'lab',
      panel_name: 'Bilan martial',
      tests: [
        { name: 'Ferritine' },
        { name: 'Fer sérique' },
        { name: 'Transferrine' },
      ],
      fasting_required: false,
      urgency: 'routine',
    } as Partial<OrdoLabItem>,
  },
];

// Common imaging exams
export const IMAGING_TEMPLATES: OrdoTemplate[] = [
  {
    id: 'echo-abdo',
    name: 'Écho abdo',
    category: 'imaging',
    preset: {
      type: 'imaging',
      modality: 'ultrasound',
      modality_label: 'Échographie',
      body_region: 'Abdomen complet',
      urgency: 'routine',
      contrast_required: false,
    } as Partial<OrdoImagingItem>,
  },
  {
    id: 'radio-thorax',
    name: 'Radio thorax',
    category: 'imaging',
    preset: {
      type: 'imaging',
      modality: 'xray',
      modality_label: 'Radiographie',
      body_region: 'Thorax face',
      urgency: 'routine',
    } as Partial<OrdoImagingItem>,
  },
  {
    id: 'echo-cardiaque',
    name: 'Écho cardiaque',
    category: 'imaging',
    preset: {
      type: 'imaging',
      modality: 'ultrasound',
      modality_label: 'Échocardiographie',
      body_region: 'Cœur',
      urgency: 'routine',
    } as Partial<OrdoImagingItem>,
  },
  {
    id: 'irm-cerebrale',
    name: 'IRM cérébrale',
    category: 'imaging',
    preset: {
      type: 'imaging',
      modality: 'mri',
      modality_label: 'IRM',
      body_region: 'Cérébrale',
      urgency: 'routine',
      contrast_required: false,
    } as Partial<OrdoImagingItem>,
  },
  {
    id: 'scanner-thorax',
    name: 'Scanner thorax',
    category: 'imaging',
    preset: {
      type: 'imaging',
      modality: 'ct',
      modality_label: 'Scanner (TDM)',
      body_region: 'Thorax',
      urgency: 'routine',
    } as Partial<OrdoImagingItem>,
  },
  {
    id: 'mammo',
    name: 'Mammographie',
    category: 'imaging',
    preset: {
      type: 'imaging',
      modality: 'mammography',
      modality_label: 'Mammographie',
      body_region: 'Seins bilatéral',
      urgency: 'routine',
    } as Partial<OrdoImagingItem>,
  },
  {
    id: 'osteodensitometrie',
    name: 'Ostéodensitométrie',
    category: 'imaging',
    preset: {
      type: 'imaging',
      modality: 'dexa',
      modality_label: 'DEXA',
      body_region: 'Rachis + Hanche',
      urgency: 'routine',
    } as Partial<OrdoImagingItem>,
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
export function createOrdoMedication(partial?: Partial<OrdoMedicationItem>): OrdoMedicationItem {
  return {
    id: crypto.randomUUID(),
    type: 'medication',
    drug_name: '',
    substitution_allowed: true,
    generates: 'rx_pdf',
    is_complete: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

export function createOrdoLab(partial?: Partial<OrdoLabItem>): OrdoLabItem {
  return {
    id: crypto.randomUUID(),
    type: 'lab',
    tests: [],
    clinical_indication: '',
    fasting_required: false,
    urgency: 'routine',
    generates: 'lab_request',
    is_complete: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

export function createOrdoImaging(partial?: Partial<OrdoImagingItem>): OrdoImagingItem {
  return {
    id: crypto.randomUUID(),
    type: 'imaging',
    modality: 'xray',
    modality_label: 'Radiographie',
    body_region: '',
    clinical_indication: '',
    urgency: 'routine',
    generates: 'imaging_request',
    is_complete: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

export function createOrdoProcedure(partial?: Partial<OrdoProcedureItem>): OrdoProcedureItem {
  return {
    id: crypto.randomUUID(),
    type: 'procedure',
    procedure_name: '',
    procedure_type: 'referral',
    indication: '',
    urgency: 'routine',
    requires_consent: false,
    generates: 'referral',
    is_complete: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

export function createOrdoFromTemplate(template: OrdoTemplate): OrdoItem {
  const base = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_complete: false,
  };
  
  switch (template.category) {
    case 'medication':
      return { ...createOrdoMedication(), ...template.preset, ...base } as OrdoMedicationItem;
    case 'lab':
      return { ...createOrdoLab(), ...template.preset, ...base } as OrdoLabItem;
    case 'imaging':
      return { ...createOrdoImaging(), ...template.preset, ...base } as OrdoImagingItem;
    case 'procedure':
      return { ...createOrdoProcedure(), ...template.preset, ...base } as OrdoProcedureItem;
  }
}

// Validation helpers
export function validateOrdoItem(item: OrdoItem): string[] {
  const errors: string[] = [];
  
  switch (item.type) {
    case 'medication':
      if (!item.drug_name?.trim()) errors.push('Nom du médicament requis');
      if (!item.dosage?.trim()) errors.push('Dosage manquant');
      if (!item.posology?.trim() && !item.frequency?.trim()) errors.push('Posologie manquante');
      break;
    case 'lab':
      if (item.tests.length === 0) errors.push('Aucun test sélectionné');
      if (!item.clinical_indication?.trim()) errors.push('Indication clinique requise');
      break;
    case 'imaging':
      if (!item.body_region?.trim()) errors.push('Région anatomique requise');
      if (!item.clinical_indication?.trim()) errors.push('Indication clinique requise');
      break;
    case 'procedure':
      if (!item.procedure_name?.trim()) errors.push('Nom de la procédure requis');
      if (!item.indication?.trim()) errors.push('Indication requise');
      break;
  }
  
  return errors;
}

export function isOrdoItemComplete(item: OrdoItem): boolean {
  return validateOrdoItem(item).length === 0;
}

// Display helpers
export function getOrdoTypeIcon(type: OrdoItemType): string {
  switch (type) {
    case 'medication': return '💊';
    case 'lab': return '🧪';
    case 'imaging': return '📷';
    case 'procedure': return '🏥';
  }
}

export function getOrdoTypeLabel(type: OrdoItemType): string {
  switch (type) {
    case 'medication': return 'Médicament';
    case 'lab': return 'Biologie';
    case 'imaging': return 'Imagerie';
    case 'procedure': return 'Acte/Procédure';
  }
}

export function getOrdoGeneratesLabel(item: OrdoItem): string {
  switch (item.type) {
    case 'medication': return 'Ordonnance médicale';
    case 'lab': return 'Demande de bilan';
    case 'imaging': return 'Demande d\'examen';
    case 'procedure':
      if (item.generates === 'consent_form') return 'Formulaire de consentement';
      if (item.generates === 'scheduling_request') return 'Demande de rendez-vous';
      return 'Lettre de référence';
  }
}
// =============================================================================
// SMART TEXT PARSING FOR AUTO-CONVERSION
// =============================================================================

// Common medication patterns
const MEDICATION_PATTERNS = [
  // Drug names often followed by dosage
  /^(metformine?|paracétamol|ibuprofène?|aspirine?|oméprazole?|amlodipine?|lisinopril|atorvastatine?|simvastatine?|levothyrox|metoprolol|ramipril|furosémide?|bisoprolol|losartan|gabapentine?|tramadol|codéine?|morphine?|insuline?|glibenclamide?|gliclazide?|prednisone?|prednisolone?|dexaméthasone?|amoxicilline?|azithromycine?|ciprofloxacine?|ceftriaxone?|augmentin|doliprane?|efferalgan|dafalgan|spasfon|vogalène?|motilium|gaviscon|inexium|pantoprazole?|ventoline?|seretide?|spiriva|symbicort|avlocardyl|propranolol|alprazolam|lexomil|stilnox|imovane?|xanax|temesta|atarax|laroxyl|seroplex|prozac|zoloft|effexor|cymbalta|risperdal|zyprexa|abilify|depakine?|lamictal|keppra|tegretol|rivotril|lyrica|neurontin|kardégic|plavix|xarelto|eliquis|sintrom|coumadine?|lovenox|héparine?|fer|tardyféron|fero[-\s]?grad|speciafoldine?|acide folique|vitamine?[- ]?d|uvedose?|zymad|calcidose?|calcium|magnésium|potassium|diffu[-\s]?k|aldactone?|lasilix|burinex)/i,
  // Common rx patterns
  /(prescrire|prescription|ordonnance|rx:?|médicament)/i,
  // Dosage patterns
  /\d+\s*(mg|g|ml|µg|mcg|ui|cp|gél|comp|comprimé|gélule|sachet|amp|ampoule)/i,
];

// Lab test patterns
const LAB_PATTERNS = [
  /(nfs|numération|hémogramme|hb|hémoglobine)/i,
  /(glycémie|hba1c|glucose)/i,
  /(bilan|biologie|labo|prélèvement|prise de sang)/i,
  /(créatinine?|urée|ionogramme|kaliémie|natrémie)/i,
  /(bilan (lipidique|hépatique|rénal|thyroïdien|martial))/i,
  /(cholestérol|ldl|hdl|triglycéride)/i,
  /(tsh|t3|t4|thyroïde)/i,
  /(ferritine?|fer sérique|transferrine|cst)/i,
  /(crp|vs|procalcitonine)/i,
  /(bnp|troponine|d-dimère)/i,
  /(psa|ca[-\s]?125|ca[-\s]?19[-\s]?9|ace|afp)/i,
  /(ecbu|bactério|hémoculture)/i,
  /(coagulation|tp|inr|tca|fibrinogène)/i,
  /(transaminase|asat|alat|ggt|phosphatase|bilirubine)/i,
  /(vitamine|b12|folate|25[-\s]?oh[-\s]?d)/i,
];

// Imaging patterns
const IMAGING_PATTERNS = [
  /(écho(graphie)?|échographie)/i,
  /(radio(graphie)?|rx\b|radiographie)/i,
  /(scanner|tdm|tomodensitométrie)/i,
  /(irm|résonance magnétique)/i,
  /(mammo(graphie)?)/i,
  /(ostéodensitométrie|dexa|dmo)/i,
  /(imagerie|examen radiologique)/i,
  /(abdomen|thorax|crâne|rachis|hanche|genou|épaule|cheville|poignet)/i,
];

// Procedure/referral patterns
const PROCEDURE_PATTERNS = [
  /(référer|référence|consultation spécialisée|avis spécialisé)/i,
  /(cardiologue|dermatologue|gastro-?entérologue|neurologue|ophtalmologue|orl|pneumologue|rhumatologue|urologue|gynécologue|endocrinologue|psychiatre|chirurgien)/i,
  /(endoscopie|coloscopie|gastroscopie|fibroscopie|bronchoscopie)/i,
  /(biopsie|ponction|infiltration)/i,
  /(ecg|électrocardiogramme|holter|épreuve d'effort)/i,
  /(efr|spirométrie|fonction respiratoire)/i,
  /(emg|électromyogramme)/i,
  /(eeg|électroencéphalogramme)/i,
];

interface ParsedOrdoIntent {
  type: OrdoItemType;
  confidence: number;  // 0-1
  extracted: {
    name?: string;
    dosage?: string;
    tests?: string[];
    region?: string;
    specialist?: string;
  };
}

/**
 * Analyzes plan item text and determines the most likely Ordo item type
 * with extracted fields
 */
export function parseTextToOrdoIntent(text: string): ParsedOrdoIntent {
  const candidates = resolveOrdoCandidates(text);
  const best = candidates[0];
  if (!best) {
    return { type: 'medication', confidence: 0.3, extracted: { name: text.slice(0, 50) } };
  }

  // Map extracted fields into the legacy shape
  const extracted: ParsedOrdoIntent['extracted'] = {};
  if (best.type === 'medication') {
    const med = best.extracted as Partial<OrdoMedicationItem>;
    extracted.name = med.drug_name;
    extracted.dosage = med.dosage;
  }
  if (best.type === 'lab') {
    const lab = best.extracted as Partial<OrdoLabItem>;
    extracted.tests = lab.tests?.map(t => t.name).filter(Boolean) as string[] | undefined;
  }
  if (best.type === 'imaging') {
    const img = best.extracted as Partial<OrdoImagingItem>;
    extracted.region = img.body_region;
  }
  if (best.type === 'procedure') {
    const proc = best.extracted as Partial<OrdoProcedureItem>;
    extracted.specialist = proc.specialist_type;
  }

  return {
    type: best.type,
    confidence: best.score,
    extracted,
  };
}

/**
 * Creates an OrdoItem from plan item text using smart parsing
 */
export function createOrdoFromText(
  text: string, 
  sourceProblemId?: string, 
  sourcePlanItemId?: string
): OrdoItem {
  const items = createOrdoItemsFromText(text, sourceProblemId, sourcePlanItemId);
  return items[0] ?? createOrdoMedication({
    source_problem_id: sourceProblemId,
    source_plan_item_id: sourcePlanItemId,
    drug_name: text.slice(0, 50),
  });
}

// =============================================================================
// SCORING-BASED RESOLVER + MULTI-ITEM CONVERSION
// =============================================================================

export type OrdoCandidate = {
  type: OrdoItemType;
  score: number; // 0..1
  reasons: string[];
  extracted: Partial<OrdoMedicationItem | OrdoLabItem | OrdoImagingItem | OrdoProcedureItem>;
};

export type OrdoResolveContext = {
  bucket?: 'today' | 'orders' | 'treatment' | 'follow_up' | 'safety_net' | string;
  problemTitle?: string;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function splitOrdoText(text: string): string[] {
  const parts = text
    .split(/\n|;|\s+\+\s+|\s+\/\s+|\s+et\s+|\s*,\s*/gi)
    .map(p => p.trim())
    .filter(Boolean);
  // avoid over-splitting very short tokens
  const merged: string[] = [];
  for (const part of parts) {
    if (part.length <= 2 && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${part}`.trim();
    } else {
      merged.push(part);
    }
  }
  return merged.length > 0 ? merged : [text.trim()];
}

function extractDosage(rawText: string): string | undefined {
  const m = rawText.match(/(\d+(?:[\.,]\d+)?\s*(?:mg|g|ml|µg|mcg|ui))/i);
  return m?.[1];
}

function extractFrequency(rawText: string): string | undefined {
  const t = rawText;
  const m = t.match(/(\b(?:1|2|3|4)\s*x\s*\/\s*j\b|\b(?:bid|tid|qid)\b|\bmatin\b|\bmidi\b|\bsoir\b|\bjour\b|\bquotidien\b)/i);
  return m?.[1];
}

function extractDuration(rawText: string): string | undefined {
  const m = rawText.match(/(\b\d+\s*(?:j|jour|jours|sem|semaine|semaines|mois)\b)/i);
  return m?.[1];
}

function extractUrgency(rawText: string): 'routine' | 'urgent' | 'stat' {
  const t = normalizeText(rawText);
  if (/\bstat\b|\bimmediat\b/.test(t)) return 'stat';
  if (/\burgent\b|\brapide\b|\basap\b/.test(t)) return 'urgent';
  return 'routine';
}

function detectImagingModality(rawText: string): { modality: OrdoImagingItem['modality']; label: string } {
  const t = normalizeText(rawText);
  if (/\becho\b|echographie/.test(t)) return { modality: 'ultrasound', label: 'Échographie' };
  if (/\bradio\b|\brx\b|radiographie/.test(t)) return { modality: 'xray', label: 'Radiographie' };
  if (/scanner|\btdm\b|tomodensitometrie/.test(t)) return { modality: 'ct', label: 'Scanner (TDM)' };
  if (/\birm\b|resonance/.test(t)) return { modality: 'mri', label: 'IRM' };
  if (/mammo/.test(t)) return { modality: 'mammography', label: 'Mammographie' };
  if (/dexa|osteodensito|\bdmo\b/.test(t)) return { modality: 'dexa', label: 'DEXA' };
  return { modality: 'other', label: 'Imagerie' };
}

function extractBodyRegion(rawText: string): string | undefined {
  const t = normalizeText(rawText);
  const m = t.match(/\b(abdomen|thorax|crane|cerveau|rachis|lombaire|hanche|genou|epaule|cheville|poignet|poumon|coeur|rein|foie|rate|vesicule|seins?)\b/i);
  if (!m?.[1]) return undefined;
  const r = m[1];
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function extractSpecialist(rawText: string): string | undefined {
  const t = normalizeText(rawText);
  const m = t.match(/\b(cardiologue|dermatologue|gastro\-?enterologue|neurologue|ophtalmologue|orl|pneumologue|rhumatologue|urologue|gynecologue|endocrinologue|psychiatre|chirurgien)\b/i);
  if (!m?.[1]) return undefined;
  const s = m[1];
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractLabTests(rawText: string): string[] {
  const t = normalizeText(rawText);
  const candidates: Array<{ key: string; rx: RegExp }> = [
    { key: 'NFS', rx: /\bnfs\b|numeration|hemogramme/ },
    { key: 'CRP', rx: /\bcrp\b/ },
    { key: 'HbA1c', rx: /hba1c/ },
    { key: 'Glycémie', rx: /glycemie|glucose/ },
    { key: 'Créatinine', rx: /creatinine/ },
    { key: 'Ionogramme', rx: /ionogramme|natr(?:emie)?|kali(?:emie)?/ },
    { key: 'TSH', rx: /\btsh\b/ },
    { key: 'Ferritine', rx: /ferritine|bilan martial|fer serique/ },
    { key: 'Bilan lipidique', rx: /bilan lipidique|cholesterol|ldl|hdl|triglycer/ },
    { key: 'TP/INR', rx: /\btp\b|\binr\b/ },
    { key: 'ECBU', rx: /\becbu\b/ },
  ];

  const hits: string[] = [];
  for (const c of candidates) {
    if (c.rx.test(t)) hits.push(c.key);
  }
  return hits;
}

export function resolveOrdoCandidates(text: string, ctx: OrdoResolveContext = {}): OrdoCandidate[] {
  const raw = text.trim();
  const t = normalizeText(raw);
  if (!t) return [];

  const reasons: Record<OrdoItemType, string[]> = {
    medication: [],
    lab: [],
    imaging: [],
    procedure: [],
  };

  // Medication
  let medScore = 0;
  const dosage = extractDosage(raw);
  if (dosage) { medScore += 0.35; reasons.medication.push('dose'); }
  const freq = extractFrequency(raw);
  if (freq) { medScore += 0.25; reasons.medication.push('fréquence'); }
  const dur = extractDuration(raw);
  if (dur) { medScore += 0.15; reasons.medication.push('durée'); }
  if (MEDICATION_PATTERNS.some(rx => rx.test(t))) { medScore += 0.35; reasons.medication.push('médicament/keyword'); }
  if (/prescrire|ordonnance|\brx\b|medicament|prendre/.test(t)) { medScore += 0.15; reasons.medication.push('verbe Rx'); }

  // Lab
  let labScore = 0;
  const labTests = extractLabTests(raw);
  if (labTests.length > 0) { labScore += 0.55; reasons.lab.push('tests connus'); }
  if (LAB_PATTERNS.some(rx => rx.test(t))) { labScore += 0.35; reasons.lab.push('keywords labo'); }
  if (/bilan|biologie|labo|prise de sang|prelev/.test(t)) { labScore += 0.2; reasons.lab.push('mot bilan'); }

  // Imaging
  let imgScore = 0;
  const modality = detectImagingModality(raw);
  if (IMAGING_PATTERNS.some(rx => rx.test(t))) { imgScore += 0.45; reasons.imaging.push('keyword imagerie'); }
  if (modality.modality !== 'other') { imgScore += 0.35; reasons.imaging.push('modalité'); }
  const region = extractBodyRegion(raw);
  if (region) { imgScore += 0.2; reasons.imaging.push('région'); }

  // Procedure
  let procScore = 0;
  const specialist = extractSpecialist(raw);
  if (specialist) { procScore += 0.45; reasons.procedure.push('spécialité'); }
  if (PROCEDURE_PATTERNS.some(rx => rx.test(t))) { procScore += 0.35; reasons.procedure.push('keyword procédure'); }
  if (/avis|consultation|refere|reference|adress/.test(t)) { procScore += 0.2; reasons.procedure.push('verbe référence'); }

  // Contextual priors
  const bucket = ctx.bucket;
  if (bucket === 'treatment') {
    medScore += 0.12;
    reasons.medication.push('prior:Tx');
  }
  if (bucket === 'orders') {
    labScore += 0.06;
    imgScore += 0.06;
    procScore += 0.06;
    reasons.lab.push('prior:Ordo');
    reasons.imaging.push('prior:Ordo');
    reasons.procedure.push('prior:Ordo');
  }

  const urgency = extractUrgency(raw);

  const medExtract: Partial<OrdoMedicationItem> = {
    type: 'medication',
    drug_name: raw.slice(0, 80),
    dosage,
    frequency: freq,
    duration: dur,
  };

  // Try to improve med name from the first match group of the big rx
  for (const rx of MEDICATION_PATTERNS) {
    const m = raw.match(rx);
    if (m?.[1]) {
      medExtract.drug_name = m[1].charAt(0).toUpperCase() + m[1].slice(1);
      break;
    }
  }

  const labExtract: Partial<OrdoLabItem> = {
    type: 'lab',
    panel_name: labTests[0] || (raw.length <= 40 ? raw : 'Bilan'),
    tests: labTests.length > 0 ? labTests.map(name => ({ name })) : [{ name: raw.slice(0, 80) }],
    clinical_indication: ctx.problemTitle ? ctx.problemTitle : raw,
    urgency,
  };

  const imgExtract: Partial<OrdoImagingItem> = {
    type: 'imaging',
    modality: modality.modality,
    modality_label: modality.label,
    body_region: region || '',
    clinical_indication: ctx.problemTitle ? ctx.problemTitle : raw,
    urgency,
  };

  const procExtract: Partial<OrdoProcedureItem> = {
    type: 'procedure',
    procedure_name: specialist ? `Consultation ${specialist}` : raw.slice(0, 80),
    specialist_type: specialist,
    indication: ctx.problemTitle ? ctx.problemTitle : raw,
    urgency,
  };

  const candidates: OrdoCandidate[] = [
    { type: 'medication', score: clamp01(medScore), reasons: reasons.medication, extracted: medExtract },
    { type: 'lab', score: clamp01(labScore), reasons: reasons.lab, extracted: labExtract },
    { type: 'imaging', score: clamp01(imgScore), reasons: reasons.imaging, extracted: imgExtract },
    { type: 'procedure', score: clamp01(procScore), reasons: reasons.procedure, extracted: procExtract },
  ];

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

export function createOrdoItemFromTextWithType(
  text: string,
  type: OrdoItemType,
  sourceProblemId?: string,
  sourcePlanItemId?: string,
  ctx: OrdoResolveContext = {}
): OrdoItem {
  const baseData = {
    source_problem_id: sourceProblemId,
    source_plan_item_id: sourcePlanItemId,
  };
  const candidates = resolveOrdoCandidates(text, ctx);
  const chosen = candidates.find(c => c.type === type) ?? candidates[0];
  const extracted = (chosen?.extracted ?? {}) as any;

  switch (type) {
    case 'medication':
      return createOrdoMedication({
        ...baseData,
        ...extracted,
        drug_name: (extracted.drug_name || text).toString(),
      });
    case 'lab':
      return createOrdoLab({
        ...baseData,
        ...extracted,
        clinical_indication: (extracted.clinical_indication || text).toString(),
      });
    case 'imaging':
      return createOrdoImaging({
        ...baseData,
        ...extracted,
        clinical_indication: (extracted.clinical_indication || text).toString(),
      });
    case 'procedure':
      return createOrdoProcedure({
        ...baseData,
        ...extracted,
        indication: (extracted.indication || text).toString(),
      });
  }
}

export function createOrdoItemsFromText(
  text: string,
  sourceProblemId?: string,
  sourcePlanItemId?: string,
  ctx: OrdoResolveContext = {}
): OrdoItem[] {
  const chunks = splitOrdoText(text);
  const items: OrdoItem[] = [];

  for (const chunk of chunks) {
    const candidates = resolveOrdoCandidates(chunk, ctx);
    const best = candidates[0];
    // If nothing matches, keep as medication placeholder
    const chosenType: OrdoItemType = best?.type ?? 'medication';
    items.push(createOrdoItemFromTextWithType(chunk, chosenType, sourceProblemId, sourcePlanItemId, ctx));
  }

  return items;
}