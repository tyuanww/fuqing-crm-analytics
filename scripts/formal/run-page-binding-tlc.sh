#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
JAR_PATH="${TLA_TOOLS_JAR:-$ROOT_DIR/.context/formal-tools/tla2tools-1.7.4.jar}"
EXPECTED_SHA256="936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"

if [[ ! -f "$JAR_PATH" ]]; then
  printf 'TLA+ TLC 未找到：%s\n下载 v1.7.4 tla2tools.jar 后重试。\n' "$JAR_PATH" >&2
  exit 2
fi

actual_sha256="$(shasum -a 256 "$JAR_PATH" | awk '{print $1}')"
if [[ "$actual_sha256" != "$EXPECTED_SHA256" ]]; then
  printf 'TLA+ TLC SHA-256 不匹配：期望 %s，实际 %s\n' "$EXPECTED_SHA256" "$actual_sha256" >&2
  exit 2
fi

JAVA_BIN="${JAVA_BIN:-java}"
TLA_DIR="$ROOT_DIR/scripts/formal/tla"
cd "$TLA_DIR"
exec "$JAVA_BIN" -cp "$JAR_PATH" tlc2.TLC -terse -workers 1 -config PageBindingInvariant.cfg PageBindingInvariant.tla
