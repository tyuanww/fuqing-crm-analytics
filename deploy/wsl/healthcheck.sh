#!/usr/bin/env bash
set -euo pipefail

API_PORT=${CRM_API_PORT:-18093}
WEB_PORT=${CRM_WEB_PORT:-18094}
DSH_PORT=${DSH_WEB_PORT:-6677}
PAGE_PORT=${PAGE_HTTP_PORT:-18091}

mode=${1:---crm}
case "$mode" in
  --crm)
    curl --fail --silent --show-error "http://127.0.0.1:${API_PORT}/api/v1/health" >/dev/null
    curl --fail --silent --show-error --output /dev/null "http://127.0.0.1:${WEB_PORT}/"
    printf 'healthcheck: CRM OK api=%s web=%s\n' "$API_PORT" "$WEB_PORT"
    ;;
  --all)
    curl --fail --silent --show-error "http://127.0.0.1:${API_PORT}/api/v1/health" >/dev/null
    curl --fail --silent --show-error --output /dev/null "http://127.0.0.1:${WEB_PORT}/"
    curl --silent --output /dev/null --write-out '%{http_code}\n' "http://127.0.0.1:${DSH_PORT}/" | grep -Eq '^(200|401|403)$'
    curl --silent --output /dev/null --write-out '%{http_code}\n' "http://127.0.0.1:${PAGE_PORT}/" | grep -Eq '^(200|401|403|404)$'
    printf 'healthcheck: CRM + DSH/page OK api=%s web=%s dsh=%s page=%s\n' "$API_PORT" "$WEB_PORT" "$DSH_PORT" "$PAGE_PORT"
    ;;
  *)
    printf 'usage: healthcheck.sh [--crm|--all]\n' >&2
    exit 2
    ;;
esac
