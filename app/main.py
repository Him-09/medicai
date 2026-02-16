from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import asyncio
import logging
from contextlib import asynccontextmanager

from app.api.consultations import router as consultations_router
from app.api.chat import router as chat_router
from app.api.patients import router as patients_router
from app.api.documents import router as documents_router, documents_router as documents_by_id_router
from app.api.actions import router as actions_router
from app.api.workspace import router as workspace_router
from app.api.maintenance import router as maintenance_router
from app.api.notes import router as notes_router
from app.api.auth_routes import router as auth_router
from app.api.settings import router as settings_router
from app.api.orders import router as orders_router
from app.api.voice import router as voice_router
from app.api.scribe import router as scribe_router
from app.api.knowledge_base import router as knowledge_base_router
from app.api.team import router as team_router
from medicai.storage.maintenance import run_all_maintenance_tasks
from app.utils.maintenance_cleanup import cleanup_reviewed_documents_raw_files, cleanup_empty_directories

from medicai.storage.patient_store import init_patients_table
from medicai.storage.consultation_store import init_consultations_table
from medicai.storage.workspace_store import init_workspace_table

# Security imports
from app.security.middleware import add_security_middleware
from app.security.phi_redactor import configure_phi_safe_logging

# Configure PHI-safe logging before anything else
configure_phi_safe_logging()
logger = logging.getLogger(__name__)


# Background task for periodic maintenance
async def periodic_maintenance():
    """Run maintenance tasks after a delay, then every hour."""
    # Wait 60 seconds before first run to let server fully start
    print("[Maintenance] Scheduled to run in 60 seconds...")
    await asyncio.sleep(60)
    
    while True:
        try:
            # Run maintenance tasks
            print("[Maintenance] Running maintenance tasks...")
            results = run_all_maintenance_tasks(inactive_days=180)
            print(f"[Maintenance] Completed {results['consultations_completed']} consultations, "
                  f"archived {results['patients_archived']} patients")
            
            # Cleanup raw files for reviewed documents
            # cleanup_result = cleanup_reviewed_documents_raw_files()
            # print(f"[Maintenance] Cleaned up {cleanup_result['files_deleted']} raw files for reviewed documents")
            
            # Clean up empty directories
            cleanup_empty_directories("data/raw")
            
            # Wait 1 hour before next run
            await asyncio.sleep(60 * 60)
        except Exception as e:
            print(f"[Maintenance] Error running periodic tasks: {e}")
            # Wait 1 hour before retry on error
            await asyncio.sleep(60 * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    # Startup
    # Initialize database tables (once at startup, not on every import)
    print("[Startup] Initializing database tables...")
    init_patients_table()
    init_consultations_table()
    init_workspace_table()
    print("[Startup] Database tables initialized.")
    # Start background maintenance task
    maintenance_task = asyncio.create_task(periodic_maintenance())
    
    yield
    
    # Shutdown
    maintenance_task.cancel()
    try:
        await maintenance_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="MedicAI API", version="0.1", lifespan=lifespan)

# Add security middleware (headers, request logging)
add_security_middleware(app)

# Configure CORS with environment-based origins
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:8080"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth_router)
app.include_router(settings_router)
app.include_router(orders_router)
app.include_router(voice_router)
app.include_router(scribe_router)
app.include_router(consultations_router)
app.include_router(chat_router)
app.include_router(patients_router)
app.include_router(documents_router)
app.include_router(documents_by_id_router)
app.include_router(actions_router)
app.include_router(workspace_router)
app.include_router(maintenance_router)
app.include_router(notes_router)
app.include_router(knowledge_base_router)
app.include_router(team_router)

@app.get("/health")
@app.get("/api/health")
def health():
    return {"ok": True}
