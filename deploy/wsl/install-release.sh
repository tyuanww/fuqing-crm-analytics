#!/usr/bin/env bash
set -euo pipefail

# Artifact-only receive. It never runs git pull or compiles on the host.
: "${RELEASE_ARTIFACT:?RELEASE_ARTIFACT must point at the immutable tarball}"
: "${RELEASE_MANIFEST:?RELEASE_MANIFEST must point at the checked manifest}"
: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_ROOT:?RELEASE_ROOT is required}"
node_bin=${DSH_NODE:-node}
repo=${DSH_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
cd "$repo"
# shellcheck disable=SC2016
exec "$node_bin" --input-type=module -e 'import { installRelease } from "./scripts/release/promotion.mjs"; const result = await installRelease({ artifact: process.env.RELEASE_ARTIFACT, manifestPath: process.env.RELEASE_MANIFEST, releaseRoot: process.env.RELEASE_ROOT, tag: process.env.RELEASE_TAG }); console.log(`PROMOTION ${result.status} tag=${result.tag} path=${result.path}`);'
