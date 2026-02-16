"""
Problem enrichment module - provides on-demand clinical content for problems.
Implements "Seed → Enrich" model with HYBRID approach:
  1. KB-first: Use curated knowledge base for known syndromes (safe, predictable)
  2. LLM-fallback: Use LLM for unknown problems (broad coverage, flagged for review)

This keeps the system intelligent (problem-aware content) and safe (doctor-initiated).
"""
from typing import Dict, Any, List, Optional, Literal
from enum import Enum
import uuid
import json
import logging
from langchain_openai import ChatOpenAI
from medicai.config import Config

logger = logging.getLogger(__name__)


# ============================================================================
# ENRICHMENT MODE AND ORIGIN TRACKING
# ============================================================================

class EnrichmentMode(str, Enum):
    """Mode for enrichment: KB only, LLM only, or auto (KB-first, LLM-fallback)"""
    KB = "kb"
    LLM = "llm"
    AUTO = "auto"


class EnrichmentOrigin(str, Enum):
    """Tracks where enrichment content came from"""
    KNOWLEDGE_BASE = "knowledge_base"
    LLM_GENERATED = "llm_generated"
    DEFAULT_TEMPLATE = "default_template"


# ============================================================================
# CLINICAL KNOWLEDGE BASE
# Organized by syndrome/problem type for problem-aware enrichment
# ============================================================================

SYNDROME_KNOWLEDGE = {
    "anemia": {
        "symptoms_prompts": [
            {"name": "Fatigue", "details": "Sévérité et impact sur les activités quotidiennes"},
            {"name": "Dyspnée d'effort", "details": "Début et facteurs déclenchants"},
            {"name": "Vertiges", "details": "Fréquence et circonstances"},
            {"name": "Pâleur", "details": "Cutanée et conjonctivale"},
            {"name": "Pica/pagophagie", "details": "Envie de glace (indicateur de carence en fer)"},
        ],
        "red_flags": [
            {"label": "Méléna (selles noires, goudronneuses)", "checked": None},
            {"label": "Hématémèse (vomissements de sang)", "checked": None},
            {"label": "Rectorragie (sang rouge vif dans les selles)", "checked": None},
            {"label": "Douleur thoracique ou syncope", "checked": None},
            {"label": "Saignement actif", "checked": None},
        ],
        "assessment_template": "Anémie documentée au bilan biologique. Nécessite une évaluation des symptômes, vérification de la stabilité hémodynamique et recherche de la cause sous-jacente selon les indices et le contexte clinique.",
        "plan_template": {
            "today": [
                "Évaluer les symptômes d'anémie (fatigue, dyspnée, vertiges)",
                "Rechercher des signes de saignement (GI, menstruel)",
                "Revoir les médicaments (AINS, anticoagulants)",
                "Évaluer la stabilité hémodynamique",
            ],
            "orders": [
                "NFS de contrôle avec réticulocytes",
                "Bilan martial (ferritine, fer sérique, CTF, saturation)",
                "B12, folates si macrocytose",
                "Recherche de sang occulte / bilan GI selon indication",
            ],
            "treatment": [
                "Envisager orientation urgente si symptomatique ou instable hémodynamiquement",
            ],
            "follow_up": [
                "Contrôle sous 48-72h avec bilan biologique",
            ],
            "safety_net": [
                "Reconsulter en urgence si douleur thoracique, syncope, dyspnée aggravée ou signes de saignement",
            ],
        },
        "suggested_orders": [
            {"code": "NFS", "name": "Numération formule sanguine avec différentiel", "urgency": "routine"},
            {"code": "RETIC", "name": "Réticulocytes", "urgency": "routine"},
            {"code": "FER", "name": "Bilan martial (ferritine, fer, CTF)", "urgency": "routine"},
            {"code": "B12", "name": "Vitamine B12", "urgency": "routine"},
            {"code": "FOLATES", "name": "Folates", "urgency": "routine"},
            {"code": "HSO", "name": "Recherche de sang occulte dans les selles", "urgency": "routine"},
        ],
    },
    
    "leukocytosis": {
        "symptoms_prompts": [
            {"name": "Fièvre", "details": "Température, durée, évolution"},
            {"name": "Douleur/gonflement localisé", "details": "Site de possible infection"},
            {"name": "Fatigue/malaise", "details": "Sévérité et début"},
            {"name": "Sueurs nocturnes", "details": "Fréquence et sévérité"},
            {"name": "Perte de poids", "details": "Involontaire, quantité et délai"},
        ],
        "red_flags": [
            {"label": "Fièvre élevée (>39°C)", "checked": None},
            {"label": "Frissons/rigidité", "checked": None},
            {"label": "Troubles de la conscience", "checked": None},
            {"label": "Perte de poids inexpliquée", "checked": None},
            {"label": "Adénopathies", "checked": None},
        ],
        "assessment_template": "Hyperleucocytose. Envisager causes infectieuses, inflammatoires ou hématologiques. Nécessite recherche de signes/symptômes d'infection ou de processus sous-jacent.",
        "plan_template": {
            "today": [
                "Rechercher fièvre, signes localisateurs d'infection",
                "Revoir maladies récentes, médicaments (corticoïdes)",
                "Examiner adénopathies, hépatosplénomégalie",
            ],
            "orders": [
                "NFS de contrôle avec différentiel",
                "Hémocultures si fébrile",
                "CRP/VS pour inflammation",
                "Frottis sanguin si persistant",
            ],
            "treatment": [
                "Traiter l'infection sous-jacente si identifiée",
                "Envisager avis hématologie si élévation marquée",
            ],
            "follow_up": [
                "Contrôle sous 48-72h avec NFS",
            ],
            "safety_net": [
                "Reconsulter si fièvre >39°C, frissons ou aggravation",
            ],
        },
        "suggested_orders": [
            {"code": "NFS", "name": "Numération formule sanguine avec différentiel", "urgency": "routine"},
            {"code": "CRP", "name": "Protéine C-réactive", "urgency": "routine"},
            {"code": "VS", "name": "Vitesse de sédimentation", "urgency": "routine"},
            {"code": "HEMOC", "name": "Hémocultures x2", "urgency": "stat"},
            {"code": "FROTTIS", "name": "Frottis sanguin périphérique", "urgency": "routine"},
        ],
    },
    
    "leukopenia": {
        "symptoms_prompts": [
            {"name": "Infections récurrentes", "details": "Fréquence et types"},
            {"name": "Fièvre", "details": "Même fébricule significatif"},
            {"name": "Fatigue", "details": "Sévérité"},
            {"name": "Aphtes buccaux", "details": "Ulcères oraux"},
            {"name": "Ecchymoses faciles", "details": "Si thrombopénie associée"},
        ],
        "red_flags": [
            {"label": "Fièvre (toute élévation thermique)", "checked": None},
            {"label": "Aphtes/ulcères buccaux", "checked": None},
            {"label": "Signes d'infection", "checked": None},
            {"label": "Pétéchies/ecchymoses", "checked": None},
            {"label": "Neutropénie sévère (PNN <500)", "checked": None},
        ],
        "assessment_template": "Leucopénie augmentant le risque infectieux. Évaluer insuffisance médullaire, infection virale, effet médicamenteux ou cause auto-immune.",
        "plan_template": {
            "today": [
                "Rechercher fièvre (même légère), signes d'infection",
                "Revoir médicaments (chimiothérapie, immunosuppresseurs)",
                "Interroger sur maladie virale récente",
            ],
            "orders": [
                "NFS de contrôle avec différentiel",
                "Frottis sanguin périphérique",
                "Réticulocytes",
                "Envisager B12, folates, sérologie VIH",
            ],
            "treatment": [
                "Suspendre médicaments possiblement en cause",
                "Avis hématologie si sévère ou persistant",
                "Envisager précautions neutropéniques si PNN <500",
            ],
            "follow_up": [
                "Contrôle sous 48h avec NFS",
            ],
            "safety_net": [
                "Consulter immédiatement pour TOUTE fièvre, aphtes ou signes d'infection",
            ],
        },
        "suggested_orders": [
            {"code": "NFS", "name": "Numération formule sanguine avec différentiel", "urgency": "stat"},
            {"code": "FROTTIS", "name": "Frottis sanguin périphérique", "urgency": "routine"},
            {"code": "RETIC", "name": "Réticulocytes", "urgency": "routine"},
            {"code": "VIH", "name": "Sérologie VIH", "urgency": "routine"},
        ],
    },
    
    "renal_dysfunction": {
        "symptoms_prompts": [
            {"name": "Diminution de la diurèse", "details": "Début et volume"},
            {"name": "Œdèmes", "details": "Localisation et sévérité"},
            {"name": "Nausées/vomissements", "details": "Si présents"},
            {"name": "Fatigue", "details": "Sévérité"},
            {"name": "Urines mousseuses", "details": "Suggère protéinurie"},
        ],
        "red_flags": [
            {"label": "Oligurie/anurie", "checked": None},
            {"label": "Confusion ou troubles de conscience", "checked": None},
            {"label": "Douleur thoracique ou dyspnée (surcharge)", "checked": None},
            {"label": "HTA sévère", "checked": None},
            {"label": "Frottement péricardique", "checked": None},
        ],
        "assessment_template": "Élévation de la créatinine suggérant insuffisance rénale aiguë ou aggravation d'IRC. Nécessite évaluation fonction rénale, état volémique et facteurs déclenchants.",
        "plan_template": {
            "today": [
                "Évaluer état volémique et diurèse",
                "Revoir médicaments néphrotoxiques",
                "Rechercher symptômes d'obstruction urinaire",
                "Mesurer tension artérielle",
            ],
            "orders": [
                "Ionogramme/bilan rénal de contrôle",
                "ECBU avec sédiment urinaire",
                "Échographie rénale si obstruction suspectée",
                "Rapport protéinurie/créatininurie",
            ],
            "treatment": [
                "Suspendre médicaments néphrotoxiques (AINS, IEC/ARA2 si IRA)",
                "Remplissage si cause prérénale",
                "Envisager avis néphrologie",
            ],
            "follow_up": [
                "Contrôle sous 48-72h avec bilan biologique",
            ],
            "safety_net": [
                "Reconsulter en urgence si oligurie, confusion ou aggravation",
            ],
        },
        "suggested_orders": [
            {"code": "IONO", "name": "Ionogramme sanguin", "urgency": "stat"},
            {"code": "ECBU", "name": "ECBU avec sédiment", "urgency": "routine"},
            {"code": "RAC", "name": "Rapport albumine/créatinine urinaire", "urgency": "routine"},
            {"code": "ECHOREN", "name": "Échographie rénale", "urgency": "routine"},
        ],
    },
    
    "hyperglycemia": {
        "symptoms_prompts": [
            {"name": "Polyurie", "details": "Fréquence, nycturie"},
            {"name": "Polydipsie", "details": "Sévérité"},
            {"name": "Variations de poids", "details": "Quantité et délai"},
            {"name": "Vision floue", "details": "Si présente"},
            {"name": "Fatigue", "details": "Sévérité"},
        ],
        "red_flags": [
            {"label": "Confusion ou troubles de conscience", "checked": None},
            {"label": "Haleine fruitée (cétose)", "checked": None},
            {"label": "Douleur abdominale", "checked": None},
            {"label": "Respiration de Kussmaul", "checked": None},
            {"label": "Déshydratation sévère", "checked": None},
        ],
        "assessment_template": "Hyperglycémie nécessitant évaluation de l'équilibre diabétique et observance thérapeutique. Éliminer facteurs déclenchants (infection, mauvaise observance).",
        "plan_template": {
            "today": [
                "Évaluer symptômes d'hyperglycémie (polyurie, polydipsie)",
                "Vérifier observance thérapeutique",
                "Rechercher signes d'acidocétose si sévère",
                "Revoir régime et hygiène de vie",
            ],
            "orders": [
                "HbA1c si non récente",
                "Ionogramme pour évaluer électrolytes",
                "Bandelette urinaire pour cétonurie si indiqué",
                "Bilan lipidique si non récent",
            ],
            "treatment": [
                "Ajuster traitement antidiabétique selon besoin",
                "Renforcer mesures hygiéno-diététiques",
                "Éducation thérapeutique diabète",
            ],
            "follow_up": [
                "Contrôle sous 1-2 semaines pour évaluer réponse",
            ],
            "safety_net": [
                "Reconsulter en urgence si confusion, vomissements ou symptômes sévères",
            ],
        },
        "suggested_orders": [
            {"code": "HBA1C", "name": "Hémoglobine glyquée", "urgency": "routine"},
            {"code": "IONO", "name": "Ionogramme sanguin", "urgency": "routine"},
            {"code": "BU", "name": "Bandelette urinaire", "urgency": "routine"},
            {"code": "LIPIDES", "name": "Bilan lipidique", "urgency": "routine"},
        ],
    },
    
    "liver_dysfunction": {
        "symptoms_prompts": [
            {"name": "Ictère", "details": "Jaunisse cutanée/sclérale, début"},
            {"name": "Douleur hypochondre droit", "details": "Caractère et sévérité"},
            {"name": "Fatigue/asthénie", "details": "Sévérité et début"},
            {"name": "Urines foncées/selles décolorées", "details": "Si présents"},
            {"name": "Prurit", "details": "Démangeaisons (cholestase)"},
        ],
        "red_flags": [
            {"label": "Confusion (encéphalopathie)", "checked": None},
            {"label": "Douleur abdominale sévère", "checked": None},
            {"label": "Hémorragie digestive (varices)", "checked": None},
            {"label": "Fièvre avec ictère (angiocholite)", "checked": None},
            {"label": "Ascite", "checked": None},
        ],
        "assessment_template": "Anomalies du bilan hépatique. Envisager hépatite virale, toxicité médicamenteuse ou autres causes hépatiques. Nécessite corrélation clinique et bilan étiologique.",
        "plan_template": {
            "today": [
                "Rechercher ictère, douleur HCD, hépatomégalie",
                "Revoir médicaments et compléments (paracétamol, statines, phytothérapie)",
                "Interroger consommation d'alcool, voyages récents, toxicomanie IV",
            ],
            "orders": [
                "Sérologies hépatites (A, B, C)",
                "Bilan hépatique complet (albumine, TP/INR)",
                "Échographie abdominale",
                "Envisager bilan auto-immun si indiqué",
            ],
            "treatment": [
                "Arrêter médicaments potentiellement hépatotoxiques",
                "Éviter l'alcool",
                "Avis gastro/hépato si sévère",
            ],
            "follow_up": [
                "Contrôle sous 1 semaine avec bilan hépatique",
            ],
            "safety_net": [
                "Consulter immédiatement si jaunissement, confusion ou douleur aggravée",
            ],
        },
        "suggested_orders": [
            {"code": "HEPB", "name": "Sérologie hépatite B (AgHBs, Ac)", "urgency": "routine"},
            {"code": "HEPC", "name": "Sérologie hépatite C", "urgency": "routine"},
            {"code": "HEPA", "name": "Sérologie hépatite A IgM", "urgency": "routine"},
            {"code": "BHC", "name": "Bilan hépatique complet", "urgency": "routine"},
            {"code": "TP", "name": "TP/INR", "urgency": "routine"},
            {"code": "ECHOABD", "name": "Échographie abdominale", "urgency": "routine"},
        ],
    },
    
    "hyperkalemia": {
        "symptoms_prompts": [
            {"name": "Faiblesse musculaire", "details": "Distribution et sévérité"},
            {"name": "Palpitations", "details": "Fréquence et symptômes associés"},
            {"name": "Fatigue", "details": "Sévérité"},
            {"name": "Paresthésies", "details": "Engourdissements/fourmillements"},
        ],
        "red_flags": [
            {"label": "Douleur thoracique ou palpitations", "checked": None},
            {"label": "Faiblesse musculaire sévère", "checked": None},
            {"label": "Anomalies ECG (ondes T pointues, QRS large)", "checked": None},
            {"label": "Difficultés respiratoires", "checked": None},
            {"label": "K > 6,5 mmol/L", "checked": None},
        ],
        "assessment_template": "Hyperkaliémie pouvant provoquer des troubles du rythme. Nécessite ECG et évaluation fonction rénale, médicaments et apports alimentaires.",
        "plan_template": {
            "today": [
                "ECG immédiat",
                "Rechercher faiblesse musculaire, palpitations",
                "Revoir médicaments (IEC/ARA2, diurétiques épargneurs K, AINS)",
            ],
            "orders": [
                "Ionogramme de contrôle (éliminer hémolyse)",
                "ECG si non fait",
            ],
            "treatment": [
                "Suspendre médicaments hyperkaliémiants",
                "Conseils régime pauvre en potassium",
                "Envisager orientation urgences si sévère pour monitoring cardiaque",
            ],
            "follow_up": [
                "Contrôle sous 24-48h avec kaliémie",
            ],
            "safety_net": [
                "Consulter immédiatement si douleur thoracique, palpitations ou faiblesse sévère",
            ],
        },
        "suggested_orders": [
            {"code": "IONO", "name": "Ionogramme sanguin", "urgency": "stat"},
            {"code": "ECG", "name": "ECG 12 dérivations", "urgency": "stat"},
        ],
    },
    
    "hypokalemia": {
        "symptoms_prompts": [
            {"name": "Faiblesse musculaire", "details": "Distribution et sévérité"},
            {"name": "Crampes musculaires", "details": "Localisation et fréquence"},
            {"name": "Palpitations", "details": "Fréquence"},
            {"name": "Fatigue", "details": "Sévérité"},
            {"name": "Constipation", "details": "Si présente"},
        ],
        "red_flags": [
            {"label": "Faiblesse musculaire sévère", "checked": None},
            {"label": "Faiblesse des muscles respiratoires", "checked": None},
            {"label": "Anomalies ECG (ondes U, T aplaties)", "checked": None},
            {"label": "Troubles du rythme cardiaque", "checked": None},
            {"label": "K < 2,5 mmol/L", "checked": None},
        ],
        "assessment_template": "Hypokaliémie pouvant provoquer faiblesse musculaire et troubles du rythme. Évaluer pertes digestives, diurétiques et apports alimentaires.",
        "plan_template": {
            "today": [
                "ECG",
                "Rechercher faiblesse musculaire, crampes, palpitations",
                "Revoir diurétiques, laxatifs, pertes digestives",
            ],
            "orders": [
                "Ionogramme de contrôle",
                "Magnésémie (souvent co-déplétée)",
                "ECG si symptomatique",
            ],
            "treatment": [
                "Supplémentation potassique orale",
                "Augmenter apports alimentaires en potassium",
                "Envisager supplémentation IV si sévère",
            ],
            "follow_up": [
                "Contrôle sous 48h avec kaliémie",
            ],
            "safety_net": [
                "Consulter immédiatement si faiblesse sévère, palpitations ou douleur thoracique",
            ],
        },
        "suggested_orders": [
            {"code": "IONO", "name": "Ionogramme sanguin", "urgency": "stat"},
            {"code": "MG", "name": "Magnésémie", "urgency": "routine"},
            {"code": "ECG", "name": "ECG 12 dérivations", "urgency": "routine"},
        ],
    },
    
    "imaging_mass": {
        "symptoms_prompts": [
            {"name": "Douleur au site", "details": "Caractère, sévérité, irradiation"},
            {"name": "Perte de poids", "details": "Involontaire, quantité et délai"},
            {"name": "Fatigue", "details": "Sévérité et début"},
            {"name": "Sueurs nocturnes", "details": "Fréquence"},
            {"name": "Modification de l'appétit", "details": "Diminution de l'appétit"},
        ],
        "red_flags": [
            {"label": "Croissance rapide de la masse", "checked": None},
            {"label": "Perte de poids involontaire >10%", "checked": None},
            {"label": "Nouveaux symptômes neurologiques", "checked": None},
            {"label": "Fracture pathologique", "checked": None},
            {"label": "Symptômes d'hypercalcémie", "checked": None},
        ],
        "assessment_template": "Lésion de masse identifiée à l'imagerie. Nécessite corrélation clinique, caractérisation complémentaire et éventuelle biopsie selon localisation et caractéristiques.",
        "plan_template": {
            "today": [
                "Revoir les résultats d'imagerie avec le patient",
                "Rechercher symptômes associés",
                "Examen physique ciblé",
            ],
            "orders": [
                "Imagerie complémentaire pour caractérisation (IRM/TDM)",
                "Marqueurs tumoraux selon contexte",
                "Envisager biopsie si indiquée",
            ],
            "treatment": [
                "Avis spécialisé (oncologie, chirurgie selon indication)",
            ],
            "follow_up": [
                "Suivi rapproché sous 1 semaine",
            ],
            "safety_net": [
                "Reconsulter immédiatement si aggravation douleur ou nouveaux symptômes",
            ],
        },
        "suggested_orders": [
            {"code": "IRM", "name": "IRM pour caractérisation", "urgency": "routine"},
            {"code": "AFP", "name": "Alpha-fœtoprotéine", "urgency": "routine"},
            {"code": "ACE", "name": "Antigène carcino-embryonnaire", "urgency": "routine"},
            {"code": "CA199", "name": "CA 19-9", "urgency": "routine"},
        ],
    },
}

# Default template for unknown syndromes
DEFAULT_KNOWLEDGE = {
    "symptoms_prompts": [
        {"name": "Symptôme principal", "details": "Début, sévérité, évolution"},
        {"name": "Symptômes associés", "details": "Plaintes associées"},
        {"name": "Impact fonctionnel", "details": "Effet sur les activités quotidiennes"},
    ],
    "red_flags": [
        {"label": "Symptômes sévères ou en aggravation", "checked": None},
        {"label": "Nouveaux signes préoccupants", "checked": None},
    ],
    "assessment_template": "Anomalies constatées à l'évaluation récente. Nécessite corrélation clinique et bilan complémentaire selon indication.",
    "plan_template": {
        "today": [
            "Évaluer les symptômes actuels",
            "Revoir les antécédents pertinents",
        ],
        "orders": [
            "Bilan de contrôle selon indication",
        ],
        "treatment": [],
        "follow_up": [
            "Contrôle avec les résultats",
        ],
        "safety_net": [
            "Reconsulter si aggravation des symptômes",
        ],
    },
    "suggested_orders": [],
}


# ============================================================================
# LLM ENRICHMENT (Fallback for unknown problems)
# ============================================================================

LLM_ENRICHMENT_PROMPT = """Tu es un assistant d'aide à la décision clinique. Génère du contenu clinique spécifique au problème médical.

**PROBLÈME:** {problem_title}
**ÉLÉMENTS:** {evidence_summary}
**URGENCE:** {urgency}

Génère du contenu clinique en français dans la structure JSON suivante. Sois concis et cliniquement approprié.

RÈGLES IMPORTANTES:
- Ne PAS suggérer de diagnostics spécifiques
- Ne PAS recommander de posologies médicamenteuses précises
- Se concentrer sur l'évaluation des symptômes, les drapeaux rouges à vérifier et le bilan général
- Utiliser un langage prudent et basé sur les preuves
- Limiter l'évaluation à 1-2 phrases

Retourne UNIQUEMENT du JSON valide dans ce format exact:
{{
    "symptoms_prompts": [
        {{"name": "Nom du symptôme", "details": "Ce qu'il faut évaluer concernant ce symptôme"}}
    ],
    "red_flags": [
        {{"label": "Drapeau rouge à vérifier"}}
    ],
    "assessment_template": "Modèle d'évaluation clinique bref de 1-2 phrases",
    "plan_template": {{
        "today": ["Action pour la visite du jour"],
        "orders": ["Examen biologique ou imagerie suggéré"],
        "treatment": ["Considération thérapeutique générale"],
        "follow_up": ["Recommandation de suivi"],
        "safety_net": ["Consignes de sécurité pour le patient"]
    }},
    "suggested_orders": [
        {{"code": "CODE_EXAMEN", "name": "Nom de l'examen", "urgency": "routine"}}
    ]
}}
"""


def _get_llm() -> ChatOpenAI:
    """Get configured LLM instance for enrichment."""
    return ChatOpenAI(
        model=Config.DEFAULT_TEXT_MODEL,
        temperature=0.3,  # Lower temperature for more consistent clinical content
        api_key=Config.OPENAI_API_KEY,
    )


def _format_evidence_for_llm(evidence: List[Dict]) -> str:
    """Format evidence list into a readable string for LLM context."""
    if not evidence:
        return "No specific evidence provided"
    
    evidence_parts = []
    for e in evidence:
        if isinstance(e, dict):
            label = e.get("label", str(e))
            date = e.get("date", "")
            if date:
                evidence_parts.append(f"- {label} ({date})")
            else:
                evidence_parts.append(f"- {label}")
        else:
            evidence_parts.append(f"- {str(e)}")
    
    return "\n".join(evidence_parts) if evidence_parts else "No specific evidence provided"


def _enrich_via_llm(problem_title: str, evidence: List[Dict], urgency: Optional[str] = None) -> Dict:
    """
    Use LLM to generate enrichment content for unknown problems.
    Returns knowledge dict in same format as SYNDROME_KNOWLEDGE entries.
    """
    try:
        llm = _get_llm()
        
        prompt = LLM_ENRICHMENT_PROMPT.format(
            problem_title=problem_title,
            evidence_summary=_format_evidence_for_llm(evidence),
            urgency=urgency or "Routine"
        )
        
        response = llm.invoke(prompt)
        content = response.content.strip()
        
        # Extract JSON from response (handle markdown code blocks)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        # Parse JSON response
        knowledge = json.loads(content)
        
        # Validate and normalize structure
        return {
            "symptoms_prompts": knowledge.get("symptoms_prompts", DEFAULT_KNOWLEDGE["symptoms_prompts"]),
            "red_flags": [{"label": rf.get("label", str(rf)), "checked": None} for rf in knowledge.get("red_flags", [])],
            "assessment_template": knowledge.get("assessment_template", DEFAULT_KNOWLEDGE["assessment_template"]),
            "plan_template": {
                "today": knowledge.get("plan_template", {}).get("today", []),
                "orders": knowledge.get("plan_template", {}).get("orders", []),
                "treatment": knowledge.get("plan_template", {}).get("treatment", []),
                "follow_up": knowledge.get("plan_template", {}).get("follow_up", []),
                "safety_net": knowledge.get("plan_template", {}).get("safety_net", []),
            },
            "suggested_orders": knowledge.get("suggested_orders", []),
        }
        
    except Exception as e:
        logger.warning(f"LLM enrichment failed for '{problem_title}': {e}. Falling back to default template.")
        return DEFAULT_KNOWLEDGE.copy()


# ============================================================================
# ENRICHMENT FUNCTIONS
# Called on-demand by doctor via "Fill" button
# ============================================================================

def get_syndrome_for_problem(problem_title: str) -> str:
    """
    Map problem title to syndrome key for knowledge lookup.
    """
    title_lower = problem_title.lower()
    
    # Direct mappings
    if "anemia" in title_lower:
        return "anemia"
    if "leukocytosis" in title_lower:
        return "leukocytosis"
    if "leukopenia" in title_lower:
        return "leukopenia"
    if any(kw in title_lower for kw in ["kidney", "renal", "creatinine", "aki"]):
        return "renal_dysfunction"
    if any(kw in title_lower for kw in ["glucose", "diabetes", "hyperglycemia", "hypoglycemia"]):
        return "hyperglycemia"
    if any(kw in title_lower for kw in ["liver", "hepatic", "alt", "ast", "bilirubin"]):
        return "liver_dysfunction"
    if "hyperkalemia" in title_lower:
        return "hyperkalemia"
    if "hypokalemia" in title_lower:
        return "hypokalemia"
    if any(kw in title_lower for kw in ["mass", "tumor", "lesion", "hepatoblastoma", "nodule"]):
        return "imaging_mass"
    
    return None  # Unknown syndrome


def enrich_symptoms(problem_id: str, problem_title: str, evidence: List[Dict]) -> List[Dict]:
    """
    Generate problem-specific symptom prompts.
    Returns list of symptoms to explore during visit.
    """
    syndrome = get_syndrome_for_problem(problem_title)
    knowledge = SYNDROME_KNOWLEDGE.get(syndrome, DEFAULT_KNOWLEDGE)
    
    # Return symptoms with unique IDs
    return [
        {
            "id": str(uuid.uuid4()),
            "name": s["name"],
            "details": s["details"],
            "response": None  # Doctor fills during visit
        }
        for s in knowledge["symptoms_prompts"]
    ]


def enrich_red_flags(problem_id: str, problem_title: str, evidence: List[Dict]) -> List[Dict]:
    """
    Generate problem-specific red flag checklist.
    Returns list of red flags to check during visit.
    """
    syndrome = get_syndrome_for_problem(problem_title)
    knowledge = SYNDROME_KNOWLEDGE.get(syndrome, DEFAULT_KNOWLEDGE)
    
    return [
        {
            "id": str(uuid.uuid4()),
            "label": rf["label"],
            "checked": None  # Doctor checks during visit
        }
        for rf in knowledge["red_flags"]
    ]


def enrich_assessment(problem_id: str, problem_title: str, evidence: List[Dict]) -> str:
    """
    Generate problem-specific assessment template.
    Returns brief assessment text (1-2 lines, cautious).
    """
    syndrome = get_syndrome_for_problem(problem_title)
    knowledge = SYNDROME_KNOWLEDGE.get(syndrome, DEFAULT_KNOWLEDGE)
    
    return knowledge["assessment_template"]


def enrich_plan(problem_id: str, problem_title: str, evidence: List[Dict], urgency: Optional[str] = None) -> Dict[str, List[Dict]]:
    """
    Generate problem-specific plan checklist with buckets.
    Returns plan structure with today/orders/treatment/follow_up/safety_net.
    """
    syndrome = get_syndrome_for_problem(problem_title)
    knowledge = SYNDROME_KNOWLEDGE.get(syndrome, DEFAULT_KNOWLEDGE)
    template = knowledge["plan_template"]
    
    # Convert to full structure with IDs
    plan = {}
    for bucket in ["today", "orders", "treatment", "follow_up", "safety_net"]:
        items = template.get(bucket, [])
        plan[bucket] = [
            {
                "id": str(uuid.uuid4()),
                "text": item,
                "checked": False
            }
            for item in items
        ]
    
    return plan


def enrich_orders(problem_id: str, problem_title: str, evidence: List[Dict]) -> List[Dict]:
    """
    Generate problem-specific order suggestions (convertible drafts).
    Returns list of suggested orders with codes and names.
    """
    syndrome = get_syndrome_for_problem(problem_title)
    knowledge = SYNDROME_KNOWLEDGE.get(syndrome, DEFAULT_KNOWLEDGE)
    
    return [
        {
            "id": str(uuid.uuid4()),
            "code": order["code"],
            "name": order["name"],
            "urgency": order["urgency"],
            "selected": False  # Doctor selects which to convert to real orders
        }
        for order in knowledge.get("suggested_orders", [])
    ]


# ============================================================================
# HYBRID ENRICHMENT (Main Entry Points)
# ============================================================================

def _get_knowledge_with_origin(
    problem_title: str, 
    evidence: List[Dict], 
    urgency: Optional[str],
    mode: EnrichmentMode = EnrichmentMode.AUTO
) -> tuple[Dict, EnrichmentOrigin]:
    """
    Get knowledge dict and track origin for a problem.
    
    Args:
        problem_title: Title of the problem
        evidence: Evidence list from the problem
        urgency: Urgency level
        mode: Enrichment mode (kb, llm, auto)
        
    Returns:
        Tuple of (knowledge_dict, origin)
    """
    syndrome = get_syndrome_for_problem(problem_title)
    
    if mode == EnrichmentMode.KB:
        # KB only - use KB if matched, else default template
        if syndrome and syndrome in SYNDROME_KNOWLEDGE:
            return SYNDROME_KNOWLEDGE[syndrome], EnrichmentOrigin.KNOWLEDGE_BASE
        return DEFAULT_KNOWLEDGE, EnrichmentOrigin.DEFAULT_TEMPLATE
    
    elif mode == EnrichmentMode.LLM:
        # LLM only - always use LLM
        knowledge = _enrich_via_llm(problem_title, evidence, urgency)
        return knowledge, EnrichmentOrigin.LLM_GENERATED
    
    else:  # AUTO mode - KB-first, LLM-fallback
        if syndrome and syndrome in SYNDROME_KNOWLEDGE:
            return SYNDROME_KNOWLEDGE[syndrome], EnrichmentOrigin.KNOWLEDGE_BASE
        
        # No KB match - use LLM fallback
        logger.info(f"No KB match for '{problem_title}', using LLM fallback")
        knowledge = _enrich_via_llm(problem_title, evidence, urgency)
        return knowledge, EnrichmentOrigin.LLM_GENERATED


def enrich_problem_full(
    problem: Dict, 
    mode: EnrichmentMode = EnrichmentMode.AUTO
) -> Dict:
    """
    Full enrichment of a problem - fills all empty fields.
    Called when doctor clicks "Fill" button.
    
    Args:
        problem: Problem dict with at least id, title, evidence
        mode: Enrichment mode - "kb" (KB only), "llm" (LLM only), "auto" (KB-first, LLM-fallback)
        
    Returns:
        Enriched problem dict with:
        - symptoms, red_flags, assessment, plan, suggested_orders
        - origin: where content came from ("knowledge_base", "llm_generated", "default_template")
        - requires_review: True if LLM-generated (should be flagged in UI)
    """
    problem_id = problem.get("id", "")
    problem_title = problem.get("title", "")
    evidence = problem.get("evidence", [])
    urgency = problem.get("urgency")
    
    # Get knowledge and track origin
    knowledge, origin = _get_knowledge_with_origin(problem_title, evidence, urgency, mode)
    
    # Build symptoms
    symptoms = [
        {
            "id": str(uuid.uuid4()),
            "name": s.get("name", "Symptom"),
            "details": s.get("details", ""),
            "response": None
        }
        for s in knowledge.get("symptoms_prompts", [])
    ]
    
    # Build red flags
    red_flags = [
        {
            "id": str(uuid.uuid4()),
            "label": rf.get("label", str(rf)),
            "checked": None
        }
        for rf in knowledge.get("red_flags", [])
    ]
    
    # Build plan with IDs
    plan_template = knowledge.get("plan_template", {})
    plan = {}
    for bucket in ["today", "orders", "treatment", "follow_up", "safety_net"]:
        items = plan_template.get(bucket, [])
        plan[bucket] = [
            {
                "id": str(uuid.uuid4()),
                "text": item if isinstance(item, str) else item.get("text", str(item)),
                "checked": False
            }
            for item in items
        ]
    
    # Build suggested orders
    suggested_orders = [
        {
            "id": str(uuid.uuid4()),
            "code": order.get("code", ""),
            "name": order.get("name", ""),
            "urgency": order.get("urgency", "routine"),
            "selected": False
        }
        for order in knowledge.get("suggested_orders", [])
    ]
    
    return {
        "symptoms": symptoms,
        "red_flags": red_flags,
        "assessment": knowledge.get("assessment_template", ""),
        "plan": plan,
        "suggested_orders": suggested_orders,
        "origin": origin.value,
        "requires_review": origin == EnrichmentOrigin.LLM_GENERATED,
    }


def enrich_problem_partial(
    problem: Dict, 
    fields: List[str],
    mode: EnrichmentMode = EnrichmentMode.AUTO
) -> Dict:
    """
    Partial enrichment - fills only requested fields.
    
    Args:
        problem: Problem dict with at least id, title, evidence
        fields: List of field names to enrich (symptoms, red_flags, assessment, plan, suggested_orders)
        mode: Enrichment mode - "kb", "llm", or "auto"
        
    Returns:
        Dict with only the requested enriched fields + origin tracking
    """
    # Get full enrichment then filter to requested fields
    full = enrich_problem_full(problem, mode)
    
    result = {
        "origin": full["origin"],
        "requires_review": full["requires_review"],
    }
    
    for field in fields:
        if field in full:
            result[field] = full[field]
    
    return result


def enrich_hpi(
    syndrome: Optional[str] = None,
    fields: Optional[List[str]] = None,
    mode: EnrichmentMode = EnrichmentMode.AUTO
) -> Dict:
    """
    Enrich HPI section with syndrome-specific content.
    
    Args:
        syndrome: Syndrome name for context
        fields: Fields to enrich (symptoms, red_flags)
        mode: Enrichment mode
        
    Returns:
        Dict with symptoms and/or red_flags for HPI
    """
    fields = fields or ["symptoms", "red_flags"]
    
    # Create a pseudo-problem to use the same enrichment logic
    problem = {
        "id": "hpi",
        "title": syndrome or "General assessment",
        "evidence": [],
        "urgency": None,
    }
    
    return enrich_problem_partial(problem, fields, mode)
