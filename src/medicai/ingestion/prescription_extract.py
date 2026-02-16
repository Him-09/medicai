"""
prescription_extract.py

Unified prescription extraction module combining text and vision processing.

Usage:
    from medicai.ingestion.prescription_extract import extract_prescription_from_text, extract_prescription_from_image_file
"""
import json
import base64
from typing import Dict, Any

from medicai.config import config

client = config.get_openai_client()


# ========== TEXT EXTRACTION ==========

def extract_prescription_from_text(raw_text: str, model: str = None) -> dict:
    """
    Use GPT model on prescription text to extract structured medication data.

    Returns a dict like:
    {
      "date_of_service": "YYYY-MM-DD" or null,
      "patient_full_name": string or null,
      "prescriber_full_name": string or null,
      "prescriber_specialty": string or null,
      "items": [
        {
          "drug_name": string or null,
          "strength_or_concentration": string or null,
          "form": string or null,
          "route": string or null,
          "dose": string or null,
          "frequency": string or null,
          "duration": string or null,
          "quantity": string or null,
          "instructions": string or null,
          "as_written": string or null,
          "confidence": "low"|"medium"|"high"
        }
      ],
      "additional_notes": string or null,
      "warnings": [string, ...]
    }
    """

    system_msg = (
        "You are a medical scribe assistant specialized in prescription processing. "
        "You are given the full text of a prescription (ordonnance) often in French or Arabic. "
        "Your ONLY job is to extract medication information and output them as strict JSON. "
        "You MUST NOT give any clinical interpretation or advice. "
        "You MUST NOT invent or modify any information that is not clearly present in the text."
    )

    user_msg = f"""
Voici le texte complet d'une ordonnance médicale (prescription).

Extrait UNIQUEMENT les informations de prescription dans ce format JSON:

{{
  "date_of_service": "date de l'ordonnance (format YYYY-MM-DD) ou null",
  "patient_full_name": "nom complet du patient si mentionné ou null",
  "prescriber_full_name": "nom complet du prescripteur/médecin ou null",
  "prescriber_specialty": "spécialité du prescripteur si mentionnée ou null",
  "items": [
    {{
      "drug_name": "nom du médicament",
      "strength_or_concentration": "dosage ou concentration (ex: 500mg, 5%, 2g/100ml)",
      "form": "forme pharmaceutique (ex: comprimé, gélule, sirop, injection, pommade)",
      "route": "voie d'administration (ex: orale, injectable, topique)",
      "dose": "dose par prise (ex: 1 cp, 5ml, 1 ampoule)",
      "frequency": "fréquence (ex: 3x/jour, 2 fois par jour, matin et soir, 1x/j)",
      "duration": "durée du traitement (ex: pendant 7 jours, 14 jours, 1 mois)",
      "quantity": "quantité totale prescrite (ex: 1 boîte, 2 boîtes, 30 comprimés)",
      "instructions": "instructions spécifiques (ex: avant repas, avec eau, si besoin)",
      "as_written": "ligne complète du médicament tel qu'écrit dans l'ordonnance",
      "confidence": "low" | "medium" | "high"
    }}
  ],
  "additional_notes": "notes additionnelles ou commentaires du prescripteur ou null",
  "warnings": ["liste de warnings ou précautions spéciales"]
}}

Règles TRÈS IMPORTANTES pour le contexte marocain (français/arabe):

ABRÉVIATIONS COURANTES:
- Formes: cp/cpr (comprimé), gél (gélule), amp (ampoule), sirop, inj (injection), supp (suppositoire)
- Fréquence: 1x/j, 2x/j, 3x/j (fois par jour), matin/midi/soir, prn/si besoin, au coucher
- Durée: "pendant X jours", "X jours", "1 mois", "jusqu'à amélioration"
- Quantité: "boîte", "tube", "flacon"

PARSING GUIDELINES:
- Si plusieurs médicaments sur une même ligne, DIVISE-LES en items séparés
- Si les informations sont incertaines ou ambiguës, mets-les dans "as_written" et définis confidence="low"
- Si les informations structurées sont claires, définis confidence="high"
- Si partiellement clair, définis confidence="medium"
- "as_written" doit toujours contenir la ligne complète originale du médicament
- Accepte le texte français, arabe romanisé, et les abréviations mixtes

EXEMPLES DE PARSING:
1. "Paracétamol 500mg cp, 1cp 3x/j pendant 5 jours"
   → drug_name="Paracétamol", strength_or_concentration="500mg", form="comprimé", 
     dose="1 comprimé", frequency="3 fois par jour", duration="5 jours", confidence="high"

2. "Amoxicilline 1g - 2 boîtes"
   → drug_name="Amoxicilline", strength_or_concentration="1g", quantity="2 boîtes", confidence="medium"

3. "Med unclear 250 X2/j"
   → drug_name="Med unclear", strength_or_concentration="250", frequency="2 fois par jour", confidence="low"

Texte de l'ordonnance:

--------------------
{raw_text}
--------------------

Renvoie UNIQUEMENT un JSON valide, sans autre texte.
"""

    if model is None:
        model = config.DEFAULT_TEXT_MODEL

    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
    )

    content = resp.choices[0].message.content
    return json.loads(content)


# ========== IMAGE/VISION EXTRACTION ==========

def _image_file_to_bytes(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def _bytes_to_data_url(img_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"


def extract_prescription_from_image_bytes(img_bytes: bytes, model: str = None) -> Dict[str, Any]:
    """
    Send prescription image bytes to GPT-4o with vision.
    """
    if model is None:
        model = config.DEFAULT_VISION_MODEL

    data_url = _bytes_to_data_url(img_bytes, mime_type="image/jpeg")

    system_msg = (
        "You are a medical scribe assistant specialized in prescription processing. "
        "You are given a photo or scan of a prescription (ordonnance) often in French or Arabic. "
        "Your ONLY job is to read the prescription and extract medication information, "
        "and output them as strict JSON. "
        "You MUST NOT give any medical interpretation or advice. "
        "You MUST NOT invent or guess any information that is not explicitly visible on the prescription."
    )

    user_instruction = """
Lis attentivement l'ordonnance médicale (prescription) sur l'image.

Extrait UNIQUEMENT les informations de prescription dans ce format JSON:

{
  "date_of_service": "date de l'ordonnance (format YYYY-MM-DD) ou null",
  "patient_full_name": "nom complet du patient si mentionné ou null",
  "prescriber_full_name": "nom complet du prescripteur/médecin ou null",
  "prescriber_specialty": "spécialité du prescripteur si mentionnée ou null",
  "items": [
    {
      "drug_name": "nom du médicament",
      "strength_or_concentration": "dosage ou concentration (ex: 500mg, 5%, 2g/100ml)",
      "form": "forme pharmaceutique (ex: comprimé, gélule, sirop, injection, pommade)",
      "route": "voie d'administration (ex: orale, injectable, topique)",
      "dose": "dose par prise (ex: 1 cp, 5ml, 1 ampoule)",
      "frequency": "fréquence (ex: 3x/jour, 2 fois par jour, matin et soir, 1x/j)",
      "duration": "durée du traitement (ex: pendant 7 jours, 14 jours, 1 mois)",
      "quantity": "quantité totale prescrite (ex: 1 boîte, 2 boîtes, 30 comprimés)",
      "instructions": "instructions spécifiques (ex: avant repas, avec eau, si besoin)",
      "as_written": "ligne complète du médicament tel qu'écrit dans l'ordonnance",
      "confidence": "low" | "medium" | "high"
    }
  ],
  "additional_notes": "notes additionnelles ou commentaires du prescripteur ou null",
  "warnings": ["liste de warnings ou précautions spéciales"]
}

Règles TRÈS IMPORTANTES pour le contexte marocain (français/arabe):

ABRÉVIATIONS COURANTES:
- Formes: cp/cpr (comprimé), gél (gélule), amp (ampoule), sirop, inj (injection), supp (suppositoire)
- Fréquence: 1x/j, 2x/j, 3x/j (fois par jour), matin/midi/soir, prn/si besoin, au coucher
- Durée: "pendant X jours", "X jours", "1 mois", "jusqu'à amélioration"
- Quantité: "boîte", "tube", "flacon"

PARSING GUIDELINES:
- Si plusieurs médicaments sur une même ligne, DIVISE-LES en items séparés
- Si les informations sont incertaines ou ambiguës, mets-les dans "as_written" et définis confidence="low"
- Si les informations structurées sont claires, définis confidence="high"
- Si partiellement clair, définis confidence="medium"
- "as_written" doit toujours contenir la ligne complète originale du médicament telle que visible sur l'image
- Accepte le texte français, arabe romanisé, et les abréviations mixtes
- Si l'écriture manuscrite est difficile à lire, définis confidence="low" et mets ce que tu peux lire dans "as_written"

Renvoie UNIQUEMENT un JSON valide, sans autre texte.
"""

    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_msg},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_instruction},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": data_url,
                            "detail": "high",
                        },
                    },
                ],
            },
        ],
    )

    content = resp.choices[0].message.content
    return json.loads(content)


def extract_prescription_from_image_file(path: str, model: str = None) -> Dict[str, Any]:
    """Extract prescription from image file."""
    if model is None:
        model = config.DEFAULT_VISION_MODEL
    img_bytes = _image_file_to_bytes(path)
    return extract_prescription_from_image_bytes(img_bytes, model=model)


# ========== CLI ==========

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python prescription_extract.py path/to/prescription.txt|prescription.jpeg [model]")
        print("\nExamples:")
        print("  python prescription_extract.py data/patient1/prescription.txt")
        print("  python prescription_extract.py data/patient1/ordonnance.jpeg")
        raise SystemExit

    file_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) >= 3 else None

    # Determine if text file or image
    if file_path.lower().endswith(('.jpg', '.jpeg', '.png', '.tif', '.tiff')):
        print(f"[PRESCRIPTION EXTRACT] Processing image: {file_path}")
        data = extract_prescription_from_image_file(file_path, model=model)
    else:
        print(f"[PRESCRIPTION EXTRACT] Processing text file: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        data = extract_prescription_from_text(text, model=model)

    print(json.dumps(data, indent=2, ensure_ascii=False))
