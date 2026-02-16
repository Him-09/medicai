"""
radiology_extract.py

Extract structured radiology report data using GPT-4o vision or text.

Usage:
    from medicai.ingestion.radiology_extract import extract_radiology_from_text, extract_radiology_from_image
"""

import base64
import json
from typing import Dict, Any

from medicai.config import config

client = config.get_openai_client()


def extract_radiology_from_text(text: str, model: str = None) -> Dict[str, Any]:
    """Extract structured radiology report from text using GPT-4o."""
    if model is None:
        model = config.DEFAULT_TEXT_MODEL
    
    system_msg = (
        "You are a medical scribe assistant specialized in radiology reports. "
        "Extract structured information from radiology reports (compte-rendu radiologique). "
        "Do NOT provide medical interpretation or advice. "
        "Only extract what is explicitly written in the report."
    )
    
    user_msg = f"""
Analyse ce compte-rendu radiologique et extrait les informations dans ce format JSON:

{{
  "date_of_service": "date de l'examen (format YYYY-MM-DD) ou null",
  "type_examen": "type d'examen (ex: Scanner thoracique, IRM cérébrale, Échographie abdominale, etc.)",
  "contexte_clinique": "le contexte clinique mentionné dans le rapport",
  "technique_examen": "la technique d'examen utilisée (protocole, produit de contraste, etc.)",
  "resultats": "les résultats/constatations détaillés de l'examen",
  "conclusion": "la conclusion ou l'impression diagnostique"
}}

Règles importantes:
- N'extrait QUE les informations présentes dans le texte
- Si une section est absente, mets null
- Conserve le texte original tel quel (français médical)
- Ne résume pas, copie le contenu complet de chaque section
- Si le rapport utilise d'autres noms de sections (ex: "Indication", "Interprétation"), adapte-toi

Texte du rapport:

--------------------
{text}
--------------------

Renvoie UNIQUEMENT un JSON valide, sans autre texte.
"""
    
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


def extract_radiology_from_image(image_path: str, model: str = None) -> Dict[str, Any]:
    """Extract structured radiology report from image using GPT-4o vision."""
    if model is None:
        model = config.DEFAULT_VISION_MODEL
    
    with open(image_path, "rb") as f:
        img_bytes = f.read()
    
    b64_image = base64.b64encode(img_bytes).decode('utf-8')
    
    system_msg = (
        "You are a medical scribe assistant specialized in radiology reports. "
        "Extract structured information from radiology reports (compte-rendu radiologique). "
        "Do NOT provide medical interpretation or advice. "
        "Only extract what is explicitly visible in the report."
    )
    
    user_msg = """
Lis attentivement ce compte-rendu radiologique sur l'image et extrait les informations dans ce format JSON:

{
  "date_of_service": "date de l'examen (format YYYY-MM-DD) ou null",
  "type_examen": "type d'examen (ex: Scanner thoracique, IRM cérébrale, Échographie abdominale, etc.)",
  "contexte_clinique": "le contexte clinique mentionné dans le rapport",
  "technique_examen": "la technique d'examen utilisée (protocole, produit de contraste, etc.)",
  "resultats": "les résultats/constatations détaillés de l'examen",
  "conclusion": "la conclusion ou l'impression diagnostique"
}

Règles importantes:
- N'extrait QUE les informations visibles sur l'image
- Si une section est absente, mets null
- Conserve le texte original tel quel (français médical)
- Ne résume pas, copie le contenu complet de chaque section
- Si le rapport utilise d'autres noms de sections (ex: "Indication", "Interprétation"), adapte-toi
- Lis tout le texte visible, même s'il est petit ou de faible qualité

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
                    {"type": "text", "text": user_msg},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{b64_image}",
                            "detail": "high"
                        }
                    },
                ],
            },
        ],
    )
    
    content = resp.choices[0].message.content
    return json.loads(content)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python radiology_extract.py path/to/radiology_report.pdf|image.jpeg [model]")
        sys.exit(1)
    
    file_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) >= 3 else "gpt-5.1"
    
    # Determine if image or need text extraction
    if file_path.lower().endswith(('.jpg', '.jpeg', '.png', '.tif', '.tiff')):
        data = extract_radiology_from_image(file_path, model=model)
    else:
        # For PDF, would need pdfplumber (not implemented here for simplicity)
        print("For PDF files, use router_pipeline.py instead")
        sys.exit(1)
    
    print(json.dumps(data, indent=2, ensure_ascii=False))
