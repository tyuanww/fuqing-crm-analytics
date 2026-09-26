#!/usr/bin/env bash
set -euo pipefail
: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_ROOT:?RELEASE_ROOT is required}"
: "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}"
: "${RELEASE_OWNER:?RELEASE_OWNER must identify the owned DSH service}"
node_bin=${DSH_NODE:-node}
repo=${DSH_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
cd "$repo"
# shellcheck disable=SC2016
exec "$node_bin" --input-type=module -e 'import { activateRelease } from "./scripts/release/promotion.mjs"; const result = await activateRelease({ releaseRoot: process.env.RELEASE_ROOT, tag: process.env.RELEASE_TAG, sourceSha: process.env.RELEASE_SOURCE_SHA, expectedOwner: process.env.RELEASE_OWNER }); console.log(`PROMOTION ${result.status} tag=${result.tag} previous=${result.previous ?? "none"} owner=${process.env.RELEASE_OWNER}`);'
