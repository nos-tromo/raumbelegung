#!/bin/sh
# Tägliches Datenbank-Backup: pg_dump direkt in ein verschlüsseltes restic-Repository.
# Benötigt aus .env: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
#                    RESTIC_REPOSITORY, RESTIC_PASSWORD (+ AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY bei S3)
set -eu

export PGPASSWORD="$POSTGRES_PASSWORD"

# Repository beim ersten Lauf anlegen.
if ! restic cat config >/dev/null 2>&1; then
  echo "restic-Repository wird initialisiert …"
  restic init
fi

echo "Backup startet: $(date -Iseconds)"
pg_dump -h "${PGHOST:-db}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner \
  | restic backup --stdin --stdin-filename raumbelegung.dump --tag db

restic forget --tag db --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
restic check --read-data-subset=5%
echo "Backup fertig: $(date -Iseconds)"
