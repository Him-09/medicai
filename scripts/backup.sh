#!/bin/bash
# scripts/backup.sh
# Encrypted database backup script for MedicAI
# Creates GPG-encrypted PostgreSQL backups with retention management
#
# Prerequisites:
#   - gpg installed with symmetric encryption
#   - PostgreSQL client tools (pg_dump)
#   - Environment variables or .env file with DB credentials
#
# Usage:
#   ./scripts/backup.sh                    # Interactive backup
#   ./scripts/backup.sh --scheduled        # For cron jobs (no prompts)
#   ./scripts/backup.sh --restore <file>   # Restore from backup
#
# Environment variables:
#   POSTGRES_HOST - Database host (default: localhost)
#   POSTGRES_PORT - Database port (default: 5432)
#   POSTGRES_DB   - Database name (default: medicai)
#   POSTGRES_USER - Database user (default: postgres)
#   PGPASSWORD    - Database password
#   BACKUP_DIR    - Backup directory (default: ./backups)
#   BACKUP_ENCRYPTION_KEY - GPG passphrase for encryption
#   BACKUP_RETENTION_DAYS - Days to keep backups (default: 30)

set -e  # Exit on error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env if exists
if [ -f "$PROJECT_DIR/.env" ]; then
    source "$PROJECT_DIR/.env"
fi

# Database settings
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-medicai}"
DB_USER="${POSTGRES_USER:-postgres}"

# Backup settings
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="medicai_backup_${DATE}.sql"
ENCRYPTED_FILE="${BACKUP_FILE}.gpg"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump not found. Install PostgreSQL client tools."
        exit 1
    fi
    
    if ! command -v gpg &> /dev/null; then
        log_error "gpg not found. Install GnuPG."
        exit 1
    fi
    
    if [ -z "$PGPASSWORD" ]; then
        log_error "PGPASSWORD environment variable not set."
        exit 1
    fi
    
    if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
        log_error "BACKUP_ENCRYPTION_KEY environment variable not set."
        log_error "Generate a strong passphrase and set it in your .env file."
        exit 1
    fi
    
    log_info "Prerequisites OK"
}

# Create backup
create_backup() {
    log_info "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    
    log_info "Starting database backup..."
    log_info "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
    
    # Create SQL dump with compression
    pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -F c \
        -Z 9 \
        -f "$BACKUP_DIR/$BACKUP_FILE"
    
    if [ $? -ne 0 ]; then
        log_error "pg_dump failed!"
        exit 1
    fi
    
    log_info "Database dump created: $BACKUP_FILE"
    
    # Encrypt the backup
    log_info "Encrypting backup..."
    echo "$BACKUP_ENCRYPTION_KEY" | gpg \
        --batch \
        --yes \
        --passphrase-fd 0 \
        --symmetric \
        --cipher-algo AES256 \
        -o "$BACKUP_DIR/$ENCRYPTED_FILE" \
        "$BACKUP_DIR/$BACKUP_FILE"
    
    if [ $? -ne 0 ]; then
        log_error "Encryption failed!"
        rm -f "$BACKUP_DIR/$BACKUP_FILE"
        exit 1
    fi
    
    # Remove unencrypted backup
    rm -f "$BACKUP_DIR/$BACKUP_FILE"
    
    # Calculate checksum
    CHECKSUM=$(sha256sum "$BACKUP_DIR/$ENCRYPTED_FILE" | cut -d' ' -f1)
    echo "$CHECKSUM  $ENCRYPTED_FILE" > "$BACKUP_DIR/${ENCRYPTED_FILE}.sha256"
    
    log_info "Encrypted backup created: $ENCRYPTED_FILE"
    log_info "Checksum: $CHECKSUM"
    
    # Get backup size
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/$ENCRYPTED_FILE" | cut -f1)
    log_info "Backup size: $BACKUP_SIZE"
}

# Clean old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."
    
    find "$BACKUP_DIR" -name "medicai_backup_*.gpg" -type f -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "medicai_backup_*.sha256" -type f -mtime +$RETENTION_DAYS -delete
    
    # Count remaining backups
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "medicai_backup_*.gpg" -type f | wc -l)
    log_info "Remaining backups: $BACKUP_COUNT"
}

# Restore from backup
restore_backup() {
    RESTORE_FILE="$1"
    
    if [ ! -f "$RESTORE_FILE" ]; then
        log_error "Backup file not found: $RESTORE_FILE"
        exit 1
    fi
    
    log_warn "This will OVERWRITE the database: $DB_NAME"
    read -p "Are you sure you want to continue? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        log_info "Restore cancelled."
        exit 0
    fi
    
    # Verify checksum if available
    CHECKSUM_FILE="${RESTORE_FILE}.sha256"
    if [ -f "$CHECKSUM_FILE" ]; then
        log_info "Verifying checksum..."
        if sha256sum -c "$CHECKSUM_FILE" &> /dev/null; then
            log_info "Checksum OK"
        else
            log_error "Checksum verification failed!"
            exit 1
        fi
    fi
    
    # Decrypt backup
    TEMP_FILE=$(mktemp)
    log_info "Decrypting backup..."
    
    echo "$BACKUP_ENCRYPTION_KEY" | gpg \
        --batch \
        --yes \
        --passphrase-fd 0 \
        -d "$RESTORE_FILE" > "$TEMP_FILE"
    
    if [ $? -ne 0 ]; then
        log_error "Decryption failed!"
        rm -f "$TEMP_FILE"
        exit 1
    fi
    
    # Restore database
    log_info "Restoring database..."
    pg_restore \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --clean \
        --if-exists \
        "$TEMP_FILE"
    
    RESTORE_STATUS=$?
    
    # Clean up temp file
    rm -f "$TEMP_FILE"
    
    if [ $RESTORE_STATUS -ne 0 ]; then
        log_error "Restore completed with warnings (this is often normal)"
    else
        log_info "Restore completed successfully!"
    fi
}

# List available backups
list_backups() {
    log_info "Available backups in $BACKUP_DIR:"
    echo ""
    
    if [ -d "$BACKUP_DIR" ]; then
        ls -lh "$BACKUP_DIR"/*.gpg 2>/dev/null || echo "No backups found."
    else
        echo "Backup directory does not exist."
    fi
}

# Main
main() {
    case "${1:-}" in
        --scheduled)
            # Scheduled backup (no prompts)
            check_prerequisites
            create_backup
            cleanup_old_backups
            ;;
        --restore)
            if [ -z "${2:-}" ]; then
                log_error "Please specify backup file to restore"
                exit 1
            fi
            check_prerequisites
            restore_backup "$2"
            ;;
        --list)
            list_backups
            ;;
        --help|-h)
            echo "MedicAI Encrypted Backup Script"
            echo ""
            echo "Usage:"
            echo "  $0              - Interactive backup"
            echo "  $0 --scheduled  - Automated backup (for cron)"
            echo "  $0 --restore <file> - Restore from backup"
            echo "  $0 --list       - List available backups"
            echo "  $0 --help       - Show this help"
            ;;
        *)
            # Interactive backup
            check_prerequisites
            log_info "Starting MedicAI backup..."
            create_backup
            cleanup_old_backups
            log_info "Backup completed successfully!"
            ;;
    esac
}

main "$@"
