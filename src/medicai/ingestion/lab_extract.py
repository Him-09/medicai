"""
lab_extract.py

Unified lab extraction module combining text and vision processing.

Usage:
    from medicai.ingestion.lab_extract import extract_labs_from_text, extract_labs_from_image_file
"""
import json
import base64
from typing import Dict, Any

from medicai.config import config

client = config.get_openai_client()


# ========== TEXT EXTRACTION ==========

def extract_labs_from_text(raw_text: str, model: str = None) -> dict:
    """
    Use GPT model on lab report text to extract structured lab results.

    Returns a dict like:
    {
      "panel_name": "...",
      "tests": [
        {
          "name": "CRP",
          "value": 2.1,
          "unit": "mg/L",
          "ref_low": null,
          "ref_high": 5.0,
          "flag": "high" | "normal" | "low" | "unknown",
          "source_text": "CRP 2,1 mg/l (<5,0)"
        },
        ...
      ]
    }
    """

    system_msg = (
        "You are a medical scribe assistant. "
        "You are given the full text of a laboratory report (often in French). "
        "Your ONLY job is to extract numeric lab test results and reference ranges "
        "and output them as strict JSON. You MUST NOT give any clinical interpretation "
        "or advice. You MUST NOT invent reference ranges that are not clearly present "
        "in the text."
    )

    user_msg = f"""
Voici le texte complet d'un compte-rendu de laboratoire (biochimie sanguine).

Extrait UNIQUEMENT les résultats d'analyses biologiques dans ce format JSON:

{{
  "date_of_service": "date du prélèvement ou de l'analyse (format YYYY-MM-DD) ou null",
  "panel_name": "nom général du panel si présent (ex: BIOCHIMIE SANGUINE) ou null",
  "tests": [
    {{
      "name": "nom du paramètre (ex: CRP, Ferritine, Sodium)",
      "value":  nombre ou null,
      "unit":   "unité telle qu'écrite (ex: mg/L, mmol/L, µmol/L)",
      "ref_low":  nombre ou null,
      "ref_high": nombre ou null,
      "flag": "low" | "normal" | "high" | "unknown",
      "source_text": "la ligne ou le segment exact recopié du rapport"
    }}
  ]
}}

Règles TRÈS IMPORTANTES:
- N'utilise QUE les chiffres et intervalles de référence VISIBLES dans ce texte.
  NE JAMAIS inventer ou déduire des valeurs de référence à partir de tes connaissances médicales.
- Si AUCUNE valeur de référence n'est visible pour un test, mets:
    "ref_low": null,
    "ref_high": null,
    "flag": "unknown"
- Si un intervalle de référence est écrit comme (135 - 145), utilise:
    ref_low = 135, ref_high = 145.
- Si la référence est de type (<5,0), mets:
    ref_low = null, ref_high = 5.0.
- Utilise le point comme virgule décimale (2.1, pas 2,1).
- Décide le flag UNIQUEMENT à partir des valeurs de référence visibles:
    * value < ref_low  => flag = "low"
    * value > ref_high => flag = "high"
    * si ref_low/ref_high présents et value dans l'intervalle => flag = "normal"
    * si ref_low ou ref_high manquent => flag = "unknown"
- Si tu n'es pas sûr de la valeur ou de l'unité, mets value=null ou unit=null et flag='unknown'.
- "source_text" doit être une copie courte et fidèle du morceau du texte utilisé pour ce test.

Texte du compte rendu :

--------------------
{raw_text}
--------------------

Renvoie UNIQUEMENT un JSON valide, sans autre texte.
"""

    if model is None:
        model = config.DEFAULT_TEXT_MODEL

    resp = client.chat.completions.create(
        model=model,  # Use configured model
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


def extract_labs_from_image_bytes(img_bytes: bytes, model: str = None) -> Dict[str, Any]:
    """
    Send lab report image bytes to GPT-4o with vision.
    """
    if model is None:
        model = config.DEFAULT_VISION_MODEL

    data_url = _bytes_to_data_url(img_bytes, mime_type="image/jpeg")

    system_msg = (
        "You are a medical scribe assistant. "
        "You are given a photo or scan of a laboratory report (often in French). "
        "Your ONLY job is to read the lab table(s) and extract numeric results "
        "and reference ranges, and output them as strict JSON. "
        "You MUST NOT give any medical interpretation or advice. "
        "You MUST NOT invent or guess any reference ranges or values that are not "
        "explicitly visible on the report."
    )

    user_instruction = """
Lis attentivement le compte-rendu de laboratoire (biochimie sanguine) sur l'image.

Extrait UNIQUEMENT les résultats d'analyses biologiques dans ce format JSON:

{
  "date_of_service": "date du prélèvement ou de l'analyse (format YYYY-MM-DD) ou null",
  "panel_name": "nom général du panel si présent (ex: BIOCHIMIE SANGUINE) ou null",
  "tests": [
    {
      "name": "nom du paramètre (ex: CRP, Ferritine, Sodium)",
      "value":  nombre ou null,
      "unit":   "unité telle qu'écrite (ex: mg/L, mmol/L, µmol/L)",
      "ref_low":  nombre ou null,
      "ref_high": nombre ou null,
      "flag": "low" | "normal" | "high" | "unknown",
      "source_text": "la ligne ou le segment exact recopié du compte rendu"
    }
  ]
}

Règles TRÈS IMPORTANTES:
- N'utilise QUE les chiffres et intervalles de référence VISIBLES sur le compte rendu.
  NE JAMAIS inventer ou déduire des valeurs de référence à partir de tes connaissances médicales.
- Si AUCUNE valeur de référence n'est visible pour un test, mets:
    "ref_low": null,
    "ref_high": null,
    "flag": "unknown"
- Si un intervalle de référence est écrit comme (135 - 145), utilise:
    ref_low = 135, ref_high = 145.
- Si la référence est de type (<5,0), mets:
    ref_low = null, ref_high = 5.0.
- Utilise le point comme virgule décimale (2.1, pas 2,1).
- Décide le flag UNIQUEMENT à partir des valeurs de référence visibles:
    * value < ref_low  => flag = "low"
    * value > ref_high => flag = "high"
    * si ref_low/ref_high présents et value dans l'intervalle => flag = "normal"
    * si ref_low ou ref_high manquent => flag = "unknown"
- Si tu n'es pas sûr de la valeur ou de l'unité, mets value=null ou unit=null et flag='unknown'.
- "source_text" doit être une copie courte et fidèle du morceau du compte rendu utilisé pour ce test
  (par exemple: "CRP 2,1 mg/l (<5,0)").

Renvoie UNIQUEMENT un JSON valide, sans autre texte.
"""

    resp = client.chat.completions.create(
        model=model,  # "gpt-5.1" - latest and best
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


def extract_labs_from_image_file(path: str, model: str = None) -> Dict[str, Any]:
    """Extract labs from image file."""
    if model is None:
        model = config.DEFAULT_VISION_MODEL
    img_bytes = _image_file_to_bytes(path)
    return extract_labs_from_image_bytes(img_bytes, model=model)


# ========== CLI ==========

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python lab_extract.py path/to/lab_file.txt|lab_image.jpeg [model]")
        print("\nExamples:")
        print("  python lab_extract.py data/patient1/lab_text.txt")
        print("  python lab_extract.py data/patient1/lab_bio.jpeg")
        raise SystemExit

    file_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) >= 3 else "gpt-5.1"

    # Determine if text file or image
    if file_path.lower().endswith(('.jpg', '.jpeg', '.png', '.tif', '.tiff')):
        print(f"[LAB EXTRACT] Processing image: {file_path}")
        data = extract_labs_from_image_file(file_path, model=model)
    else:
        print(f"[LAB EXTRACT] Processing text file: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        data = extract_labs_from_text(text, model=model)

    print(json.dumps(data, indent=2, ensure_ascii=False))
