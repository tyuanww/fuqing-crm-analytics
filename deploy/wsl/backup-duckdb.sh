#!/usr/bin/env bash
set -euo pipefail

# Refuses a live copy. The caller must stop the backend first and pass the
# explicit acknowledgement. The destination should be another disk, NAS, or
# remote mount, never a directory on the same filesystem.
if [ "${1:-}" != --service-stopped ]; then
  printf 'usage: backup-duckdb.sh --service-stopped /absolute/backup/root\n' >&2
  exit 2
fi
BACKUP_ROOT=${2:-}
DB_PATH=${DUCKDB_PATH:-/srv/shinemage/data/processed/fuqing_crm.duckdb}

die() { printf 'backup-duckdb: %s\n' "$*" >&2; exit 2; }
[ -n "$BACKUP_ROOT" ] || die "backup destination is required"
case "$BACKUP_ROOT" in
  /*) ;;
  *) die "backup destination must be an absolute path" ;;
esac
[ -f "$DB_PATH" ] || die "DuckDB file not found: $DB_PATH"
[ ! -e "${DB_PATH}.wal" ] || die "WAL exists; do not copy until the writer is stopped cleanly"
mkdir -p "$BACKUP_ROOT"

source_device=$(df -P "$DB_PATH" | awk 'NR==2 {print $1}')
backup_device=$(df -P "$BACKUP_ROOT" | awk 'NR==2 {print $1}')
[ "$source_device" != "$backup_device" ] || die "backup destination is on the same filesystem"

command -v rsync >/dev/null 2>&1 || die "rsync is required"
command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required"
rsync --archive --sparse --partial --protect-args "$DB_PATH" "$BACKUP_ROOT/"
sha256sum "$DB_PATH" | awk '{print $1 "  fuqing_crm.duckdb"}' > "$BACKUP_ROOT/fuqing_crm.duckdb.sha256"
(cd "$BACKUP_ROOT" && sha256sum --check fuqing_crm.duckdb.sha256)
printf 'backup-duckdb: OK destination=%s\n' "$BACKUP_ROOT"
