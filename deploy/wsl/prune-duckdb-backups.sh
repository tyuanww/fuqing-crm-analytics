#!/usr/bin/env bash
set -euo pipefail

# Keep the newest dated snapshot directories under a backup root. Only
# directories named YYYYMMDDTHHMMSSZ are candidates; files and other
# directories are never touched.
dry_run=0
if [ "${1:-}" = --dry-run ]; then
  dry_run=1
  shift
fi
root=${1:-}
keep=${2:-}
die() { printf 'prune-duckdb-backups: %s\n' "$*" >&2; exit 2; }

[ -n "$root" ] || die "backup root is required"
[ -n "$keep" ] || die "keep count is required"
case "$root" in /*) ;; *) die "backup root must be absolute" ;; esac
[ -d "$root" ] || die "backup root does not exist"
case "$keep" in ''|*[!0-9]*) die "keep count must be a positive integer" ;; esac
[ "$keep" -ge 1 ] || die "keep count must be a positive integer"

snapshots=()
for entry in "$root"/*/; do
  [ -d "$entry" ] || continue
  name=$(basename "$entry")
  if [[ $name =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
    snapshots+=("$root/$name")
  fi
done

count=${#snapshots[@]}
remove=$((count - keep))
[ "$remove" -gt 0 ] || remove=0

sorted=()
if [ "$count" -gt 0 ]; then
  while IFS= read -r path; do
    sorted+=("$path")
  done < <(printf '%s\n' "${snapshots[@]}" | sort)
fi

removed=0
for ((index = 0; index < remove; index += 1)); do
  target=${sorted[$index]}
  if [ "$dry_run" -eq 1 ]; then
    printf 'prune-duckdb-backups: would remove %s\n' "$target"
  else
    rm -rf -- "$target"
  fi
  removed=$((removed + 1))
done

printf 'prune-duckdb-backups: kept=%d removed=%d dry_run=%d\n' "$((count - removed))" "$removed" "$dry_run"
