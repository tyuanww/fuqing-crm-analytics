#!/usr/bin/env bash
# Run the file set selected by gstack-pregate with this repository's two native
# runners. Keep each language in one process so Node and pytest startup costs do
# not scale with the selected file count.
set -uo pipefail

node_files=()
python_files=()
status=0

for file in "$@"; do
  case "$file" in
    *.mjs|*.js|*.cjs) node_files+=("$file") ;;
    *.py) python_files+=("$file") ;;
    *)
      echo "unsupported pregate test file: $file" >&2
      status=1
      ;;
  esac
done

repo_root=$(git rev-parse --show-toplevel)
# This local gate pins the supported runtime series. The exact patch release is
# supplied by the caller environment and retained in its evidence receipt.
if [ "${#node_files[@]}" -gt 0 ]; then
  node_bin="${PREGATE_NODE:-${DSH_DEV_NODE:-}}"
  if [ -z "${node_bin}" ]; then
    node_bin=$(command -v node 2>/dev/null || true)
  fi
  [ -n "${node_bin}" ] && [ -x "${node_bin}" ] \
    || { echo 'PREGATE_NODE_REQUIRED: set PREGATE_NODE or DSH_DEV_NODE to Node 24' >&2; exit 2; }
  node_major=$("${node_bin}" -p 'process.versions.node.split(".")[0]' 2>/dev/null) \
    || { echo 'PREGATE_NODE_VERSION_UNAVAILABLE' >&2; exit 2; }
  [ "${node_major}" = "24" ] \
    || { echo "PREGATE_NODE_VERSION: expected 24.x, got ${node_major}.x" >&2; exit 2; }
fi

if [ "${#python_files[@]}" -gt 0 ]; then
  python_bin="${PREGATE_PYTHON:-${FQ_B0_PYTHON:-}}"
  if [ -z "${python_bin}" ]; then
    python_bin=$(command -v python3 2>/dev/null || true)
  fi
  [ -n "${python_bin}" ] && [ -x "${python_bin}" ] \
    || { echo 'PREGATE_PYTHON_REQUIRED: set PREGATE_PYTHON or FQ_B0_PYTHON to Python 3.14' >&2; exit 2; }
  python_version=$("${python_bin}" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null) \
    || { echo 'PREGATE_PYTHON_VERSION_UNAVAILABLE' >&2; exit 2; }
  [ "${python_version}" = "3.14" ] \
    || { echo "PREGATE_PYTHON_VERSION: expected 3.14, got ${python_version}" >&2; exit 2; }
fi

if [ "${#node_files[@]}" -gt 0 ]; then
  "${node_bin}" --test --test-concurrency=1 "${node_files[@]}" || status=1
fi

if [ "${#python_files[@]}" -gt 0 ]; then
  PYTHONPATH="${repo_root}${PYTHONPATH:+:${PYTHONPATH}}" \
    "${python_bin}" -m pytest -q "${python_files[@]}" || status=1
fi

exit "$status"
