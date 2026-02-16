"""
Knowledge Base API - Manages clinical articles and collections for problem enrichment.
Allows doctors to contribute articles via URL, document upload, or manual entry.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid
import logging
import json
import httpx
from bs4 import BeautifulSoup

from app.auth import get_current_user, require_doctor_or_owner
from medicai.agent.problem_enrichment import SYNDROME_KNOWLEDGE
from medicai.storage.postgres import get_conn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge-base", tags=["knowledge-base"])

# Flag to track if seeding has been done this session
_seeding_done = False


# ============================================================================
# SCHEMAS
# ============================================================================

class SymptomPrompt(BaseModel):
    name: str
    details: str

class RedFlag(BaseModel):
    label: str

class SuggestedOrder(BaseModel):
    code: str
    name: str
    urgency: str = "routine"

class PlanTemplate(BaseModel):
    today: List[str] = []
    orders: List[str] = []
    treatment: List[str] = []
    follow_up: List[str] = []
    safety_net: List[str] = []

class Article(BaseModel):
    id: str
    title: str
    content: str
    collection_id: str
    author: str
    is_default: bool = False
    created_at: str
    updated_at: str
    source_url: Optional[str] = None
    symptoms_prompts: List[SymptomPrompt] = []
    red_flags: List[RedFlag] = []
    assessment_template: Optional[str] = None
    plan_template: Optional[PlanTemplate] = None
    suggested_orders: List[SuggestedOrder] = []

class Collection(BaseModel):
    id: str
    name: str
    description: str
    article_count: int
    is_default: bool = False

class ArticleCreate(BaseModel):
    title: str
    content: Optional[str] = ""
    collection_id: str
    source_url: Optional[str] = None
    symptoms_prompts: List[SymptomPrompt] = []
    red_flags: List[RedFlag] = []
    assessment_template: Optional[str] = None
    plan_template: Optional[PlanTemplate] = None
    suggested_orders: List[SuggestedOrder] = []

class CollectionCreate(BaseModel):
    name: str
    description: str = ""

class ArticleFromUrl(BaseModel):
    url: str
    collection_id: str

class ExtractedContent(BaseModel):
    title: str
    content: str
    symptoms_prompts: List[SymptomPrompt]
    red_flags: List[RedFlag]
    assessment_template: str
    plan_template: PlanTemplate
    suggested_orders: List[SuggestedOrder]


# ============================================================================
# DATABASE OPERATIONS
# ============================================================================

def _syndrome_to_article_dict(key: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert syndrome knowledge to article dict for database insertion"""
    collection_map = {
        "anemia": "hematology",
        "leukocytosis": "hematology", 
        "leukopenia": "hematology",
        "renal_dysfunction": "nephrology",
        "hyperkalemia": "nephrology",
        "hypokalemia": "nephrology",
        "hyperglycemia": "endocrinology",
        "liver_dysfunction": "hepatology",
        "imaging_mass": "oncology",
    }
    
    title_map = {
        "anemia": "Anémie",
        "leukocytosis": "Leucocytose",
        "leukopenia": "Leucopénie",
        "renal_dysfunction": "Dysfonction rénale",
        "hyperkalemia": "Hyperkaliémie",
        "hypokalemia": "Hypokaliémie",
        "hyperglycemia": "Hyperglycémie",
        "liver_dysfunction": "Dysfonction hépatique",
        "imaging_mass": "Masse à l'imagerie",
    }
    
    return {
        "id": key,
        "title": title_map.get(key, key.replace("_", " ").title()),
        "content": data.get("assessment_template", ""),
        "collection_id": collection_map.get(key, "general"),
        "author": "MedicAI",
        "is_default": True,
        "symptoms_prompts": data.get("symptoms_prompts", []),
        "red_flags": data.get("red_flags", []),
        "assessment_template": data.get("assessment_template"),
        "plan_template": data.get("plan_template"),
        "suggested_orders": data.get("suggested_orders", []),
    }


# Default collections data
DEFAULT_COLLECTIONS_DATA = [
    {"id": "hematology", "name": "Hématologie", "description": "Anémies, leucocytose, leucopénie", "is_default": True},
    {"id": "nephrology", "name": "Néphrologie", "description": "Dysfonction rénale, électrolytes", "is_default": True},
    {"id": "endocrinology", "name": "Endocrinologie", "description": "Diabète, troubles métaboliques", "is_default": True},
    {"id": "hepatology", "name": "Hépatologie", "description": "Dysfonction hépatique", "is_default": True},
    {"id": "oncology", "name": "Oncologie", "description": "Masses, lésions tumorales", "is_default": True},
]


def _seed_defaults_if_needed():
    """Seed default collections and articles if tables are empty"""
    global _seeding_done
    if _seeding_done:
        return
    
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Check if collections table is empty
                cur.execute("SELECT COUNT(*) FROM kb_collections")
                count = cur.fetchone()[0]
                
                if count == 0:
                    logger.info("Seeding default knowledge base collections and articles...")
                    
                    # Insert default collections
                    for coll in DEFAULT_COLLECTIONS_DATA:
                        cur.execute(
                            """
                            INSERT INTO kb_collections (id, name, description, is_default)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (id) DO NOTHING
                            """,
                            (coll["id"], coll["name"], coll["description"], coll["is_default"])
                        )
                    
                    # Insert default articles from SYNDROME_KNOWLEDGE
                    for key, data in SYNDROME_KNOWLEDGE.items():
                        article = _syndrome_to_article_dict(key, data)
                        cur.execute(
                            """
                            INSERT INTO kb_articles (id, collection_id, title, content, author, is_default, 
                                                     symptoms_prompts, red_flags, assessment_template, 
                                                     plan_template, suggested_orders)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (id) DO NOTHING
                            """,
                            (
                                article["id"],
                                article["collection_id"],
                                article["title"],
                                article["content"],
                                article["author"],
                                article["is_default"],
                                json.dumps(article["symptoms_prompts"]),
                                json.dumps(article["red_flags"]),
                                article["assessment_template"],
                                json.dumps(article["plan_template"]) if article["plan_template"] else None,
                                json.dumps(article["suggested_orders"]),
                            )
                        )
                    
                    logger.info("Default knowledge base data seeded successfully")
            conn.commit()
        _seeding_done = True
    except Exception as e:
        logger.error(f"Error seeding default data: {e}")
        # Don't fail if seeding fails - tables might not exist yet
        _seeding_done = True


def update_default_articles_content() -> int:
    """Update existing default articles with current SYNDROME_KNOWLEDGE content (for translations/updates)"""
    updated_count = 0
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                for key, data in SYNDROME_KNOWLEDGE.items():
                    article = _syndrome_to_article_dict(key, data)
                    cur.execute(
                        """
                        UPDATE kb_articles 
                        SET title = %s, 
                            content = %s, 
                            symptoms_prompts = %s, 
                            red_flags = %s, 
                            assessment_template = %s, 
                            plan_template = %s, 
                            suggested_orders = %s,
                            updated_at = NOW()
                        WHERE id = %s AND is_default = TRUE
                        """,
                        (
                            article["title"],
                            article["content"],
                            json.dumps(article["symptoms_prompts"]),
                            json.dumps(article["red_flags"]),
                            article["assessment_template"],
                            json.dumps(article["plan_template"]) if article["plan_template"] else None,
                            json.dumps(article["suggested_orders"]),
                            key,
                        )
                    )
                    if cur.rowcount > 0:
                        updated_count += 1
            conn.commit()
        logger.info(f"Updated {updated_count} default articles with current content")
    except Exception as e:
        logger.error(f"Error updating default articles: {e}")
        raise
    return updated_count


def _row_to_collection(row, article_count: int = 0) -> Collection:
    """Convert database row to Collection model"""
    return Collection(
        id=row[0],
        name=row[1],
        description=row[2] or "",
        is_default=row[3],
        article_count=article_count,
    )


def _row_to_article(row) -> Article:
    """Convert database row to Article model"""
    # Row: id, collection_id, title, content, author, is_default, source_url,
    #      symptoms_prompts, red_flags, assessment_template, plan_template, 
    #      suggested_orders, created_at, updated_at
    symptoms_prompts = row[7] or []
    red_flags = row[8] or []
    plan_template = row[10]
    suggested_orders = row[11] or []
    
    return Article(
        id=row[0],
        collection_id=row[1],
        title=row[2],
        content=row[3] or "",
        author=row[4],
        is_default=row[5],
        source_url=row[6],
        symptoms_prompts=[SymptomPrompt(**s) for s in symptoms_prompts],
        red_flags=[RedFlag(**r) for r in red_flags],
        assessment_template=row[9],
        plan_template=PlanTemplate(**plan_template) if plan_template else None,
        suggested_orders=[SuggestedOrder(**o) for o in suggested_orders],
        created_at=row[12].isoformat() + "Z" if row[12] else "",
        updated_at=row[13].isoformat() + "Z" if row[13] else "",
    )


def db_get_all_collections() -> List[Collection]:
    """Get all collections from database with article counts"""
    _seed_defaults_if_needed()
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id, c.name, c.description, c.is_default,
                       COALESCE(COUNT(a.id), 0) as article_count
                FROM kb_collections c
                LEFT JOIN kb_articles a ON a.collection_id = c.id
                GROUP BY c.id, c.name, c.description, c.is_default
                ORDER BY c.is_default DESC, c.name
                """
            )
            rows = cur.fetchall()
    
    return [
        Collection(
            id=row[0],
            name=row[1],
            description=row[2] or "",
            is_default=row[3],
            article_count=row[4],
        )
        for row in rows
    ]


def db_get_collection(collection_id: str) -> Optional[Collection]:
    """Get a single collection by ID"""
    _seed_defaults_if_needed()
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id, c.name, c.description, c.is_default,
                       COALESCE(COUNT(a.id), 0) as article_count
                FROM kb_collections c
                LEFT JOIN kb_articles a ON a.collection_id = c.id
                WHERE c.id = %s
                GROUP BY c.id, c.name, c.description, c.is_default
                """,
                (collection_id,)
            )
            row = cur.fetchone()
    
    if not row:
        return None
    
    return Collection(
        id=row[0],
        name=row[1],
        description=row[2] or "",
        is_default=row[3],
        article_count=row[4],
    )


def db_create_collection(collection_id: str, name: str, description: str, is_default: bool = False) -> Collection:
    """Create a new collection in the database"""
    _seed_defaults_if_needed()
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO kb_collections (id, name, description, is_default)
                VALUES (%s, %s, %s, %s)
                RETURNING id, name, description, is_default
                """,
                (collection_id, name, description, is_default)
            )
            row = cur.fetchone()
        conn.commit()
    
    return Collection(
        id=row[0],
        name=row[1],
        description=row[2] or "",
        is_default=row[3],
        article_count=0,
    )


def db_delete_collection(collection_id: str) -> bool:
    """Delete a collection from the database (articles are cascade deleted)"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM kb_collections WHERE id = %s AND is_default = FALSE RETURNING id",
                (collection_id,)
            )
            result = cur.fetchone()
        conn.commit()
    
    return result is not None


def db_get_all_articles(collection_id: Optional[str] = None) -> List[Article]:
    """Get all articles, optionally filtered by collection"""
    _seed_defaults_if_needed()
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            if collection_id:
                cur.execute(
                    """
                    SELECT id, collection_id, title, content, author, is_default, source_url,
                           symptoms_prompts, red_flags, assessment_template, plan_template,
                           suggested_orders, created_at, updated_at
                    FROM kb_articles
                    WHERE collection_id = %s
                    ORDER BY is_default DESC, created_at DESC
                    """,
                    (collection_id,)
                )
            else:
                cur.execute(
                    """
                    SELECT id, collection_id, title, content, author, is_default, source_url,
                           symptoms_prompts, red_flags, assessment_template, plan_template,
                           suggested_orders, created_at, updated_at
                    FROM kb_articles
                    ORDER BY is_default DESC, created_at DESC
                    """
                )
            rows = cur.fetchall()
    
    return [_row_to_article(row) for row in rows]


def db_get_article(article_id: str) -> Optional[Article]:
    """Get a single article by ID"""
    _seed_defaults_if_needed()
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, collection_id, title, content, author, is_default, source_url,
                       symptoms_prompts, red_flags, assessment_template, plan_template,
                       suggested_orders, created_at, updated_at
                FROM kb_articles
                WHERE id = %s
                """,
                (article_id,)
            )
            row = cur.fetchone()
    
    if not row:
        return None
    
    return _row_to_article(row)


def db_create_article(
    article_id: str,
    title: str,
    content: str,
    collection_id: str,
    author: str,
    is_default: bool = False,
    source_url: Optional[str] = None,
    symptoms_prompts: Optional[List[Dict]] = None,
    red_flags: Optional[List[Dict]] = None,
    assessment_template: Optional[str] = None,
    plan_template: Optional[Dict] = None,
    suggested_orders: Optional[List[Dict]] = None,
) -> Article:
    """Create a new article in the database"""
    _seed_defaults_if_needed()
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO kb_articles (id, collection_id, title, content, author, is_default,
                                         source_url, symptoms_prompts, red_flags, assessment_template,
                                         plan_template, suggested_orders)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, collection_id, title, content, author, is_default, source_url,
                          symptoms_prompts, red_flags, assessment_template, plan_template,
                          suggested_orders, created_at, updated_at
                """,
                (
                    article_id,
                    collection_id,
                    title,
                    content,
                    author,
                    is_default,
                    source_url,
                    json.dumps(symptoms_prompts or []),
                    json.dumps(red_flags or []),
                    assessment_template,
                    json.dumps(plan_template) if plan_template else None,
                    json.dumps(suggested_orders or []),
                )
            )
            row = cur.fetchone()
        conn.commit()
    
    return _row_to_article(row)


def db_update_article(
    article_id: str,
    title: str,
    content: str,
    collection_id: str,
    symptoms_prompts: Optional[List[Dict]] = None,
    red_flags: Optional[List[Dict]] = None,
    assessment_template: Optional[str] = None,
    plan_template: Optional[Dict] = None,
    suggested_orders: Optional[List[Dict]] = None,
) -> Optional[Article]:
    """Update an existing article in the database"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE kb_articles
                SET title = %s, content = %s, collection_id = %s,
                    symptoms_prompts = %s, red_flags = %s, assessment_template = %s,
                    plan_template = %s, suggested_orders = %s
                WHERE id = %s AND is_default = FALSE
                RETURNING id, collection_id, title, content, author, is_default, source_url,
                          symptoms_prompts, red_flags, assessment_template, plan_template,
                          suggested_orders, created_at, updated_at
                """,
                (
                    title,
                    content,
                    collection_id,
                    json.dumps(symptoms_prompts or []),
                    json.dumps(red_flags or []),
                    assessment_template,
                    json.dumps(plan_template) if plan_template else None,
                    json.dumps(suggested_orders or []),
                    article_id,
                )
            )
            row = cur.fetchone()
        conn.commit()
    
    if not row:
        return None
    
    return _row_to_article(row)


def db_delete_article(article_id: str) -> bool:
    """Delete an article from the database (only non-default articles)"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM kb_articles WHERE id = %s AND is_default = FALSE RETURNING id",
                (article_id,)
            )
            result = cur.fetchone()
        conn.commit()
    
    return result is not None


# ============================================================================
# CONTENT EXTRACTION (from URL or document)
# ============================================================================

async def extract_content_from_url(url: str) -> ExtractedContent:
    """Fetch URL and extract clinical content using LLM"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            
        # Parse HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Remove scripts and styles
        for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
            tag.decompose()
            
        # Get text content
        text = soup.get_text(separator='\n', strip=True)
        title = soup.title.string if soup.title else "Article importé"
        
        # Truncate for processing
        text = text[:8000]
        
        # Use LLM to extract clinical content
        from langchain_openai import ChatOpenAI
        from medicai.config import Config
        
        llm = ChatOpenAI(
            model=Config.OPENAI_CHEAP_MODEL,
            temperature=0,
            api_key=Config.OPENAI_API_KEY
        )
        
        prompt = f"""Analyse cet article médical et extrais les informations cliniques structurées.

ARTICLE:
{text}

Réponds UNIQUEMENT en JSON avec ce format exact:
{{
  "title": "Titre de la pathologie",
  "content": "Description courte (1-2 phrases)",
  "symptoms_prompts": [
    {{"name": "Symptôme", "details": "Détails à explorer"}}
  ],
  "red_flags": [
    {{"label": "Signe d'alarme"}}
  ],
  "assessment_template": "Template d'évaluation clinique",
  "plan_template": {{
    "today": ["Action immédiate"],
    "orders": ["Examen à prescrire"],
    "treatment": ["Traitement"],
    "follow_up": ["Suivi"],
    "safety_net": ["Consigne de sécurité"]
  }},
  "suggested_orders": [
    {{"code": "CODE", "name": "Nom examen", "urgency": "routine"}}
  ]
}}"""
        
        result = await llm.ainvoke(prompt)
        
        import json
        # Extract JSON from response
        content = result.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
            
        data = json.loads(content.strip())
        
        return ExtractedContent(
            title=data.get("title", title),
            content=data.get("content", ""),
            symptoms_prompts=[SymptomPrompt(**s) for s in data.get("symptoms_prompts", [])],
            red_flags=[RedFlag(**r) for r in data.get("red_flags", [])],
            assessment_template=data.get("assessment_template", ""),
            plan_template=PlanTemplate(**data.get("plan_template", {})),
            suggested_orders=[SuggestedOrder(**o) for o in data.get("suggested_orders", [])],
        )
        
    except Exception as e:
        logger.error(f"Error extracting content from URL: {e}")
        raise HTTPException(status_code=400, detail=f"Impossible d'extraire le contenu: {str(e)}")


async def extract_content_from_document(file: UploadFile) -> ExtractedContent:
    """Extract clinical content from uploaded document"""
    try:
        content = await file.read()
        
        # Handle different file types
        if file.filename.endswith('.pdf'):
            import io
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(content))
                text = "\n".join(page.extract_text() for page in reader.pages)
            except ImportError:
                raise HTTPException(status_code=400, detail="PDF support requires pypdf package")
        elif file.filename.endswith(('.txt', '.md')):
            text = content.decode('utf-8')
        elif file.filename.endswith(('.doc', '.docx')):
            raise HTTPException(status_code=400, detail="Word documents not yet supported")
        else:
            raise HTTPException(status_code=400, detail="Format non supporté. Utilisez PDF, TXT ou MD.")
        
        # Truncate for processing
        text = text[:8000]
        title = file.filename.rsplit('.', 1)[0]
        
        # Use LLM to extract clinical content (same as URL extraction)
        from langchain_openai import ChatOpenAI
        from medicai.config import Config
        
        llm = ChatOpenAI(
            model=Config.OPENAI_CHEAP_MODEL,
            temperature=0,
            api_key=Config.OPENAI_API_KEY
        )
        
        prompt = f"""Analyse ce document médical et extrais les informations cliniques structurées.

DOCUMENT:
{text}

Réponds UNIQUEMENT en JSON avec ce format exact:
{{
  "title": "Titre de la pathologie",
  "content": "Description courte (1-2 phrases)",
  "symptoms_prompts": [
    {{"name": "Symptôme", "details": "Détails à explorer"}}
  ],
  "red_flags": [
    {{"label": "Signe d'alarme"}}
  ],
  "assessment_template": "Template d'évaluation clinique",
  "plan_template": {{
    "today": ["Action immédiate"],
    "orders": ["Examen à prescrire"],
    "treatment": ["Traitement"],
    "follow_up": ["Suivi"],
    "safety_net": ["Consigne de sécurité"]
  }},
  "suggested_orders": [
    {{"code": "CODE", "name": "Nom examen", "urgency": "routine"}}
  ]
}}"""
        
        result = await llm.ainvoke(prompt)
        
        import json
        content_text = result.content
        if "```json" in content_text:
            content_text = content_text.split("```json")[1].split("```")[0]
        elif "```" in content_text:
            content_text = content_text.split("```")[1].split("```")[0]
            
        data = json.loads(content_text.strip())
        
        return ExtractedContent(
            title=data.get("title", title),
            content=data.get("content", ""),
            symptoms_prompts=[SymptomPrompt(**s) for s in data.get("symptoms_prompts", [])],
            red_flags=[RedFlag(**r) for r in data.get("red_flags", [])],
            assessment_template=data.get("assessment_template", ""),
            plan_template=PlanTemplate(**data.get("plan_template", {})),
            suggested_orders=[SuggestedOrder(**o) for o in data.get("suggested_orders", [])],
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting content from document: {e}")
        raise HTTPException(status_code=400, detail=f"Impossible d'extraire le contenu: {str(e)}")


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.get("/collections", response_model=List[Collection])
async def get_collections(user=Depends(get_current_user)):
    """Get all collections"""
    return db_get_all_collections()


@router.post("/collections", response_model=Collection)
async def create_collection(data: CollectionCreate, user=Depends(require_doctor_or_owner)):
    """Create a new collection"""
    collection_id = f"custom_{uuid.uuid4().hex[:8]}"
    return db_create_collection(
        collection_id=collection_id,
        name=data.name,
        description=data.description,
        is_default=False,
    )


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str, user=Depends(get_current_user)):
    """Delete a collection (if not default)"""
    collection = db_get_collection(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection non trouvée")
    if collection.is_default:
        raise HTTPException(status_code=400, detail="Impossible de supprimer une collection par défaut")
    
    db_delete_collection(collection_id)
    return {"message": "Collection supprimée"}


@router.get("/articles", response_model=List[Article])
async def get_articles(collection_id: Optional[str] = None, user=Depends(get_current_user)):
    """Get all articles, optionally filtered by collection"""
    return db_get_all_articles(collection_id)


@router.get("/articles/{article_id}", response_model=Article)
async def get_article(article_id: str, user=Depends(get_current_user)):
    """Get a specific article"""
    article = db_get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    return article


@router.post("/articles", response_model=Article)
async def create_article(data: ArticleCreate, user=Depends(get_current_user)):
    """Create a new article manually"""
    collection = db_get_collection(data.collection_id)
    if not collection:
        raise HTTPException(status_code=400, detail="Collection invalide")
    
    author = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Vous"
    
    return db_create_article(
        article_id=f"article_{uuid.uuid4().hex[:8]}",
        title=data.title,
        content=data.content or "",
        collection_id=data.collection_id,
        author=author,
        is_default=False,
        source_url=data.source_url,
        symptoms_prompts=[s.model_dump() for s in data.symptoms_prompts],
        red_flags=[r.model_dump() for r in data.red_flags],
        assessment_template=data.assessment_template,
        plan_template=data.plan_template.model_dump() if data.plan_template else None,
        suggested_orders=[o.model_dump() for o in data.suggested_orders],
    )


@router.post("/articles/from-url", response_model=Article)
async def create_article_from_url(data: ArticleFromUrl, user=Depends(get_current_user)):
    """Create article by extracting content from URL"""
    collection = db_get_collection(data.collection_id)
    if not collection:
        raise HTTPException(status_code=400, detail="Collection invalide")
    
    # Extract content
    extracted = await extract_content_from_url(data.url)
    
    author = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Vous"
    
    return db_create_article(
        article_id=f"article_{uuid.uuid4().hex[:8]}",
        title=extracted.title,
        content=extracted.content,
        collection_id=data.collection_id,
        author=author,
        is_default=False,
        source_url=data.url,
        symptoms_prompts=[s.model_dump() for s in extracted.symptoms_prompts],
        red_flags=[r.model_dump() for r in extracted.red_flags],
        assessment_template=extracted.assessment_template,
        plan_template=extracted.plan_template.model_dump() if extracted.plan_template else None,
        suggested_orders=[o.model_dump() for o in extracted.suggested_orders],
    )


@router.post("/articles/from-document", response_model=Article)
async def create_article_from_document(
    file: UploadFile = File(...),
    collection_id: str = Form(...),
    user=Depends(get_current_user)
):
    """Create article by extracting content from uploaded document"""
    collection = db_get_collection(collection_id)
    if not collection:
        raise HTTPException(status_code=400, detail="Collection invalide")
    
    # Extract content
    extracted = await extract_content_from_document(file)
    
    author = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Vous"
    
    return db_create_article(
        article_id=f"article_{uuid.uuid4().hex[:8]}",
        title=extracted.title,
        content=extracted.content,
        collection_id=collection_id,
        author=author,
        is_default=False,
        symptoms_prompts=[s.model_dump() for s in extracted.symptoms_prompts],
        red_flags=[r.model_dump() for r in extracted.red_flags],
        assessment_template=extracted.assessment_template,
        plan_template=extracted.plan_template.model_dump() if extracted.plan_template else None,
        suggested_orders=[o.model_dump() for o in extracted.suggested_orders],
    )


@router.put("/articles/{article_id}", response_model=Article)
async def update_article(article_id: str, data: ArticleCreate, user=Depends(get_current_user)):
    """Update an existing article"""
    article = db_get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    if article.is_default:
        raise HTTPException(status_code=400, detail="Impossible de modifier un article par défaut")
    
    updated = db_update_article(
        article_id=article_id,
        title=data.title,
        content=data.content or "",
        collection_id=data.collection_id,
        symptoms_prompts=[s.model_dump() for s in data.symptoms_prompts],
        red_flags=[r.model_dump() for r in data.red_flags],
        assessment_template=data.assessment_template,
        plan_template=data.plan_template.model_dump() if data.plan_template else None,
        suggested_orders=[o.model_dump() for o in data.suggested_orders],
    )
    
    if not updated:
        raise HTTPException(status_code=400, detail="Impossible de modifier cet article")
    
    return updated


@router.delete("/articles/{article_id}")
async def delete_article(article_id: str, user=Depends(get_current_user)):
    """Delete an article (if not default)"""
    article = db_get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    if article.is_default:
        raise HTTPException(status_code=400, detail="Impossible de supprimer un article par défaut")
    
    db_delete_article(article_id)
    return {"message": "Article supprimé"}


@router.post("/extract-url")
async def extract_from_url(data: ArticleFromUrl, user=Depends(get_current_user)):
    """Preview extracted content from URL without creating article"""
    extracted = await extract_content_from_url(data.url)
    return extracted


@router.post("/extract-document")
async def extract_from_document(
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    """Preview extracted content from document without creating article"""
    extracted = await extract_content_from_document(file)
    return extracted


@router.post("/admin/refresh-defaults")
async def refresh_default_articles():
    """Admin: Update all default articles with current SYNDROME_KNOWLEDGE content (for translations)"""
    try:
        updated_count = update_default_articles_content()
        return {
            "message": f"Mise à jour de {updated_count} article(s) par défaut avec le contenu français",
            "updated_count": updated_count
        }
    except Exception as e:
        logger.error(f"Error refreshing default articles: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour des articles")