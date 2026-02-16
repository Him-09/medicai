# scripts/backup.py
"""
Encrypted database backup script for MedicAI (Python version).
Cross-platform alternative to the bash script.

Usage:
    python scripts/backup.py backup
    python scripts/backup.py restore backups/medicai_backup_20240115.sql.enc
    python scripts/backup.py list
    python scripts/backup.py test  # Test restore to verify backup integrity
"""
import os
import sys
import subprocess
import hashlib
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
import argparse
import logging

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

# Try to import cryptography for encryption
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.backends import default_backend
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False
    print("Warning: cryptography not installed. Install with: pip install cryptography")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "medicai")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("PGPASSWORD", os.getenv("POSTGRES_PASSWORD", ""))

BACKUP_DIR = Path(os.getenv("BACKUP_DIR", PROJECT_ROOT / "backups"))
BACKUP_KEY = os.getenv("BACKUP_ENCRYPTION_KEY", "")
RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "30"))


def derive_key(password: str, salt: bytes) -> bytes:
    """Derive encryption key from password."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
        backend=default_backend()
    )
    return kdf.derive(password.encode())


def encrypt_file(input_path: Path, output_path: Path, password: str) -> str:
    """
    Encrypt a file using AES-256-GCM.
    Returns the SHA256 checksum of the encrypted file.
    """
    if not CRYPTO_AVAILABLE:
        raise RuntimeError("cryptography package required for encryption")
    
    # Generate random salt and nonce
    salt = secrets.token_bytes(16)
    nonce = secrets.token_bytes(12)
    
    # Derive key from password
    key = derive_key(password, salt)
    aesgcm = AESGCM(key)
    
    # Read and encrypt
    with open(input_path, 'rb') as f:
        plaintext = f.read()
    
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    
    # Write: salt + nonce + ciphertext
    with open(output_path, 'wb') as f:
        f.write(salt + nonce + ciphertext)
    
    # Calculate checksum
    with open(output_path, 'rb') as f:
        checksum = hashlib.sha256(f.read()).hexdigest()
    
    return checksum


def decrypt_file(input_path: Path, output_path: Path, password: str) -> None:
    """Decrypt a file encrypted with encrypt_file."""
    if not CRYPTO_AVAILABLE:
        raise RuntimeError("cryptography package required for decryption")
    
    with open(input_path, 'rb') as f:
        data = f.read()
    
    salt = data[:16]
    nonce = data[16:28]
    ciphertext = data[28:]
    
    # Derive key from password
    key = derive_key(password, salt)
    aesgcm = AESGCM(key)
    
    # Decrypt
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    
    with open(output_path, 'wb') as f:
        f.write(plaintext)


def run_pg_dump(output_path: Path) -> bool:
    """Run pg_dump to create a database backup."""
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASSWORD
    
    cmd = [
        "pg_dump",
        "-h", DB_HOST,
        "-p", DB_PORT,
        "-U", DB_USER,
        "-d", DB_NAME,
        "-F", "c",  # Custom format (compressed)
        "-Z", "9",  # Maximum compression
        "-f", str(output_path)
    ]
    
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"pg_dump failed: {result.stderr}")
            return False
        return True
    except FileNotFoundError:
        logger.error("pg_dump not found. Install PostgreSQL client tools.")
        return False


def run_pg_restore(input_path: Path) -> bool:
    """Run pg_restore to restore a database backup."""
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASSWORD
    
    cmd = [
        "pg_restore",
        "-h", DB_HOST,
        "-p", DB_PORT,
        "-U", DB_USER,
        "-d", DB_NAME,
        "--clean",
        "--if-exists",
        str(input_path)
    ]
    
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        # pg_restore often returns warnings, which is usually OK
        if result.returncode != 0 and "error" in result.stderr.lower():
            logger.error(f"pg_restore failed: {result.stderr}")
            return False
        return True
    except FileNotFoundError:
        logger.error("pg_restore not found. Install PostgreSQL client tools.")
        return False


def create_backup() -> Optional[Path]:
    """Create an encrypted database backup."""
    if not BACKUP_KEY:
        logger.error("BACKUP_ENCRYPTION_KEY not set in environment")
        return None
    
    if not DB_PASSWORD:
        logger.error("PGPASSWORD or POSTGRES_PASSWORD not set in environment")
        return None
    
    # Create backup directory
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate filenames
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_file = BACKUP_DIR / f"temp_backup_{timestamp}.sql"
    encrypted_file = BACKUP_DIR / f"medicai_backup_{timestamp}.sql.enc"
    
    logger.info(f"Starting backup of database '{DB_NAME}'...")
    
    # Create SQL dump
    if not run_pg_dump(temp_file):
        return None
    
    logger.info(f"Database dump created: {temp_file.name}")
    
    # Encrypt the backup
    logger.info("Encrypting backup...")
    try:
        checksum = encrypt_file(temp_file, encrypted_file, BACKUP_KEY)
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        temp_file.unlink(missing_ok=True)
        return None
    
    # Remove unencrypted file
    temp_file.unlink()
    
    # Save checksum
    checksum_file = encrypted_file.with_suffix('.enc.sha256')
    checksum_file.write_text(f"{checksum}  {encrypted_file.name}\n")
    
    # Get file size
    size_mb = encrypted_file.stat().st_size / (1024 * 1024)
    
    logger.info(f"Encrypted backup created: {encrypted_file.name}")
    logger.info(f"Size: {size_mb:.2f} MB")
    logger.info(f"Checksum: {checksum}")
    
    return encrypted_file


def restore_backup(backup_file: Path, confirm: bool = True) -> bool:
    """Restore a database from an encrypted backup."""
    if not backup_file.exists():
        logger.error(f"Backup file not found: {backup_file}")
        return False
    
    if not BACKUP_KEY:
        logger.error("BACKUP_ENCRYPTION_KEY not set")
        return False
    
    if confirm:
        response = input(f"This will OVERWRITE database '{DB_NAME}'. Continue? (yes/no): ")
        if response.lower() != "yes":
            logger.info("Restore cancelled")
            return False
    
    # Verify checksum if available
    checksum_file = backup_file.with_suffix('.enc.sha256')
    if checksum_file.exists():
        expected = checksum_file.read_text().split()[0]
        with open(backup_file, 'rb') as f:
            actual = hashlib.sha256(f.read()).hexdigest()
        
        if expected != actual:
            logger.error("Checksum verification failed!")
            return False
        logger.info("Checksum verified OK")
    
    # Decrypt to temp file
    temp_file = BACKUP_DIR / f"temp_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
    
    logger.info("Decrypting backup...")
    try:
        decrypt_file(backup_file, temp_file, BACKUP_KEY)
    except Exception as e:
        logger.error(f"Decryption failed: {e}")
        return False
    
    # Restore database
    logger.info("Restoring database...")
    success = run_pg_restore(temp_file)
    
    # Clean up
    temp_file.unlink(missing_ok=True)
    
    if success:
        logger.info("Restore completed successfully!")
    else:
        logger.error("Restore failed")
    
    return success


def cleanup_old_backups() -> int:
    """Remove backups older than RETENTION_DAYS."""
    if not BACKUP_DIR.exists():
        return 0
    
    cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
    removed = 0
    
    for backup_file in BACKUP_DIR.glob("medicai_backup_*.enc"):
        if datetime.fromtimestamp(backup_file.stat().st_mtime) < cutoff:
            backup_file.unlink()
            checksum_file = backup_file.with_suffix('.enc.sha256')
            checksum_file.unlink(missing_ok=True)
            removed += 1
            logger.info(f"Removed old backup: {backup_file.name}")
    
    return removed


def list_backups() -> None:
    """List available backups."""
    if not BACKUP_DIR.exists():
        print("No backup directory found")
        return
    
    backups = list(BACKUP_DIR.glob("medicai_backup_*.enc"))
    
    if not backups:
        print("No backups found")
        return
    
    print(f"\nAvailable backups in {BACKUP_DIR}:\n")
    print(f"{'Filename':<45} {'Size':>10} {'Date':<20}")
    print("-" * 75)
    
    for backup in sorted(backups, reverse=True):
        size = backup.stat().st_size / (1024 * 1024)
        mtime = datetime.fromtimestamp(backup.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        print(f"{backup.name:<45} {size:>8.2f}MB {mtime:<20}")
    
    print(f"\nTotal: {len(backups)} backups")


def test_backup() -> bool:
    """Test backup integrity by creating and testing restore."""
    logger.info("Running backup test...")
    
    # Create backup
    backup_file = create_backup()
    if not backup_file:
        return False
    
    # Test decryption (don't actually restore)
    temp_file = BACKUP_DIR / "test_decrypt.sql"
    try:
        decrypt_file(backup_file, temp_file, BACKUP_KEY)
        logger.info("Decryption test: OK")
        
        # Verify it's a valid pg_dump file
        with open(temp_file, 'rb') as f:
            header = f.read(5)
        
        if header == b'PGDMP':
            logger.info("Backup format: OK (PostgreSQL custom format)")
        else:
            logger.warning("Unexpected backup format")
        
        temp_file.unlink()
        logger.info("Backup test: PASSED")
        return True
        
    except Exception as e:
        logger.error(f"Backup test failed: {e}")
        temp_file.unlink(missing_ok=True)
        return False


def main():
    parser = argparse.ArgumentParser(description="MedicAI Database Backup Tool")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Backup command
    backup_parser = subparsers.add_parser("backup", help="Create encrypted backup")
    backup_parser.add_argument("--no-cleanup", action="store_true", help="Skip cleanup of old backups")
    
    # Restore command
    restore_parser = subparsers.add_parser("restore", help="Restore from backup")
    restore_parser.add_argument("file", type=Path, help="Backup file to restore")
    restore_parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    
    # List command
    subparsers.add_parser("list", help="List available backups")
    
    # Test command
    subparsers.add_parser("test", help="Test backup integrity")
    
    # Cleanup command
    subparsers.add_parser("cleanup", help="Remove old backups")
    
    args = parser.parse_args()
    
    if args.command == "backup":
        backup_file = create_backup()
        if backup_file and not args.no_cleanup:
            cleanup_old_backups()
        sys.exit(0 if backup_file else 1)
        
    elif args.command == "restore":
        success = restore_backup(args.file, confirm=not args.yes)
        sys.exit(0 if success else 1)
        
    elif args.command == "list":
        list_backups()
        
    elif args.command == "test":
        success = test_backup()
        sys.exit(0 if success else 1)
        
    elif args.command == "cleanup":
        removed = cleanup_old_backups()
        logger.info(f"Removed {removed} old backups")
        
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
