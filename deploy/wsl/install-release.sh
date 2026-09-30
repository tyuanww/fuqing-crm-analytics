#!/usr/bin/env bash
set -euo pipefail

# Artifact-only receive. It never runs git pull or compiles on the host.
: "${RELEASE_ARTIFACT:?RELEASE_ARTIFACT must point at the immutable tarball}"
: "${RELEASE_UPSTREAM_RUNTIME:?RELEASE_UPSTREAM_RUNTIME must point at the immutable upstream runtime bundle}"
: "${RELEASE_MANIFEST:?RELEASE_MANIFEST must point at the checked manifest}"
: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_ROOT:?RELEASE_ROOT is required}"
: "${RELEASE_STATE_PATH:?RELEASE_STATE_PATH must point at the durable release journal}"
: "${RELEASE_OWNER:?RELEASE_OWNER must identify the owned DSH service}"
: "${RELEASE_RESTART_DEPENDENCY:?RELEASE_RESTART_DEPENDENCY must identify the restart dependency}"
: "${RELEASE_PUBLICATION:?RELEASE_PUBLICATION must point at PUBLISHED_VERIFIED publication sidecar}"
: "${RELEASE_SHA256SUMS:?RELEASE_SHA256SUMS must point at the checked SHA256SUMS}"
: "${RELEASE_EVIDENCE_INDEX:?RELEASE_EVIDENCE_INDEX must point at the checked CI evidence index}"
: "${RELEASE_ATTESTATION_BUNDLE:?RELEASE_ATTESTATION_BUNDLE must point at the downloaded GitHub attestation bundle}"
: "${RELEASE_GITHUB_REPO:?RELEASE_GITHUB_REPO must bind the attestation to the repository}"
: "${RELEASE_SOURCE_REF:?RELEASE_SOURCE_REF must bind the attestation to the reviewed ref}"
: "${RELEASE_RUNTIME_ATTESTATION_BUNDLE:?RELEASE_RUNTIME_ATTESTATION_BUNDLE must point at the upstream runtime attestation bundle}"
node_bin=${DSH_NODE:-node}
repo=${DSH_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
cd "$repo"
exec "$node_bin" "$repo/scripts/release/host-control.mjs" install
