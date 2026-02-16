#!/usr/bin/env python
"""Quick migration runner - executes SQL migration files."""
import sys
import os
from pathlib import Path

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from medicai.storage.postgres import get_conn

def run_migration(sql_file: str):
    """Run a SQL migration file."""
    sql_path = Path(sql_file)
    if not sql_path.exists():
        print(f"✗ Migration file not found: {sql_file}")
        sys.exit(1)
    
    sql = sql_path.read_text(encoding='utf-8')
    
    print(f"Running migration: {sql_file}")
    
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()
        print(f"✓ Migration completed successfully")
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <migration_file.sql>")
        print("\nExample: python run_migration.py migrations/001_users_audit.sql")
        sys.exit(1)
    
    run_migration(sys.argv[1])
