#!/bin/bash
# Database backup script for PostgreSQL
# Usage: ./backup_db.sh [backup_directory]

set -e

BACKUP_DIR="${1:-/var/backups/flurai}"
DB_NAME="${DB_NAME:-flurai}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/flurai_${TIMESTAMP}.sql.gz"

# Perform backup
echo "Starting database backup..."
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_FILE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup completed successfully: $BACKUP_FILE"
    
    # Keep only last 30 days of backups
    find "$BACKUP_DIR" -name "flurai_*.sql.gz" -mtime +30 -delete
    
    # Get backup size
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup size: $BACKUP_SIZE"
else
    echo "Backup failed!"
    exit 1
fi
