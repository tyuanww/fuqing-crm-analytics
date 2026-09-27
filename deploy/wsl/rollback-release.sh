#!/usr/bin/env bash
set -euo pipefail
: "${RELEASE_ROOT:?RELEASE_ROOT is required}"
: "${RELEASE_OWNER:?RELEASE_OWNER must identify the owned DSH service}"
: "${RELEASE_RESTART_DEPENDENCY:?RELEASE_RESTART_DEPENDENCY must identify the restart dependency}"
node_bin=${DSH_NODE:-node}
repo=${DSH_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
cd "$repo"
# shellcheck disable=SC2016
exec "$node_bin" --input-type=module -e 'import { rollbackRelease } from "./scripts/release/promotion.mjs"; const result = await rollbackRelease({ releaseRoot: process.env.RELEASE_ROOT, expectedOwner: process.env.RELEASE_OWNER, expectedRestartDependency: process.env.RELEASE_RESTART_DEPENDENCY }); console.log(`PROMOTION ${result.status} target=${result.target} owner=${process.env.RELEASE_OWNER} restart_dependency=${process.env.RELEASE_RESTART_DEPENDENCY}`);'
