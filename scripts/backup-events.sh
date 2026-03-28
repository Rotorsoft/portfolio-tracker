#!/bin/bash
# Backup all events from the portfolio tracker database
# Usage: ./scripts/backup-events.sh [db_url]

DB_URL="${1:-postgres://postgres:postgres@localhost:5479/postgres}"
BACKUP_DIR="$(dirname "$0")/../backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="events_${TIMESTAMP}.csv"

mkdir -p "$BACKUP_DIR"

echo "Backing up events to $BACKUP_DIR/$FILENAME..."

psql "$DB_URL" -c "\COPY (
  SELECT id, stream, version, name, data::text, created, meta::text
  FROM public.events
  ORDER BY id
) TO STDOUT WITH CSV HEADER" > "$BACKUP_DIR/$FILENAME"

COUNT=$(tail -n +2 "$BACKUP_DIR/$FILENAME" | wc -l | tr -d ' ')
echo "Backed up $COUNT events to $BACKUP_DIR/$FILENAME"

# Show event summary
echo ""
echo "Event summary:"
psql "$DB_URL" -c "SELECT name, count(*) FROM public.events GROUP BY name ORDER BY name" --no-align --tuples-only | while IFS='|' read -r name count; do
  printf "  %-25s %s\n" "$name" "$count"
done
