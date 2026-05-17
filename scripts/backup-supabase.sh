#!/usr/bin/env bash
# backup-supabase.sh — dump quotidien complet de la BDD Supabase.
#
# Usage : bash scripts/backup-supabase.sh
# Voir docs/ops/backup-restore.md pour la mise en place du cron.

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
# Variables attendues (à mettre dans un fichier .env non versionné chargé
# automatiquement par cron ou par le shell de l'utilisateur) :
#   SUPABASE_PROJECT_REF   — la ref du projet (ex: abcdefghijklmnop)
#   SUPABASE_DB_PASSWORD   — mot de passe BDD (Settings → Database)
# Optionnel :
#   BACKUP_DIR             — dossier de destination (défaut: ~/cuniworld-backups)
#   RETENTION_DAYS         — rotation (défaut: 30 jours)

: "${SUPABASE_PROJECT_REF:?manque SUPABASE_PROJECT_REF}"
: "${SUPABASE_DB_PASSWORD:?manque SUPABASE_DB_PASSWORD}"

BACKUP_DIR="${BACKUP_DIR:-$HOME/cuniworld-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE="$(date +%Y-%m-%d)"
DEST="$BACKUP_DIR/cuniworld_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

# ── Dump (schema + data) ───────────────────────────────────────────────────
# On utilise pg_dump direct via la connection string — plus robuste que la
# commande `supabase db dump` qui dépend du CLI à jour côté machine.
CONN="postgresql://postgres.${SUPABASE_PROJECT_REF}:${SUPABASE_DB_PASSWORD}@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"

echo "[$(date -Iseconds)] Backup vers $DEST"
pg_dump "$CONN" \
  --no-owner \
  --no-privileges \
  --schema=public \
  --schema=auth \
  --schema=storage \
  | gzip -9 > "$DEST"

SIZE=$(du -h "$DEST" | cut -f1)
echo "[$(date -Iseconds)] OK — $SIZE"

# ── Rotation ───────────────────────────────────────────────────────────────
find "$BACKUP_DIR" -name 'cuniworld_*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete

# ── Vérification minimale ──────────────────────────────────────────────────
# Un dump vide est un faux positif silencieux ; on alerte si < 10 ko.
MIN_BYTES=10240
ACTUAL_BYTES=$(stat -c%s "$DEST" 2>/dev/null || stat -f%z "$DEST")
if [ "$ACTUAL_BYTES" -lt "$MIN_BYTES" ]; then
  echo "[$(date -Iseconds)] ERREUR — dump suspect (< 10 ko), à investiguer." >&2
  exit 1
fi

echo "[$(date -Iseconds)] Backup quotidien terminé avec succès."
