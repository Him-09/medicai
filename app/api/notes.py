"""
Notes autocomplete and suggestions API endpoints.

Provides:
1. Inline autocomplete - VS Code-style ghost text suggestions
2. Structured suggestions - Dropdown for ICD, meds, labs, orders
3. Consultation-aware context for tailored suggestions
4. Multi-layer caching for performance (context + response caching)
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum
import logging

from medicai.storage.postgres import get_conn
from medicai.config import config
from app.utils.cache import (
    autocomplete_cache, 
    context_cache, 
    get_cache_stats,
    invalidate_consultation_caches
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notes", tags=["notes"])


# ============================================================================
# SCHEMAS
# ============================================================================

class FieldType(str, Enum):
    ONE_LINER = "one_liner"
    SYMPTOM = "symptom"
    RED_FLAG = "red_flag"
    ASSESSMENT = "assessment"
    PLAN_ITEM = "plan_item"
    ORDER_DRAFT = "order_draft"
    ICD_ENTRY = "icd_entry"
    AGENDA_ITEM = "agenda_item"
    FREE_NOTE = "free_note"


class PlanBucket(str, Enum):
    TODAY = "today"
    ORDERS = "orders"
    TREATMENT = "treatment"
    FOLLOW_UP = "follow_up"
    SAFETY_NET = "safety_net"


class AutocompleteRequest(BaseModel):
    patient_id: str
    consultation_id: str
    text: str = Field(..., description="Text window immediately before cursor")
    text_after: Optional[str] = Field(None, description="Text after cursor for insert behavior")
    cursor_offset: int
    section: Optional[str] = Field(None, description="Note section: hpi, assessment, plan, general")
    # Enhanced context
    field_type: Optional[FieldType] = None
    problem_id: Optional[str] = None
    bucket: Optional[PlanBucket] = None
    active_problems: Optional[List[str]] = Field(None, description="Current consultation problem titles")
    visit_focus: Optional[str] = Field(None, description="Agenda focus for this visit")


class AutocompleteResponse(BaseModel):
    completion: str = ""
    confidence: Optional[float] = None
    source: Optional[str] = None  # 'template' | 'phrase_bank' | 'llm'


class SuggestionType(str, Enum):
    ICD10 = "icd10"
    MEDICATION = "medication"
    LAB = "lab"
    ORDER = "order"
    PHRASE = "phrase"


class SuggestionRequest(BaseModel):
    type: SuggestionType
    query: str = ""
    patient_id: Optional[str] = None
    consultation_id: Optional[str] = None
    limit: int = Field(15, ge=1, le=50)
    # Context for boosting
    active_problems: Optional[List[str]] = None
    current_bucket: Optional[PlanBucket] = None


class SuggestionItem(BaseModel):
    type: str
    code: Optional[str] = None
    display_text: str
    details: Optional[str] = None
    source: str = "knowledge_base"  # 'knowledge_base' | 'patient_history' | 'frequent' | 'context_boost'
    relevance_reason: Optional[str] = None  # Why this is suggested
    boost_score: Optional[float] = None


class SuggestionResponse(BaseModel):
    items: List[SuggestionItem]


# ============================================================================
# INLINE AUTOCOMPLETE (Ghost text)
# ============================================================================

# Clinical phrasing templates by section (Engine A - Deterministic)
SECTION_TEMPLATES = {
    "hpi": [
        ("denies", " chest pain, shortness of breath, or palpitations."),
        ("reports", " gradual onset of symptoms over the past "),
        ("states", " that symptoms are worse with "),
        ("no history of", " similar episodes."),
        ("associated with", " nausea, vomiting, or diaphoresis."),
        ("onset", " was sudden/gradual, occurring approximately "),
        ("duration", " of symptoms is approximately "),
        ("severity", " is rated as "),
        ("aggravating factors", " include "),
        ("alleviating factors", " include rest and "),
        ("patient reports", " compliance with current medications."),
        ("no recent", " changes in weight, appetite, or sleep."),
    ],
    "assessment": [
        ("differential", " diagnosis includes "),
        ("most likely", " diagnosis is "),
        ("consistent with", " clinical presentation of "),
        ("unlikely to be", " given the absence of "),
        ("further workup", " needed to rule out "),
        ("stable", " condition, continue current management."),
        ("improved", " from previous visit."),
        ("worsening", " despite current treatment."),
    ],
    "plan": [
        ("continue", " current medications."),
        ("start", " on "),
        ("discontinue", " due to "),
        ("increase dose", " of "),
        ("decrease dose", " of "),
        ("order", " CBC, BMP, and "),
        ("refer to", " for further evaluation."),
        ("follow up", " in "),
        ("return precautions", ": return if symptoms worsen or new symptoms develop."),
        ("patient education", " provided regarding "),
        ("lifestyle modifications", " recommended including "),
    ],
    "general": [
        ("patient", " is a "),
        ("chief complaint", " of "),
        ("vitals", " are within normal limits."),
        ("physical exam", " reveals "),
        ("labs", " show "),
        ("imaging", " demonstrates "),
    ],
}

# ============================================================================
# CONTEXTUAL PHRASE BANK (Engine B - Problem-type keyed, no LLM)
# Keyed by: section + field_type + problem_keywords
# ============================================================================

CONTEXTUAL_PHRASES = {
    # Anemia-related
    ("plan_item", "anemia"): [
        "Check CBC, reticulocyte count, iron studies, B12, folate.",
        "Start ferrous sulfate 325mg PO daily with vitamin C for absorption.",
        "Refer to hematology if no improvement in 4-6 weeks.",
        "Transfuse PRBCs if symptomatic or Hgb < 7.",
        "Avoid NSAIDs; consider GI evaluation if suspected blood loss.",
    ],
    ("assessment", "anemia"): [
        "Iron deficiency anemia, likely due to chronic blood loss vs inadequate intake.",
        "Anemia of chronic disease, secondary to underlying condition.",
        "Macrocytic anemia, rule out B12/folate deficiency.",
    ],
    # Hypertension
    ("plan_item", "hypertension"): [
        "Continue current antihypertensive regimen; recheck BP in 2-4 weeks.",
        "Start lisinopril 10mg daily, titrate to goal BP < 130/80.",
        "Add amlodipine 5mg if not at goal on monotherapy.",
        "Lifestyle: DASH diet, sodium restriction, regular exercise.",
        "Check BMP, lipid panel; assess for end-organ damage.",
    ],
    ("assessment", "hypertension"): [
        "Essential hypertension, currently uncontrolled.",
        "Hypertension well controlled on current regimen.",
        "Resistant hypertension, consider secondary causes.",
    ],
    # Diabetes
    ("plan_item", "diabetes"): [
        "Continue metformin; check HbA1c in 3 months.",
        "Intensify therapy with GLP-1 agonist or SGLT2 inhibitor.",
        "Refer to diabetes educator for medication and diet counseling.",
        "Foot exam, monofilament testing annually.",
        "Ophthalmology referral for diabetic eye screening.",
    ],
    ("assessment", "diabetes"): [
        "Type 2 diabetes mellitus, currently at goal (HbA1c < 7%).",
        "Uncontrolled diabetes, HbA1c above target.",
        "Diabetes with nephropathy, optimize ACEI/ARB.",
    ],
    # Chest pain / cardiac
    ("plan_item", "chest pain"): [
        "EKG and troponin x2 to rule out ACS.",
        "Stress test if low-risk, consider cardiac catheterization if high-risk.",
        "Start aspirin, statin; optimize beta-blocker therapy.",
        "GI workup if atypical features (PPI trial, consider endoscopy).",
    ],
    ("hpi", "chest pain"): [
        "Denies radiation to arm/jaw, diaphoresis, or dyspnea.",
        "Pain is reproducible with palpation, suggesting musculoskeletal etiology.",
        "Associated with meals, possible GERD component.",
    ],
    # Respiratory / COPD / Asthma
    ("plan_item", "copd"): [
        "Continue LABA/ICS inhaler; add LAMA if not controlled.",
        "Pulmonary rehab referral for moderate-severe COPD.",
        "Smoking cessation counseling, consider nicotine replacement.",
        "Annual influenza vaccine, pneumococcal vaccine if not done.",
    ],
    ("plan_item", "asthma"): [
        "Step up therapy: add low-dose ICS or increase current dose.",
        "Provide asthma action plan, ensure proper inhaler technique.",
        "Allergen testing if not previously done.",
    ],
    # Follow-up phrases
    ("plan_item", "follow_up"): [
        "Follow up in 2-4 weeks to reassess symptoms.",
        "Return sooner if symptoms worsen or new symptoms develop.",
        "Schedule follow-up after completing ordered tests.",
    ],
    # Orders bucket
    ("order_draft", "anemia"): [
        "CBC with differential, reticulocyte count",
        "Iron studies (ferritin, TIBC, serum iron)",
        "Vitamin B12, folate levels",
        "Peripheral blood smear",
    ],
    ("order_draft", "diabetes"): [
        "HbA1c, fasting glucose",
        "Lipid panel, BMP",
        "Urine microalbumin/creatinine ratio",
    ],
}

# Problem keyword mapping (maps common problem names to canonical keywords)
PROBLEM_KEYWORD_MAP = {
    "iron deficiency": "anemia",
    "low hemoglobin": "anemia",
    "low hgb": "anemia",
    "htn": "hypertension",
    "high blood pressure": "hypertension",
    "elevated bp": "hypertension",
    "dm": "diabetes",
    "dm2": "diabetes",
    "type 2 diabetes": "diabetes",
    "t2dm": "diabetes",
    "hyperglycemia": "diabetes",
    "cad": "chest pain",
    "coronary artery": "chest pain",
    "angina": "chest pain",
    "acs": "chest pain",
    "sob": "copd",
    "shortness of breath": "copd",
    "dyspnea": "copd",
    "wheezing": "asthma",
    "reactive airway": "asthma",
}


def get_problem_keyword(problems: List[str]) -> Optional[str]:
    """Extract canonical problem keyword from problem list."""
    if not problems:
        return None
    
    # Check each problem title against keyword map
    for problem in problems:
        problem_lower = problem.lower()
        # Direct match
        for key, canonical in PROBLEM_KEYWORD_MAP.items():
            if key in problem_lower:
                return canonical
        # Also check if canonical keyword is directly in problem
        for canonical in set(PROBLEM_KEYWORD_MAP.values()):
            if canonical in problem_lower:
                return canonical
    
    return None


def get_contextual_phrase(
    field_type: Optional[str], 
    problems: List[str], 
    text: str
) -> Optional[str]:
    """
    Engine B: Get contextual phrase based on field type and problem context.
    Returns the best matching phrase or None.
    """
    if not field_type:
        return None
    
    keyword = get_problem_keyword(problems)
    if not keyword:
        return None
    
    # Look up phrases for this field_type + keyword combination
    phrases = CONTEXTUAL_PHRASES.get((field_type, keyword), [])
    if not phrases:
        # Try just the keyword with common field types
        phrases = CONTEXTUAL_PHRASES.get(("plan_item", keyword), [])
    
    if not phrases:
        return None
    
    # Find phrase that best continues the current text
    text_lower = text.lower().strip()
    
    # If text is very short or empty, return first phrase
    if len(text_lower) < 3:
        return phrases[0]
    
    # Look for partial matches
    for phrase in phrases:
        phrase_lower = phrase.lower()
        # If user started typing something that matches a phrase beginning
        words = text_lower.split()
        if words:
            last_word = words[-1]
            if phrase_lower.startswith(last_word):
                return phrase[len(last_word):]
            # Check if phrase contains what user is typing
            if last_word in phrase_lower and len(last_word) >= 3:
                idx = phrase_lower.index(last_word)
                return phrase[idx + len(last_word):]
    
    return None


def get_simple_completion(text: str, section: str = "general") -> Optional[str]:
    """
    Engine A: Fast, deterministic completions based on pattern matching.
    This runs before LLM fallback for speed.
    """
    text_lower = text.lower().strip()
    
    # Get templates for this section + general
    templates = SECTION_TEMPLATES.get(section, []) + SECTION_TEMPLATES.get("general", [])
    
    # Find matching template
    for trigger, completion in templates:
        if text_lower.endswith(trigger):
            return completion
    
    return None


async def get_llm_completion(
    text: str, 
    section: str, 
    patient_context: dict,
    field_type: Optional[str] = None,
    active_problems: Optional[List[str]] = None
) -> str:
    """
    Engine C: LLM-powered completion for more complex cases.
    Uses patient context AND current workspace problems to ground suggestions.
    """
    try:
        client = config.get_openai_client()
        
        # Build context from patient data
        context_parts = []
        
        # Prioritize workspace active problems (most relevant)
        if active_problems:
            context_parts.append(f"Active problems this visit: {', '.join(active_problems[:5])}")
        elif patient_context.get("problems"):
            context_parts.append(f"Known problems: {', '.join(patient_context['problems'][:5])}")
        
        if patient_context.get("medications"):
            context_parts.append(f"Current medications: {', '.join(patient_context['medications'][:5])}")
        if patient_context.get("recent_labs"):
            context_parts.append(f"Recent abnormal labs: {', '.join(patient_context['recent_labs'][:3])}")
        
        context_str = "\n".join(context_parts) if context_parts else "No patient context available."
        
        # Add field-type hint to prompt
        field_hint = ""
        if field_type:
            field_hints = {
                "one_liner": "a one-line HPI summary",
                "symptom": "symptom description",
                "red_flag": "red flag symptom",
                "assessment": "clinical assessment/diagnosis",
                "plan_item": "treatment plan item",
                "order_draft": "lab/imaging order",
                "agenda_item": "visit agenda item",
            }
            field_hint = f"\nFIELD TYPE: {field_hints.get(field_type, field_type)}"
        
        system_prompt = f"""You are a clinical documentation assistant. Complete the sentence or phrase the doctor is typing.

RULES:
- Return ONLY the completion (no quotes, no explanation)
- Keep it SHORT (max 20 words)
- Use standard clinical phrasing
- Do NOT invent patient facts not in CONTEXT
- Tailor completion to the active problems when relevant
- If uncertain, return empty string
- Prefer common clinical phrases over novel text"""

        user_prompt = f"""CONTEXT:
{context_str}

SECTION: {section}{field_hint}

TEXT TO COMPLETE:
{text[-500:]}

Complete the above text with a natural continuation. Return only the completion."""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=50,
            temperature=0.1,
        )
        
        completion = response.choices[0].message.content.strip()
        
        # Clean up common artifacts
        if completion.startswith('"') and completion.endswith('"'):
            completion = completion[1:-1]
        if completion.startswith("'") and completion.endswith("'"):
            completion = completion[1:-1]
            
        return completion
        
    except Exception as e:
        logger.error(f"LLM completion error: {e}")
        return ""


def get_patient_context(patient_id: str) -> dict:
    """Fetch patient context for grounding completions (DB query, not cached)."""
    context = {
        "problems": [],
        "medications": [],
        "recent_labs": [],
    }
    
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Get recent documents for context
                cur.execute("""
                    SELECT document_type, extracted_data
                    FROM documents
                    WHERE patient_id = %s
                    ORDER BY created_at DESC
                    LIMIT 10
                """, (patient_id,))
                
                for doc_type, data in cur.fetchall():
                    if not data:
                        continue
                        
                    if doc_type == "lab_report":
                        # Extract abnormal labs
                        structured = data.get("structured", {})
                        tests = structured.get("tests", [])
                        for test in tests:
                            if test.get("flag") in ["high", "low", "critical"]:
                                context["recent_labs"].append(
                                    f"{test.get('test_name', 'Unknown')}: {test.get('result_value', '')}"
                                )
                    
                    elif doc_type == "prescription":
                        # Extract medications
                        structured = data.get("structured", {})
                        items = structured.get("items", [])
                        for item in items:
                            if item.get("drug_name"):
                                context["medications"].append(item["drug_name"])
                
                # Get problems from workspace if exists
                cur.execute("""
                    SELECT problems FROM workspaces
                    WHERE patient_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (patient_id,))
                
                row = cur.fetchone()
                if row and row[0]:
                    problems = row[0]
                    context["problems"] = [p.get("title", "") for p in problems if p.get("title")]
                    
    except Exception as e:
        logger.warning(f"Failed to get patient context: {e}")
    
    return context


def get_cached_context(consultation_id: str, patient_id: str) -> dict:
    """
    Get consultation context with caching.
    
    Cache Layer A: Avoids repeated DB queries for same consultation.
    TTL: 10 minutes (context changes infrequently during a session).
    """
    # Try cache first
    cached = context_cache.get(consultation_id, patient_id)
    if cached is not None:
        return cached
    
    # Cache miss - fetch from DB
    context = get_patient_context(patient_id)
    
    # Store in cache
    context_cache.set(consultation_id, patient_id, context)
    
    return context


@router.post("/autocomplete", response_model=AutocompleteResponse)
async def notes_autocomplete(payload: AutocompleteRequest):
    """
    Provide inline autocomplete suggestions (ghost text) for clinical notes.
    
    Caching Strategy:
    - Layer A: Consultation context cache (10 min TTL)
    - Layer B: Autocomplete response cache (2 min TTL, hash-based key)
    
    3-Engine Strategy:
    1. Engine A: Fast pattern-based completion (deterministic templates)
    2. Engine B: Contextual phrase bank (problem-type keyed, no LLM)
    3. Engine C: LLM for complex/novel cases
    """
    section = payload.section or "general"
    text = payload.text
    field_type = payload.field_type
    field_type_str = field_type.value if field_type else None
    active_problems = payload.active_problems or []
    consultation_id = payload.consultation_id or ""
    patient_id = payload.patient_id or ""
    
    if not text or len(text.strip()) < 2:
        return AutocompleteResponse(completion="")
    
    # =========================================================================
    # CACHE LAYER B: Check autocomplete response cache
    # =========================================================================
    cached_completion = autocomplete_cache.get(
        consultation_id, section, field_type_str, text, active_problems
    )
    if cached_completion is not None:
        return AutocompleteResponse(
            completion=cached_completion, 
            confidence=0.9,
            source="cache"
        )
    
    # =========================================================================
    # ENGINE A: Fast pattern matching (fastest, no cache needed)
    # =========================================================================
    simple_completion = get_simple_completion(text, section)
    if simple_completion:
        # Cache the result
        autocomplete_cache.set(
            consultation_id, section, field_type_str, text, 
            simple_completion, active_problems
        )
        return AutocompleteResponse(
            completion=simple_completion, 
            confidence=0.95,
            source="template"
        )
    
    # =========================================================================
    # ENGINE B: Contextual phrase bank (fast, problem-aware)
    # =========================================================================
    if field_type_str and active_problems:
        contextual_completion = get_contextual_phrase(field_type_str, active_problems, text)
        if contextual_completion:
            autocomplete_cache.set(
                consultation_id, section, field_type_str, text,
                contextual_completion, active_problems
            )
            return AutocompleteResponse(
                completion=contextual_completion, 
                confidence=0.85,
                source="phrase_bank"
            )
    
    # =========================================================================
    # ENGINE C: LLM (slowest but most flexible)
    # =========================================================================
    text_stripped = text.rstrip()
    if text_stripped and not text_stripped[-1] in '.!?':
        # Use cached context (Layer A)
        patient_context = get_cached_context(consultation_id, patient_id) if patient_id else {}
        
        llm_completion = await get_llm_completion(
            text, section, patient_context, field_type_str, active_problems
        )
        if llm_completion:
            # Cache LLM result too
            autocomplete_cache.set(
                consultation_id, section, field_type_str, text,
                llm_completion, active_problems
            )
            return AutocompleteResponse(
                completion=llm_completion, 
                confidence=0.7,
                source="llm"
            )
    
    return AutocompleteResponse(completion="")


# ============================================================================
# STRUCTURED SUGGESTIONS (Dropdown)
# ============================================================================

# Common ICD-10 codes for quick access
COMMON_ICD10 = [
    ("E11.9", "Type 2 diabetes mellitus without complications"),
    ("I10", "Essential (primary) hypertension"),
    ("J06.9", "Acute upper respiratory infection, unspecified"),
    ("M54.5", "Low back pain"),
    ("K21.0", "Gastro-esophageal reflux disease with esophagitis"),
    ("F41.1", "Generalized anxiety disorder"),
    ("F32.9", "Major depressive disorder, single episode, unspecified"),
    ("J45.909", "Unspecified asthma, uncomplicated"),
    ("E78.5", "Hyperlipidemia, unspecified"),
    ("N39.0", "Urinary tract infection, site not specified"),
    ("R10.9", "Unspecified abdominal pain"),
    ("R51", "Headache"),
    ("R05", "Cough"),
    ("R50.9", "Fever, unspecified"),
    ("D64.9", "Anemia, unspecified"),
    ("B34.9", "Viral infection, unspecified"),
    ("J20.9", "Acute bronchitis, unspecified"),
    ("H66.90", "Otitis media, unspecified, unspecified ear"),
    ("J02.9", "Acute pharyngitis, unspecified"),
    ("L30.9", "Dermatitis, unspecified"),
]

# Common medications
COMMON_MEDICATIONS = [
    ("lisinopril", "ACE inhibitor - Hypertension, Heart failure"),
    ("metformin", "Biguanide - Type 2 diabetes"),
    ("atorvastatin", "Statin - Hyperlipidemia"),
    ("amlodipine", "Calcium channel blocker - Hypertension"),
    ("omeprazole", "PPI - GERD, Peptic ulcer"),
    ("metoprolol", "Beta blocker - Hypertension, Heart failure"),
    ("levothyroxine", "Thyroid hormone - Hypothyroidism"),
    ("albuterol", "Beta-2 agonist - Asthma, COPD"),
    ("gabapentin", "Anticonvulsant - Neuropathic pain"),
    ("sertraline", "SSRI - Depression, Anxiety"),
    ("amoxicillin", "Penicillin antibiotic - Bacterial infections"),
    ("azithromycin", "Macrolide antibiotic - Respiratory infections"),
    ("prednisone", "Corticosteroid - Inflammation"),
    ("ibuprofen", "NSAID - Pain, Inflammation"),
    ("acetaminophen", "Analgesic - Pain, Fever"),
]

# Common lab orders
COMMON_LABS = [
    ("CBC", "Complete Blood Count"),
    ("BMP", "Basic Metabolic Panel"),
    ("CMP", "Comprehensive Metabolic Panel"),
    ("LFT", "Liver Function Tests"),
    ("TSH", "Thyroid Stimulating Hormone"),
    ("HbA1c", "Hemoglobin A1c"),
    ("Lipid Panel", "Cholesterol, Triglycerides, HDL, LDL"),
    ("UA", "Urinalysis"),
    ("PT/INR", "Prothrombin Time / INR"),
    ("BNP", "B-type Natriuretic Peptide"),
    ("Troponin", "Cardiac Troponin"),
    ("D-dimer", "Fibrin degradation fragment"),
    ("CRP", "C-Reactive Protein"),
    ("ESR", "Erythrocyte Sedimentation Rate"),
    ("Ferritin", "Iron storage protein"),
    ("Vitamin D", "25-hydroxyvitamin D"),
    ("B12", "Vitamin B12"),
    ("PSA", "Prostate-Specific Antigen"),
]

# Common orders (imaging, referrals, procedures)
COMMON_ORDERS = [
    ("Chest X-ray", "imaging", "PA and lateral views"),
    ("CT Head", "imaging", "Without contrast"),
    ("MRI Brain", "imaging", "With and without contrast"),
    ("CT Abdomen/Pelvis", "imaging", "With contrast"),
    ("Echocardiogram", "imaging", "Transthoracic"),
    ("EKG", "procedure", "12-lead electrocardiogram"),
    ("Cardiology referral", "referral", "Cardiac evaluation"),
    ("GI referral", "referral", "Endoscopy evaluation"),
    ("Pulmonology referral", "referral", "Pulmonary function testing"),
    ("Physical therapy", "referral", "Rehabilitation"),
    ("Colonoscopy", "procedure", "Screening/diagnostic"),
    ("Spirometry", "procedure", "Pulmonary function test"),
]


def search_icd10(query: str, patient_id: Optional[str], limit: int) -> List[SuggestionItem]:
    """Search ICD-10 codes, prioritizing patient history."""
    results = []
    query_lower = query.lower()
    
    # First, check patient's previous diagnoses
    if patient_id:
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT DISTINCT problems
                        FROM workspaces
                        WHERE patient_id = %s
                        ORDER BY created_at DESC
                        LIMIT 5
                    """, (patient_id,))
                    
                    for (problems,) in cur.fetchall():
                        if not problems:
                            continue
                        for p in problems:
                            title = p.get("title", "")
                            if query_lower in title.lower():
                                results.append(SuggestionItem(
                                    type="icd10",
                                    display_text=title,
                                    source="patient_history"
                                ))
        except Exception as e:
            logger.warning(f"Failed to search patient history: {e}")
    
    # Then add common codes that match
    for code, name in COMMON_ICD10:
        if query_lower in code.lower() or query_lower in name.lower():
            results.append(SuggestionItem(
                type="icd10",
                code=code,
                display_text=name,
                source="knowledge_base"
            ))
    
    # Deduplicate and limit
    seen = set()
    unique_results = []
    for item in results:
        key = item.display_text.lower()
        if key not in seen:
            seen.add(key)
            unique_results.append(item)
        if len(unique_results) >= limit:
            break
    
    return unique_results


def search_medications(query: str, patient_id: Optional[str], limit: int) -> List[SuggestionItem]:
    """Search medications, prioritizing patient's current meds."""
    results = []
    query_lower = query.lower()
    
    # Check patient's current medications
    if patient_id:
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT payload
                        FROM documents
                        WHERE patient_id = %s AND document_type = 'prescription'
                        ORDER BY processed_at DESC
                        LIMIT 5
                    """, (patient_id,))
                    
                    for (data,) in cur.fetchall():
                        if not data:
                            continue
                        # payload has 'structured' at root level
                        structured = data.get("structured", {})
                        items = structured.get("items", [])
                        for item in items:
                            drug = item.get("drug_name", "")
                            if drug and query_lower in drug.lower():
                                results.append(SuggestionItem(
                                    type="medication",
                                    display_text=drug,
                                    details=item.get("strength_or_concentration", ""),
                                    source="patient_history"
                                ))
        except Exception as e:
            logger.warning(f"Failed to search patient medications: {e}")
    
    # Add common medications that match
    for name, indication in COMMON_MEDICATIONS:
        if query_lower in name.lower() or query_lower in indication.lower():
            results.append(SuggestionItem(
                type="medication",
                display_text=name,
                details=indication,
                source="knowledge_base"
            ))
    
    # Deduplicate and limit
    seen = set()
    unique_results = []
    for item in results:
        key = item.display_text.lower()
        if key not in seen:
            seen.add(key)
            unique_results.append(item)
        if len(unique_results) >= limit:
            break
    
    return unique_results


# ============================================================================
# CONTEXT-AWARE LAB/ORDER BOOSTING
# Maps problem keywords to relevant labs/orders
# ============================================================================

PROBLEM_LAB_BOOSTS = {
    "anemia": ["CBC", "Ferritin", "Iron", "B12", "Folate", "Reticulocyte", "TIBC"],
    "diabetes": ["HbA1c", "Glucose", "BMP", "Lipid", "Creatinine", "Microalbumin"],
    "hypertension": ["BMP", "Lipid", "Creatinine", "Potassium", "Glucose"],
    "thyroid": ["TSH", "T4", "T3", "Thyroid"],
    "liver": ["LFT", "AST", "ALT", "Bilirubin", "GGT", "Albumin", "INR"],
    "kidney": ["BMP", "CMP", "Creatinine", "BUN", "GFR", "Microalbumin", "UA"],
    "infection": ["CBC", "CRP", "ESR", "Blood Culture", "UA"],
    "chest pain": ["Troponin", "BNP", "D-dimer", "EKG", "Lipid"],
    "copd": ["Spirometry", "ABG", "CBC", "Chest X-ray"],
    "heart failure": ["BNP", "BMP", "Troponin", "Echo", "Chest X-ray"],
}

PROBLEM_ORDER_BOOSTS = {
    "chest pain": ["EKG", "Chest X-ray", "Echocardiogram", "CT", "Stress", "Cardiology"],
    "copd": ["Spirometry", "Chest X-ray", "Pulmonology"],
    "abdominal": ["CT Abdomen", "Ultrasound", "GI referral", "Colonoscopy"],
    "neurological": ["MRI Brain", "CT Head", "Neurology"],
    "cardiac": ["EKG", "Echocardiogram", "Cardiology", "Stress"],
}


def get_boost_score(item_name: str, problems: List[str]) -> float:
    """Calculate boost score based on problem relevance."""
    if not problems:
        return 0.0
    
    item_lower = item_name.lower()
    max_boost = 0.0
    
    for problem in problems:
        keyword = get_problem_keyword([problem])
        if not keyword:
            continue
        
        # Check lab boosts
        boosted_labs = PROBLEM_LAB_BOOSTS.get(keyword, [])
        for lab in boosted_labs:
            if lab.lower() in item_lower:
                max_boost = max(max_boost, 1.0)
                break
        
        # Check order boosts
        boosted_orders = PROBLEM_ORDER_BOOSTS.get(keyword, [])
        for order in boosted_orders:
            if order.lower() in item_lower:
                max_boost = max(max_boost, 1.0)
                break
    
    return max_boost


def search_labs(
    query: str, 
    limit: int, 
    active_problems: Optional[List[str]] = None
) -> List[SuggestionItem]:
    """Search lab order options with context-aware boosting."""
    results = []
    query_lower = query.lower()
    
    for code, name in COMMON_LABS:
        if query_lower in code.lower() or query_lower in name.lower():
            boost = get_boost_score(name, active_problems or [])
            relevance_reason = None
            if boost > 0 and active_problems:
                # Find which problem caused the boost
                for p in active_problems:
                    kw = get_problem_keyword([p])
                    if kw and any(lab.lower() in name.lower() for lab in PROBLEM_LAB_BOOSTS.get(kw, [])):
                        relevance_reason = f"Relevant for {p}"
                        break
            
            results.append(SuggestionItem(
                type="lab",
                code=code,
                display_text=name,
                source="context_boost" if boost > 0 else "knowledge_base",
                relevance_reason=relevance_reason,
                boost_score=boost
            ))
    
    # Sort by boost score (descending), then alphabetically
    results.sort(key=lambda x: (-x.boost_score if x.boost_score else 0, x.display_text))
    
    return results[:limit]


def search_orders(
    query: str, 
    limit: int,
    active_problems: Optional[List[str]] = None
) -> List[SuggestionItem]:
    """Search order options with context-aware boosting."""
    results = []
    query_lower = query.lower()
    
    for name, order_type, details in COMMON_ORDERS:
        if query_lower in name.lower() or query_lower in details.lower():
            boost = get_boost_score(name, active_problems or [])
            relevance_reason = None
            if boost > 0 and active_problems:
                for p in active_problems:
                    kw = get_problem_keyword([p])
                    if kw and any(o.lower() in name.lower() for o in PROBLEM_ORDER_BOOSTS.get(kw, [])):
                        relevance_reason = f"Relevant for {p}"
                        break
            
            results.append(SuggestionItem(
                type="order",
                display_text=name,
                details=f"{order_type.title()}: {details}",
                source="context_boost" if boost > 0 else "knowledge_base",
                relevance_reason=relevance_reason,
                boost_score=boost
            ))
    
    # Sort by boost score (descending), then alphabetically
    results.sort(key=lambda x: (-x.boost_score if x.boost_score else 0, x.display_text))
    
    return results[:limit]


@router.post("/suggestions", response_model=SuggestionResponse)
async def get_suggestions(payload: SuggestionRequest):
    """
    Get structured suggestions for dropdown selection.
    Now with context-aware boosting based on active problems!
    
    Types:
    - icd10: ICD-10 diagnosis codes
    - medication: Medication names
    - lab: Lab order options (boosted by problem context)
    - order: Imaging, referrals, procedures (boosted by problem context)
    """
    suggestion_type = payload.type
    query = payload.query
    patient_id = payload.patient_id
    limit = payload.limit
    active_problems = payload.active_problems or []
    
    if suggestion_type == SuggestionType.ICD10:
        items = search_icd10(query, patient_id, limit)
    elif suggestion_type == SuggestionType.MEDICATION:
        items = search_medications(query, patient_id, limit)
    elif suggestion_type == SuggestionType.LAB:
        items = search_labs(query, limit, active_problems)
    elif suggestion_type == SuggestionType.ORDER:
        items = search_orders(query, limit, active_problems)
    else:
        items = []
    
    return SuggestionResponse(items=items)


# ============================================================================
# BATCH SUGGESTIONS (for initial load)
# ============================================================================

@router.get("/suggestions/common")
async def get_common_suggestions(patient_id: Optional[str] = None):
    """
    Get commonly used suggestions for quick access buttons.
    Optionally personalized for a specific patient.
    """
    result = {
        "icd10": [SuggestionItem(type="icd10", code=c, display_text=n, source="knowledge_base") 
                  for c, n in COMMON_ICD10[:10]],
        "medications": [SuggestionItem(type="medication", display_text=n, details=d, source="knowledge_base")
                        for n, d in COMMON_MEDICATIONS[:10]],
        "labs": [SuggestionItem(type="lab", code=c, display_text=n, source="knowledge_base")
                 for c, n in COMMON_LABS[:10]],
    }
    
    # Add patient-specific frequent items if patient_id provided
    if patient_id:
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    # Get patient's most recent problems
                    cur.execute("""
                        SELECT problems FROM workspaces
                        WHERE patient_id = %s
                        ORDER BY created_at DESC
                        LIMIT 1
                    """, (patient_id,))
                    
                    row = cur.fetchone()
                    if row and row[0]:
                        patient_problems = [
                            SuggestionItem(
                                type="icd10",
                                display_text=p.get("title", ""),
                                source="patient_history"
                            )
                            for p in row[0][:5] if p.get("title")
                        ]
                        result["patient_problems"] = patient_problems
                        
        except Exception as e:
            logger.warning(f"Failed to get patient suggestions: {e}")
    
    return result


# ============================================================================
# CACHE MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/cache/stats")
async def cache_statistics():
    """
    Get autocomplete cache statistics for monitoring.
    
    Returns hit/miss rates for:
    - Autocomplete response cache
    - Consultation context cache
    """
    return get_cache_stats()


@router.post("/cache/invalidate/{consultation_id}")
async def invalidate_cache(consultation_id: str):
    """
    Invalidate all caches for a consultation.
    
    Call this when:
    - Workspace is regenerated
    - Patient documents are updated
    - Problems are modified
    """
    invalidate_consultation_caches(consultation_id)
    return {"status": "ok", "consultation_id": consultation_id}
