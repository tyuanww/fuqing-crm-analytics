#!/usr/bin/env bash
set -euo pipefail
: "${RELEASE_ROOT:?RELEASE_ROOT is required}"
: "${RELEASE_STATE_PATH:?RELEASE_STATE_PATH must point at the durable release journal}"
: "${RELEASE_OWNER:?RELEASE_OWNER must identify the owned DSH service}"
: "${RELEASE_RESTART_DEPENDENCY:?RELEASE_RESTART_DEPENDENCY must identify the restart dependency}"
node_bin=${DSH_NODE:-node}
repo=${DSH_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
cd "$repo"
exec "$node_bin" "$repo/scripts/release/host-control.mjs" rollback
