#!/usr/bin/env bash
set -euo pipefail

# Synthetic drill for prune-duckdb-backups.sh. It only creates and removes
# directories under a temporary root.
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
script="$(cd "$(dirname "$0")" && pwd)/prune-duckdb-backups.sh"

for day in 01 02 03 04 05 06 07 08; do
  mkdir -p "$root/202601${day}T000000Z"
done
mkdir -p "$root/notes"

"$script" "$root" 6 >/dev/null
remaining=$(find "$root" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' | wc -l | tr -d ' ')
[ "$remaining" = "6" ] || { printf 'prune-drill: expected 6 snapshots, got %s\n' "$remaining" >&2; exit 1; }
[ -d "$root/notes" ] || { printf 'prune-drill: non-snapshot directory was removed\n' >&2; exit 1; }
[ -d "$root/20260103T000000Z" ] || { printf 'prune-drill: oldest kept snapshot is missing\n' >&2; exit 1; }
[ ! -d "$root/20260102T000000Z" ] || { printf 'prune-drill: oldest snapshot was not removed\n' >&2; exit 1; }

before=$(find "$root" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' | wc -l | tr -d ' ')
"$script" --dry-run "$root" 1 >/dev/null
after=$(find "$root" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' | wc -l | tr -d ' ')
[ "$before" = "$after" ] || { printf 'prune-drill: dry run removed snapshots\n' >&2; exit 1; }

if "$script" "$root" 0 >/dev/null 2>&1; then
  printf 'prune-drill: zero keep count was accepted\n' >&2
  exit 1
fi

printf 'prune-drill: OK\n'
