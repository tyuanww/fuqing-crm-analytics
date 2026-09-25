#!/usr/bin/env bash
set -euo pipefail

# Run the local DSH helper with the pinned major without changing the user's
# global Node installation. DSH_DEV_NODE may point to another approved Node 24
# binary on a different Mac or CI runner.
ROOT_DIR="$(cd -- "$(dirname -- "$0")/../.." && pwd -P)"

is_node24() {
  [ -x "$1" ] || return 1
  [ "$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null)" = "24" ]
}

NODE24="${DSH_DEV_NODE:-}"
if ! is_node24 "$NODE24"; then
  NODE24=""
  for candidate in \
    "$ROOT_DIR/.context/node/bin/node" \
    "$HOME/homebrew/opt/node@24/bin/node" \
    "/opt/homebrew/opt/node@24/bin/node"; do
    if is_node24 "$candidate"; then
      NODE24="$candidate"
      break
    fi
  done
fi

if [ -z "$NODE24" ]; then
  if command -v node >/dev/null 2>&1 && is_node24 "$(command -v node)"; then
    NODE24=$(command -v node)
  fi
fi

if [ -z "$NODE24" ]; then
  cat >&2 <<'EOF'
DSH_DEV_NODE24_MISSING: this helper requires Node 24.
Install or expose an approved Node 24 binary, then retry. Examples:
  export DSH_DEV_NODE=/absolute/path/to/node24
  ./scripts/dsh-dev/run.sh diagnose
EOF
  exit 2
fi

case "${1:-}" in
  probe)
    shift
    exec "$NODE24" "$ROOT_DIR/scripts/dsh-dev/probe.mjs" "$@"
    ;;
  board-model-preflight)
    shift
    exec "$NODE24" "$ROOT_DIR/scripts/dsh-dev/board-model-preflight.mjs" "$@"
    ;;
  *)
    exec "$NODE24" "$ROOT_DIR/scripts/dsh-dev/cli.mjs" "$@"
    ;;
esac
