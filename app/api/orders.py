"""
Orders API - Structured Order Intents + Documents + Action Engine

This module implements the "Order Intent → Renderer → Action Engine" architecture:
1. Order Intents: Structured data (rx_intent, referral_intent, followup_intent)
2. Generated Documents: Artifacts derived from intents (prescription PDF, referral letter)
3. Action Jobs: Review-gated actions (send via WhatsApp, create follow-up consultation)
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Literal
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import psycopg
from psycopg.rows import dict_row

from app.auth import get_current_user, require_doctor_or_owner

router = APIRouter(prefix="/api/orders", tags=["orders"])

# =============================================================================
# PYDANTIC MODELS
# =============================================================================

# Intent Types
class MedicationItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    dosage: Optional[str] = None
    form: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    quantity: Optional[int] = None
    instructions: Optional[str] = None

class RxIntentData(BaseModel):
    medications: List[MedicationItem] = []
    destination_channels: List[str] = ["print"]
    renewable: bool = False
    validity_days: int = 30
    general_instructions: Optional[str] = None

class ReferralIntentData(BaseModel):
    to_specialty: str
    to_provider_name: Optional[str] = None
    to_provider_address: Optional[str] = None
    urgency: Literal["routine", "urgent", "emergency"] = "routine"
    reason: str
    clinical_summary: Optional[str] = None
    questions_for_specialist: List[str] = []
    attachments: List[str] = []

class FollowupIntentData(BaseModel):
    timeframe: str  # "1 semaine", "1 mois", etc.
    target_date: Optional[str] = None
    reason: str
    focus_items: List[str] = []
    labs_before_visit: List[str] = []
    pre_visit_instructions: Optional[str] = None
    reminders_enabled: bool = True
    reminders_timing: Literal["1_day", "3_days", "1_week"] = "1_day"
    auto_create_consultation: bool = False

# Request/Response Models
class CreateOrderIntentRequest(BaseModel):
    consultation_id: str
    patient_id: str
    intent_type: Literal["rx_intent", "referral_intent", "followup_intent", "lab_imaging_intent"]
    intent_data: dict  # RxIntentData | ReferralIntentData | FollowupIntentData
    source_problem_id: Optional[str] = None

class OrderIntentResponse(BaseModel):
    id: str
    consultation_id: str
    patient_id: str
    intent_type: str
    intent_data: dict
    source_problem_id: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

class GenerateDocumentRequest(BaseModel):
    consultation_id: str
    patient_id: str
    intent_ids: List[str]
    artifact_type: Literal["prescription", "referral_letter", "followup_plan", "visit_note"]
    template_id: Optional[str] = None

class DocumentResponse(BaseModel):
    id: str
    consultation_id: str
    patient_id: str
    artifact_type: str
    status: str
    derived_from_intent_ids: List[str]
    template_id: Optional[str]
    content_html: Optional[str]
    content_text: Optional[str]
    channel: Optional[str]
    created_at: datetime
    signed_at: Optional[datetime]
    sent_at: Optional[datetime]

class CreateActionJobRequest(BaseModel):
    consultation_id: str
    action_type: Literal[
        "send_prescription_whatsapp",
        "send_prescription_email", 
        "send_referral_email",
        "send_referral_fax",
        "schedule_followup_consultation",
        "send_reminder_sms",
        "send_reminder_email"
    ]
    source_document_id: Optional[str] = None
    source_intent_id: Optional[str] = None
    payload: dict
    scheduled_for: Optional[datetime] = None

class ActionJobResponse(BaseModel):
    id: str
    consultation_id: str
    action_type: str
    source_document_id: Optional[str]
    source_intent_id: Optional[str]
    payload: dict
    status: str
    scheduled_for: Optional[datetime]
    created_at: datetime
    approved_at: Optional[datetime]
    completed_at: Optional[datetime]

# =============================================================================
# DATABASE HELPERS
# =============================================================================

def get_db_connection():
    """Get database connection from pool."""
    from app.main import app
    return app.state.db_pool.connection()

# =============================================================================
# ORDER INTENTS ENDPOINTS
# =============================================================================

@router.post("/intents", response_model=OrderIntentResponse)
async def create_order_intent(
    request: CreateOrderIntentRequest,
    current_user: dict = Depends(require_doctor_or_owner)
):
    """Create a new order intent (rx, referral, followup)."""
    user_id = current_user["id"]
    intent_id = str(uuid.uuid4())
    
    with get_db_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                INSERT INTO consultation_orders (
                    id, consultation_id, patient_id, intent_type, intent_data,
                    source_problem_id, status, created_by
                ) VALUES (%s, %s, %s, %s, %s, %s, 'active', %s)
                RETURNING *
            """, (
                intent_id,
                request.consultation_id,
                request.patient_id,
                request.intent_type,
                psycopg.types.json.Json(request.intent_data),
                request.source_problem_id,
                user_id
            ))
            result = cur.fetchone()
            conn.commit()
    
    return OrderIntentResponse(**result)

@router.get("/intents/{consultation_id}", response_model=List[OrderIntentResponse])
async def get_order_intents(
    consultation_id: str,
    intent_type: Optional[str] = None
):
    """Get all order intents for a consultation."""
    with get_db_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if intent_type:
                cur.execute("""
                    SELECT * FROM consultation_orders
                    WHERE consultation_id = %s AND intent_type = %s AND status != 'cancelled'
                    ORDER BY created_at DESC
                """, (consultation_id, intent_type))
            else:
                cur.execute("""
                    SELECT * FROM consultation_orders
                    WHERE consultation_id = %s AND status != 'cancelled'
                    ORDER BY created_at DESC
                """, (consultation_id,))
            results = cur.fetchall()
    
    return [OrderIntentResponse(**r) for r in results]

@router.put("/intents/{intent_id}")
async def update_order_intent(
    intent_id: str,
    intent_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update an order intent's data."""
    user_id = current_user["id"]
    with get_db_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                UPDATE consultation_orders
                SET intent_data = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING *
            """, (psycopg.types.json.Json(intent_data), intent_id))
            result = cur.fetchone()
            conn.commit()
    
    if not result:
        raise HTTPException(status_code=404, detail="Intent not found")
    
    return OrderIntentResponse(**result)

@router.delete("/intents/{intent_id}")
async def cancel_order_intent(intent_id: str):
    """Cancel an order intent (soft delete)."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE consultation_orders
                SET status = 'cancelled', updated_at = NOW()
                WHERE id = %s
            """, (intent_id,))
            conn.commit()
    
    return {"status": "cancelled"}

# =============================================================================
# DOCUMENT GENERATION ENDPOINTS
# =============================================================================

@router.post("/documents/generate", response_model=DocumentResponse)
async def generate_document(
    request: GenerateDocumentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a document from one or more order intents.
    
    Documents are DERIVED from intents - we never parse generated docs for actions.
    """
    user_id = current_user["id"]
    document_id = str(uuid.uuid4())
    
    # Fetch intents to generate content
    with get_db_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # Get the intents
            cur.execute("""
                SELECT * FROM consultation_orders
                WHERE id = ANY(%s) AND status = 'active'
            """, (request.intent_ids,))
            intents = cur.fetchall()
            
            if not intents:
                raise HTTPException(status_code=404, detail="No active intents found")
            
            # Get patient info for template
            # TODO: Fetch from patients table
            patient_name = "Patient"  # Placeholder
            
            # Get template if specified
            template_html = None
            if request.template_id:
                cur.execute("""
                    SELECT content_html FROM order_templates WHERE id = %s
                """, (request.template_id,))
                template_row = cur.fetchone()
                if template_row:
                    template_html = template_row['content_html']
            
            # Generate content based on artifact type
            content_html, content_text = _generate_document_content(
                artifact_type=request.artifact_type,
                intents=intents,
                template_html=template_html,
                patient_name=patient_name
            )
            
            # Save document
            cur.execute("""
                INSERT INTO consultation_documents (
                    id, consultation_id, patient_id, artifact_type, status,
                    derived_from_intent_ids, template_id, content_html, content_text,
                    created_by
                ) VALUES (%s, %s, %s, %s, 'draft', %s, %s, %s, %s, %s)
                RETURNING *
            """, (
                document_id,
                request.consultation_id,
                request.patient_id,
                request.artifact_type,
                request.intent_ids,
                request.template_id,
                content_html,
                content_text,
                user_id
            ))
            result = cur.fetchone()
            conn.commit()
    
    return DocumentResponse(**result)

@router.get("/documents/{consultation_id}", response_model=List[DocumentResponse])
async def get_documents(
    consultation_id: str,
    artifact_type: Optional[str] = None,
    status: Optional[str] = None
):
    """Get all documents for a consultation."""
    with get_db_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            query = "SELECT * FROM consultation_documents WHERE consultation_id = %s"
            params = [consultation_id]
            
            if artifact_type:
                query += " AND artifact_type = %s"
                params.append(artifact_type)
            
            if status:
                query += " AND status = %s"
                params.append(status)
            
            query += " ORDER BY created_at DESC"
            
            cur.execute(query, params)
            results = cur.fetchall()
    
    return [DocumentResponse(**r) for r in results]

@router.post("/documents/{document_id}/sign")
async def sign_document(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Sign a document - moves from draft/reviewed → signed.
    
    CRITICAL: Only signed documents can be sent.
    """
    user_id = current_user["id"]
    with get_db_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                UPDATE consultation_documents
                SET status = 'signed', signed_at = NOW(), signed_by = %s
                WHERE id = %s AND status IN ('draft', 'reviewed')
                RETURNING *
            """, (user_id, document_id))
            result = cur.fetchone()
            conn.commit()
    
    if not result:
        raise HTTPException(status_code=400, detail="Document cannot be signed (invalid status)")
    
    return DocumentResponse(**result)

# =============================================================================
# ACTION ENGINE ENDPOINTS
# =============================================================================

@router.post("/actions", response_model=ActionJobResponse)
async def create_action_job(
    request: CreateActionJobRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Create an action job (queued, NOT executed immediately).
    
    Actions are REVIEW-GATED: require explicit approval before execution.
    Use the approve_action endpoint to trigger actual execution.
    """
    user_id = current_user["id"]
    job_id = str(uuid.uuid4())
    
    # Generate idempotency key
    source_id = request.source_document_id or request.source_intent_id or "manual"
    idempotency_key = f"{request.action_type}:{source_id}:{datetime.now(timezone.utc).isoformat()}"
    
    with get_db_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                INSERT INTO action_jobs (
                    id, consultation_id, action_type, source_document_id, source_intent_id,
                    payload, scheduled_for, status, idempotency_key, created_by
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s)
                RETURNING *
            """, (
                job_id,
                request.consultation_id,
                request.action_type,
                request.source_document_id,
                request.source_intent_id,
                psycopg.types.json.Json(request.payload),
                request.scheduled_for,
                idempotency_key,
                user_id
            ))
            result = cur.fetchone()
            conn.commit()
    
    return ActionJobResponse(**result)

@router.post("/actions/{job_id}/approve")
async def approve_action_job(
    job_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Approve and execute an action job.
    
    This is the ONLY way actions get executed - ensures doctor review.
    """
    user_id = current_user["id"]
    with get_db_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # Get the job
            cur.execute("SELECT * FROM action_jobs WHERE id = %s", (job_id,))
            job = cur.fetchone()
            
            if not job:
                raise HTTPException(status_code=404, detail="Action job not found")
            
            if job['status'] != 'pending':
                raise HTTPException(status_code=400, detail=f"Job already {job['status']}")
            
            # Mark as approved + processing
            cur.execute("""
                UPDATE action_jobs
                SET status = 'processing', approved_at = NOW(), approved_by = %s
                WHERE id = %s
            """, (user_id, job_id))
            
            # Execute the action
            try:
                result = await _execute_action(job)
                
                # Mark completed
                cur.execute("""
                    UPDATE action_jobs
                    SET status = 'completed', completed_at = NOW(), result = %s
                    WHERE id = %s
                """, (psycopg.types.json.Json(result), job_id))
                
            except Exception as e:
                # Mark failed
                cur.execute("""
                    UPDATE action_jobs
                    SET status = 'failed', error_message = %s, retry_count = retry_count + 1
                    WHERE id = %s
                """, (str(e), job_id))
                raise HTTPException(status_code=500, detail=f"Action failed: {str(e)}")
            
            conn.commit()
    
    return {"status": "completed", "result": result}

@router.get("/actions/{consultation_id}", response_model=List[ActionJobResponse])
async def get_action_jobs(
    consultation_id: str,
    status: Optional[str] = None
):
    """Get all action jobs for a consultation."""
    with get_db_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if status:
                cur.execute("""
                    SELECT * FROM action_jobs
                    WHERE consultation_id = %s AND status = %s
                    ORDER BY created_at DESC
                """, (consultation_id, status))
            else:
                cur.execute("""
                    SELECT * FROM action_jobs
                    WHERE consultation_id = %s
                    ORDER BY created_at DESC
                """, (consultation_id,))
            results = cur.fetchall()
    
    return [ActionJobResponse(**r) for r in results]

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _generate_document_content(
    artifact_type: str,
    intents: List[dict],
    template_html: Optional[str],
    patient_name: str
) -> tuple[str, str]:
    """
    Generate document content from intents using template.
    
    Returns (html_content, text_content).
    """
    today = datetime.now().strftime("%d/%m/%Y")
    
    if artifact_type == "prescription":
        # Build medication list
        medications_html = ""
        medications_text = ""
        for intent in intents:
            if intent['intent_type'] == 'rx_intent':
                data = intent['intent_data']
                for i, med in enumerate(data.get('medications', []), 1):
                    medications_html += f"""
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">{i}. {med.get('name', '')}</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">{med.get('dosage', '')} {med.get('form', '')}</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">{med.get('frequency', '')}</td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">{med.get('duration', '')}</td>
                        </tr>
                    """
                    medications_text += f"{i}. {med.get('name', '')} {med.get('dosage', '')} - {med.get('frequency', '')} pendant {med.get('duration', '')}\n"
        
        html_content = f"""
        <div style="font-family: 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 20px;">
            <header style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px;">
                <h1 style="margin: 0; font-size: 24px;">ORDONNANCE MÉDICALE</h1>
                <p style="margin: 5px 0; color: #666;">Date: {today}</p>
            </header>
            
            <section style="margin-bottom: 20px;">
                <p><strong>Patient:</strong> {patient_name}</p>
            </section>
            
            <section style="margin-bottom: 30px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f5f5f5;">
                            <th style="padding: 10px; text-align: left;">Médicament</th>
                            <th style="padding: 10px; text-align: left;">Dosage</th>
                            <th style="padding: 10px; text-align: left;">Posologie</th>
                            <th style="padding: 10px; text-align: left;">Durée</th>
                        </tr>
                    </thead>
                    <tbody>
                        {medications_html}
                    </tbody>
                </table>
            </section>
            
            <footer style="margin-top: 40px; text-align: right;">
                <p style="margin: 5px 0;">Signature du médecin</p>
                <div style="height: 60px; border-bottom: 1px solid #333; width: 200px; margin-left: auto;"></div>
            </footer>
        </div>
        """
        
        text_content = f"ORDONNANCE MÉDICALE\nDate: {today}\nPatient: {patient_name}\n\n{medications_text}"
        
    elif artifact_type == "referral_letter":
        # Build referral content
        referral_data = {}
        for intent in intents:
            if intent['intent_type'] == 'referral_intent':
                referral_data = intent['intent_data']
                break
        
        html_content = f"""
        <div style="font-family: 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 20px;">
            <header style="margin-bottom: 30px;">
                <p style="text-align: right;">Le {today}</p>
            </header>
            
            <section style="margin-bottom: 20px;">
                <p><strong>À l'attention de:</strong> {referral_data.get('to_provider_name', 'Cher(e) Confrère/Consœur')}</p>
                <p><strong>Spécialité:</strong> {referral_data.get('to_specialty', '')}</p>
            </section>
            
            <section style="margin-bottom: 20px;">
                <p><strong>Objet:</strong> Demande de consultation pour {patient_name}</p>
                <p><strong>Urgence:</strong> {referral_data.get('urgency', 'routine').capitalize()}</p>
            </section>
            
            <section style="margin-bottom: 20px;">
                <p><strong>Motif de la référence:</strong></p>
                <p>{referral_data.get('reason', '')}</p>
            </section>
            
            <section style="margin-bottom: 20px;">
                <p><strong>Résumé clinique:</strong></p>
                <p>{referral_data.get('clinical_summary', '')}</p>
            </section>
            
            <footer style="margin-top: 40px;">
                <p>Confraternellement,</p>
                <div style="height: 60px;"></div>
                <p>Signature</p>
            </footer>
        </div>
        """
        
        text_content = f"""LETTRE DE RÉFÉRENCE
Date: {today}
À: {referral_data.get('to_specialty', '')}
Patient: {patient_name}

Motif: {referral_data.get('reason', '')}

{referral_data.get('clinical_summary', '')}
"""
    
    else:
        # Generic document
        html_content = f"<div><h1>Document généré</h1><p>Date: {today}</p><p>Patient: {patient_name}</p></div>"
        text_content = f"Document généré\nDate: {today}\nPatient: {patient_name}"
    
    return html_content, text_content


async def _execute_action(job: dict) -> dict:
    """
    Execute an approved action job.
    
    This is where we actually send WhatsApp messages, create consultations, etc.
    """
    action_type = job['action_type']
    payload = job['payload']
    
    if action_type == "send_prescription_whatsapp":
        # TODO: Integrate with WhatsApp Business API
        # For now, simulate success
        return {
            "channel": "whatsapp",
            "recipient": payload.get("phone"),
            "message_id": f"whatsapp_{uuid.uuid4().hex[:8]}",
            "status": "sent"
        }
    
    elif action_type == "send_prescription_email":
        # TODO: Integrate with email service
        return {
            "channel": "email",
            "recipient": payload.get("email"),
            "message_id": f"email_{uuid.uuid4().hex[:8]}",
            "status": "sent"
        }
    
    elif action_type == "schedule_followup_consultation":
        # TODO: Create new consultation with pre-filled data
        return {
            "consultation_id": f"followup_{uuid.uuid4().hex[:8]}",
            "scheduled_date": payload.get("target_date"),
            "status": "created"
        }
    
    elif action_type == "send_referral_email":
        return {
            "channel": "email",
            "recipient": payload.get("provider_email"),
            "message_id": f"referral_{uuid.uuid4().hex[:8]}",
            "status": "sent"
        }
    
    else:
        raise ValueError(f"Unknown action type: {action_type}")
