#!/usr/bin/env bash
set -euo pipefail

# Artifact-only receive. It never runs git pull or compiles on the host.
: "${RELEASE_ARTIFACT:?RELEASE_ARTIFACT must point at the immutable tarball}"
: "${RELEASE_UPSTREAM_RUNTIME:?RELEASE_UPSTREAM_RUNTIME must point at the immutable upstream runtime bundle}"
: "${RELEASE_MANIFEST:?RELEASE_MANIFEST must point at the checked manifest}"
: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_ROOT:?RELEASE_ROOT is required}"
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
# shellcheck disable=SC2016
exec "$node_bin" --input-type=module -e 'import { installRelease } from "./scripts/release/promotion.mjs"; const result = await installRelease({ artifact: process.env.RELEASE_ARTIFACT, upstreamRuntimeArtifact: process.env.RELEASE_UPSTREAM_RUNTIME, manifestPath: process.env.RELEASE_MANIFEST, releaseRoot: process.env.RELEASE_ROOT, tag: process.env.RELEASE_TAG, owner: process.env.RELEASE_OWNER, restartDependency: process.env.RELEASE_RESTART_DEPENDENCY, publicationPath: process.env.RELEASE_PUBLICATION, sumsPath: process.env.RELEASE_SHA256SUMS, evidenceIndexPath: process.env.RELEASE_EVIDENCE_INDEX, attestationBundlePath: process.env.RELEASE_ATTESTATION_BUNDLE, runtimeAttestationBundlePath: process.env.RELEASE_RUNTIME_ATTESTATION_BUNDLE, repository: process.env.RELEASE_GITHUB_REPO, sourceRef: process.env.RELEASE_SOURCE_REF, signerWorkflow: process.env.RELEASE_SIGNER_WORKFLOW || null }); console.log(`PROMOTION ${result.status} tag=${result.tag} path=${result.path} owner=${process.env.RELEASE_OWNER} restart_dependency=${process.env.RELEASE_RESTART_DEPENDENCY}`);'
