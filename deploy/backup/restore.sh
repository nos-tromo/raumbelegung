#!/bin/sh
# Stellt einen Snapshot in die laufende Datenbank wieder her (überschreibt bestehende Objekte!).
#   docker compose -f docker-compose.prod.yml --profile backup run --rm --entrypoint restore.sh backup [SNAPSHOT_ID]
# Ohne SNAPSHOT_ID wird der neueste Snapshot genommen. Vorher das Backend stoppen:
#   docker compose -f docker-compose.prod.yml stop backend
set -eu

export PGPASSWORD="$POSTGRES_PASSWORD"
SNAP="${1:-latest}"

restic snapshots --tag db
echo "Stelle Snapshot '$SNAP' wieder her …"
restic dump --tag db "$SNAP" raumbelegung.dump \
  | pg_restore -h "${PGHOST:-db}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner
echo "Fertig. Backend wieder starten: docker compose -f docker-compose.prod.yml start backend"
