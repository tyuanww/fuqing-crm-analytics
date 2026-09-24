#!/usr/bin/env bash
set -euo pipefail

ROOT=${SHINEMAGE_ROOT:-/srv/shinemage}
DATA_ROOT=${CRM_DATA_ROOT:-$ROOT/data}
MIN_FREE_GIB=${MIN_FREE_GIB:-80}

: "${CRM_ENV_FILE:?CRM_ENV_FILE must point at /etc/shinemage/crm.env}"
: "${SHOP_DATA_SOURCE:?SHOP_DATA_SOURCE must point at the finalized shop source directory}"
: "${MEMBER_DATA_SOURCE:?MEMBER_DATA_SOURCE must point at the finalized member source directory}"

die() { printf 'preflight: %s\n' "$*" >&2; exit 2; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

for command_name in git docker curl sha256sum df; do need "$command_name"; done
[ -d "$ROOT" ] || die "missing root directory: $ROOT"
[ -d "$DATA_ROOT" ] || die "missing finalized data directory: $DATA_ROOT"
[ -f "$CRM_ENV_FILE" ] || die "missing CRM env file: $CRM_ENV_FILE"
[ "$(stat -c '%a' "$CRM_ENV_FILE" 2>/dev/null || stat -f '%Lp' "$CRM_ENV_FILE")" = "600" ] || die "CRM env file must be mode 600"
[ -d "$SHOP_DATA_SOURCE" ] || die "missing shop source directory: $SHOP_DATA_SOURCE"
[ -d "$MEMBER_DATA_SOURCE" ] || die "missing member source directory: $MEMBER_DATA_SOURCE"
case "$DATA_ROOT" in
  /*) ;;
  *) die "CRM_DATA_ROOT must be an absolute path" ;;
esac

case "$DATA_ROOT" in
  /mnt/*|/home/*/mnt/*) die "data must live on the WSL Linux filesystem, not /mnt/*" ;;
esac

available_kib=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
available_gib=$((available_kib / 1024 / 1024))
[ "$available_gib" -ge "$MIN_FREE_GIB" ] || die "only ${available_gib}GiB free under $ROOT; need at least ${MIN_FREE_GIB}GiB"

docker info >/dev/null || die "Docker daemon is not reachable"
docker compose version >/dev/null || die "Docker Compose is not available"

for candidate in "$ROOT/incoming" "$DATA_ROOT"; do
  if [ -d "$candidate" ] && find "$candidate" -type f -name '*.duckdb.wal' -print -quit | grep -q .; then
    die "a DuckDB WAL exists under $candidate; stop the writer before promotion or backup"
  fi
done

printf 'preflight: OK root=%s data=%s free=%sGiB\n' "$ROOT" "$DATA_ROOT" "$available_gib"
