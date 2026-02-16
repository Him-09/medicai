#!/usr/bin/env python3
"""
Run all migrations in order.
Usage: python run_all_migrations.py
"""
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from run_migration import run_migration

# Migration order - run in this sequence
MIGRATION_ORDER = [
    "000_base_tables.sql",           # Base tables (idempotent, matches existing schema)
    # "001_users_audit.sql",         # Skipped - covered by 000_base_tables.sql
    "002_pgvector_embeddings.sql",   # pgvector for RAG (optional - skips if no pgvector)
    "003_user_profile_clinic_settings.sql",  # User profile fields + clinic settings
    "004_extended_settings.sql",     # Notifications, privacy, templates, snippets
    "004_consultation_documents_orders.sql",  # Orders, documents, action jobs
    "005_voice_sessions_transcripts.sql",    # Voice sessions
    "006_security_profile_images.sql",       # 2FA and profile images
    "007_template_images.sql",       # Header/footer images on document_templates
    "007_tenant_isolation_rls.sql",  # Multi-tenant RLS (adds clinic_id)
    "008_session_tracking.sql",      # Session tracking
    "009_knowledge_base.sql",        # Knowledge base collections/articles
    "010_team_management.sql",       # Team management
    "011_rename_roles.sql",          # Rename roles
    "012_doctor_centric_architecture.sql",   # Doctor-centric architecture
    "014_app_role_rls_enforcement.sql",      # App role RLS enforcement
    "015_clinic_id_result_tables.sql",       # Add clinic_id to lab/radiology/prescription
]


def main():
    migrations_dir = Path(__file__).parent / "migrations"
    
    print("=" * 60)
    print("MedicAI Database Migration Runner")
    print("=" * 60)
    print()
    
    success_count = 0
    skip_count = 0
    fail_count = 0
    
    for migration_file in MIGRATION_ORDER:
        migration_path = migrations_dir / migration_file
        
        if not migration_path.exists():
            print(f"⚠️  SKIP: {migration_file} (file not found)")
            skip_count += 1
            continue
        
        print(f"\n{'─' * 60}")
        print(f"▶ Running: {migration_file}")
        print(f"{'─' * 60}")
        
        try:
            run_migration(str(migration_path))
            print(f"✅ SUCCESS: {migration_file}")
            success_count += 1
        except Exception as e:
            print(f"❌ FAILED: {migration_file}")
            print(f"   Error: {e}")
            fail_count += 1
            
            # Ask user if they want to continue
            response = input("\nContinue with remaining migrations? (y/n): ").strip().lower()
            if response != 'y':
                print("\nMigration stopped by user.")
                break
    
    print()
    print("=" * 60)
    print("Migration Summary")
    print("=" * 60)
    print(f"  ✅ Successful: {success_count}")
    print(f"  ⚠️  Skipped:    {skip_count}")
    print(f"  ❌ Failed:     {fail_count}")
    print("=" * 60)
    
    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
