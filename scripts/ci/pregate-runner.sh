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

if [ "${#node_files[@]}" -gt 0 ]; then
  node --test --test-concurrency=1 "${node_files[@]}" || status=1
fi

if [ "${#python_files[@]}" -gt 0 ]; then
  repo_root=$(git rev-parse --show-toplevel)
  PYTHONPATH="${repo_root}${PYTHONPATH:+:${PYTHONPATH}}" \
    python3 -m pytest -q "${python_files[@]}" || status=1
fi

exit "$status"
