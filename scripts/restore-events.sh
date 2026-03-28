#!/bin/bash
# Restore events from a backup CSV (without id column, auto-increments)
# Usage: ./scripts/restore-events.sh <backup_file> [db_url]
# WARNING: This clears existing events and projections!

BACKUP_FILE="$1"
DB_URL="${2:-postgres://postgres:postgres@localhost:5479/postgres}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file> [db_url]"
  echo ""
  echo "Available backups:"
  ls -la "$(dirname "$0")/../backups/"*.csv 2>/dev/null || echo "  No backups found"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: File not found: $BACKUP_FILE"
  exit 1
fi

echo "This will CLEAR all existing events and projections."
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo "Clearing database..."
psql "$DB_URL" -c "
  DELETE FROM public.events;
  DELETE FROM public.events_streams;
  TRUNCATE users, portfolios, positions, lots, tickers, prices;
  SELECT setval('events_id_seq', 1, false);
" > /dev/null

echo "Preparing events (stripping id column for auto-increment)..."
python3 -c "
import csv, sys
with open('$BACKUP_FILE') as f, open('/tmp/events_restore.csv', 'w', newline='') as out:
    reader = csv.DictReader(f)
    writer = csv.DictWriter(out, fieldnames=['stream','version','name','data','created','meta'])
    writer.writeheader()
    for row in reader:
        writer.writerow({k: row[k] for k in writer.fieldnames})
"

echo "Importing events..."
psql "$DB_URL" -c "\COPY public.events(stream, version, name, data, created, meta) FROM '/tmp/events_restore.csv' WITH CSV HEADER"

rm -f /tmp/events_restore.csv

COUNT=$(psql "$DB_URL" -t -c "SELECT count(*) FROM public.events" | tr -d ' ')
echo "Restored $COUNT events."
echo ""
echo "Restart the server to replay projections via settle()."
