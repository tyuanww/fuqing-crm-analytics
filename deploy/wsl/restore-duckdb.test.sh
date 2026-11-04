#!/usr/bin/env bash
set -euo pipefail

# Synthetic drill for restore-duckdb.sh. It never touches a real DuckDB file.
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
script="$(cd "$(dirname "$0")" && pwd)/restore-duckdb.sh"

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

backup="$root/backup"
restore="$root/restore"
mkdir -p "$backup" "$restore"
head -c 8192 /dev/urandom > "$backup/fuqing_crm.duckdb"
(cd "$backup" && sha256sum fuqing_crm.duckdb > fuqing_crm.duckdb.sha256)

"$script" --service-stopped "$backup" "$restore/fuqing_crm.duckdb" >/dev/null
[ "$(hash_file "$backup/fuqing_crm.duckdb")" = "$(hash_file "$restore/fuqing_crm.duckdb")" ] \
  || { printf 'restore-drill: hash mismatch\n' >&2; exit 1; }

if "$script" --service-stopped "$backup" "$restore/fuqing_crm.duckdb" >/dev/null 2>&1; then
  printf 'restore-drill: existing target was overwritten\n' >&2
  exit 1
fi

bad="$root/bad"
mkdir -p "$bad"
head -c 4096 /dev/urandom > "$bad/fuqing_crm.duckdb"
(cd "$bad" && sha256sum fuqing_crm.duckdb > fuqing_crm.duckdb.sha256)
printf 'corrupt' >> "$bad/fuqing_crm.duckdb"
if "$script" --service-stopped "$bad" "$root/bad-target.duckdb" >/dev/null 2>&1; then
  printf 'restore-drill: checksum mismatch was accepted\n' >&2
  exit 1
fi

missing="$root/missing"
mkdir -p "$missing"
head -c 1024 /dev/urandom > "$missing/fuqing_crm.duckdb"
if "$script" --service-stopped "$missing" "$root/missing-target.duckdb" >/dev/null 2>&1; then
  printf 'restore-drill: missing checksum was accepted\n' >&2
  exit 1
fi

printf 'restore-drill: OK\n'
