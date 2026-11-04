#!/usr/bin/env bash
set -euo pipefail

# Restore a verified DuckDB backup to a fresh path. Never overwrites a live
# database: the caller promotes the restored file after checking it.
if [ "${1:-}" != --service-stopped ]; then
  printf 'usage: restore-duckdb.sh --service-stopped /absolute/backup/root /absolute/restore/target.duckdb\n' >&2
  exit 2
fi
BACKUP_ROOT=${2:-}
TARGET=${3:-}
DB_NAME=${DUCKDB_FILE_NAME:-fuqing_crm.duckdb}

die() { printf 'restore-duckdb: %s\n' "$*" >&2; exit 2; }

[ -n "$BACKUP_ROOT" ] || die "backup root is required"
[ -n "$TARGET" ] || die "target path is required"
case "$BACKUP_ROOT" in /*) ;; *) die "backup root must be absolute" ;; esac
case "$TARGET" in /*) ;; *) die "target must be absolute" ;; esac

backup_file="$BACKUP_ROOT/$DB_NAME"
sum_file="$backup_file.sha256"
[ -f "$backup_file" ] || die "backup file not found"
[ -f "$sum_file" ] || die "backup checksum not found"
[ ! -e "$TARGET" ] || die "target already exists; restore to a fresh path"
[ ! -e "$TARGET.wal" ] || die "target WAL exists; stop the writer before restore"
target_dir=$(dirname "$TARGET")
[ -d "$target_dir" ] || die "target directory does not exist"

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    die "sha256sum or shasum is required"
  fi
}

expected=$(awk 'NR==1 {print $1}' "$sum_file")
[ -n "$expected" ] || die "backup checksum file is empty"
[ "$(hash_file "$backup_file")" = "$expected" ] || die "backup checksum mismatch"

need_kib=$(( ($(wc -c < "$backup_file") + 1023) / 1024 ))
available_kib=$(df -Pk "$target_dir" | awk 'NR==2 {print $4}')
[ "$available_kib" -ge "$need_kib" ] || die "not enough free space under target directory"

command -v rsync >/dev/null 2>&1 || die "rsync is required"
rsync --archive --sparse --partial "$backup_file" "$TARGET"
[ "$(hash_file "$TARGET")" = "$expected" ] || die "restored file checksum mismatch"

printf 'restore-duckdb: OK target=%s sha256=%s\n' "$TARGET" "$expected"
