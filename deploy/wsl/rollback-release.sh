#!/usr/bin/env bash
set -euo pipefail
: "${RELEASE_ROOT:?RELEASE_ROOT is required}"
node_bin=${DSH_NODE:-node}
repo=${DSH_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
cd "$repo"
# shellcheck disable=SC2016
exec "$node_bin" --input-type=module -e 'import { rollbackRelease } from "./scripts/release/promotion.mjs"; const result = await rollbackRelease({ releaseRoot: process.env.RELEASE_ROOT }); console.log(`PROMOTION ${result.status} target=${result.target}`);'
