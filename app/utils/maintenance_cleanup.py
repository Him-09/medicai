import os
import time
import logging
from typing import Optional, List, Dict, Any

from medicai.storage.postgres import get_conn

logger = logging.getLogger(__name__)

def cleanup_reviewed_documents_raw_files() -> dict:
    files_found = 0
    files_deleted = 0
    errors = 0
    
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT doc_id, source_file_path 
                    FROM documents 
                    WHERE review_status = 'reviewed' 
                    AND source_file_path IS NOT NULL
                """)
                reviewed_docs = cur.fetchall()
                
                for doc_id, source_path in reviewed_docs:
                    if not source_path:
                        continue
                    
                    files_found += 1
                    
                    try:
                        if os.path.exists(source_path):
                            os.remove(source_path)
                            files_deleted += 1
                            logger.info(f"Deleted raw file for reviewed doc {doc_id}: {source_path}")
                            
                            cur.execute("""
                                UPDATE documents 
                                SET source_file_path = NULL, 
                                    raw_file_cleaned_at = now()
                                WHERE doc_id = %s
                            """, (doc_id,))
                    except Exception as e:
                        errors += 1
                        logger.warning(f"Failed to delete raw file {source_path}: {e}")
                
                conn.commit()
    except Exception as e:
        logger.error(f"Error in cleanup_reviewed_documents_raw_files: {e}")
        errors += 1
    
    return {
        "files_found": files_found,
        "files_deleted": files_deleted,
        "errors": errors,
    }

def cleanup_old_files(
    root_dir: str,
    older_than_days: int,
    dry_run: bool = False
) -> dict:
    if not os.path.exists(root_dir):
        return {"files_found": 0, "files_deleted": 0, "errors": 0}
    
    cutoff = time.time() - older_than_days * 24 * 3600
    
    files_found = 0
    files_deleted = 0
    errors = 0
    
    for dirpath, _, filenames in os.walk(root_dir):
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            try:
                mtime = os.path.getmtime(fp)
                if mtime < cutoff:
                    files_found += 1
                    if not dry_run:
                        os.remove(fp)
                        files_deleted += 1
                        logger.info(f"Deleted old file: {fp}")
                    else:
                        logger.info(f"Would delete: {fp}")
            except Exception as e:
                errors += 1
                logger.warning(f"Failed to process {fp}: {e}")
    
    return {
        "files_found": files_found,
        "files_deleted": files_deleted,
        "errors": errors,
    }

def cleanup_empty_directories(root_dir: str, dry_run: bool = False) -> int:
    if not os.path.exists(root_dir):
        return 0
    
    removed = 0
    
    for dirpath, dirnames, filenames in os.walk(root_dir, topdown=False):
        if dirpath == root_dir:
            continue
        
        if not dirnames and not filenames:
            try:
                if not dry_run:
                    os.rmdir(dirpath)
                    removed += 1
                    logger.info(f"Removed empty directory: {dirpath}")
                else:
                    logger.info(f"Would remove empty directory: {dirpath}")
            except Exception as e:
                logger.warning(f"Failed to remove directory {dirpath}: {e}")
    
    return removed

def delete_raw_file_after_processing(raw_path: str) -> bool:
    try:
        if os.path.exists(raw_path):
            os.remove(raw_path)
            logger.info(f"Deleted raw file after processing: {raw_path}")
            return True
    except Exception as e:
        logger.warning(f"Failed to delete raw file {raw_path}: {e}")
    return False

def get_directory_stats(root_dir: str, older_than_days: Optional[int] = None) -> dict:
    if not os.path.exists(root_dir):
        return {
            "total_files": 0,
            "total_size_bytes": 0,
            "old_files": 0,
            "old_files_size_bytes": 0,
        }
    
    total_files = 0
    total_size = 0
    old_files = 0
    old_size = 0
    
    cutoff = None
    if older_than_days:
        cutoff = time.time() - older_than_days * 24 * 3600
    
    for dirpath, _, filenames in os.walk(root_dir):
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            try:
                stat = os.stat(fp)
                total_files += 1
                total_size += stat.st_size
                
                if cutoff and stat.st_mtime < cutoff:
                    old_files += 1
                    old_size += stat.st_size
            except Exception:
                pass
    
    return {
        "total_files": total_files,
        "total_size_bytes": total_size,
        "old_files": old_files,
        "old_files_size_bytes": old_size,
    }

def get_cleanup_stats() -> Dict[str, Any]:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT COUNT(*) 
                    FROM documents 
                    WHERE review_status = 'reviewed' 
                    AND source_file_path IS NOT NULL
                """)
                pending_cleanup = cur.fetchone()[0]
                
                cur.execute("""
                    SELECT COUNT(*) 
                    FROM documents 
                    WHERE review_status = 'reviewed'
                """)
                total_reviewed = cur.fetchone()[0]
                
                cur.execute("""
                    SELECT COUNT(*) 
                    FROM documents 
                    WHERE review_status = 'pending'
                """)
                pending_review = cur.fetchone()[0]
                
        return {
            "pending_cleanup": pending_cleanup,
            "total_reviewed": total_reviewed,
            "pending_review": pending_review,
            "cleanup_ready": pending_cleanup > 0,
        }
    except Exception as e:
        logger.error(f"Error getting cleanup stats: {e}")
        return {
            "pending_cleanup": 0,
            "total_reviewed": 0,
            "pending_review": 0,
            "cleanup_ready": False,
            "error": str(e),
        }
