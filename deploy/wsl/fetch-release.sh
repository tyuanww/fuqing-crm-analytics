#!/usr/bin/env bash
set -euo pipefail

# Download an immutable release on the host. Tailscale stays in the control
# plane; large assets come directly from GitHub and are verified before install.
: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_REPO:?RELEASE_REPO must be owner/repository}"
: "${RELEASE_PUBLICATION:?RELEASE_PUBLICATION must point at the verified sidecar}"

RELEASE_INCOMING=${RELEASE_INCOMING:-/srv/shinemage/incoming/${RELEASE_TAG}}
RELEASE_BASE_URL=${RELEASE_BASE_URL:-https://github.com/${RELEASE_REPO}/releases/download/${RELEASE_TAG}}
RELEASE_ATTEMPTS=${RELEASE_ATTEMPTS:-5}
RELEASE_RETRY_DELAY=${RELEASE_RETRY_DELAY:-3}
RELEASE_CONNECT_TIMEOUT=${RELEASE_CONNECT_TIMEOUT:-15}
RELEASE_MAX_TIME=${RELEASE_MAX_TIME:-3600}
RELEASE_SOURCE_SHA=${RELEASE_SOURCE_SHA:-}

die() { echo "RELEASE_FETCH_ERROR $*" >&2; exit 2; }
need() { command -v "$1" >/dev/null 2>&1 || die "RELEASE_FETCH_DEPENDENCY_MISSING $1"; }
need curl
need python3

[[ "$RELEASE_TAG" =~ ^dsh-[A-Za-z0-9._-]+$ ]] || die "RELEASE_TAG_INVALID"
[[ "$RELEASE_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "RELEASE_REPO_INVALID"
[[ "$RELEASE_INCOMING" != *$'\n'* && "$RELEASE_INCOMING" != *$'\r'* ]] || die "RELEASE_INCOMING_INVALID"
[[ "$RELEASE_BASE_URL" =~ ^https://github\.com/[^/[:space:]]+/[^/[:space:]]+/releases/download/[^/[:space:]]+$ || "$RELEASE_BASE_URL" =~ ^https?://127\.0\.0\.1:[0-9]+(/[^[:space:]]*)?$ ]] || die "RELEASE_BASE_URL_INVALID"
[[ "$RELEASE_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || die "RELEASE_ATTEMPTS_INVALID"
[[ "$RELEASE_RETRY_DELAY" =~ ^[0-9]+$ ]] || die "RELEASE_RETRY_DELAY_INVALID"

mkdir -p "$RELEASE_INCOMING"
chmod 0750 "$RELEASE_INCOMING"

file_size() {
  python3 - "$1" <<'PY'
import pathlib, sys
print(pathlib.Path(sys.argv[1]).stat().st_size)
PY
}

sha256_file() {
  python3 - "$1" <<'PY'
import hashlib, sys
h = hashlib.sha256()
with open(sys.argv[1], "rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        h.update(chunk)
print(h.hexdigest())
PY
}

# The small publication sidecar pins the exact six Release assets before any
# large download. It is supplied through the Tailscale control plane.
assets=()
asset_lines=$(mktemp "$RELEASE_INCOMING/.publication-assets.XXXXXX")
trap 'rm -f "$asset_lines"' EXIT
python3 - "$RELEASE_PUBLICATION" "$RELEASE_TAG" "$RELEASE_SOURCE_SHA" > "$asset_lines" <<'PY'
import json, pathlib, re, sys

path, expected_tag, expected_source = sys.argv[1:]
try:
    publication = json.loads(pathlib.Path(path).read_text())
except Exception as exc:
    raise SystemExit(f"RELEASE_PUBLICATION_INVALID {exc}")
if publication.get("schema_version") != "release-publication/v1":
    raise SystemExit("RELEASE_PUBLICATION_SCHEMA_INVALID")
if publication.get("status") != "PUBLISHED_VERIFIED" or publication.get("draft") is not False or publication.get("immutable") is not True:
    raise SystemExit("RELEASE_PUBLICATION_NOT_VERIFIED")
if publication.get("release_tag") != expected_tag or publication.get("protected_ref") != f"refs/tags/{expected_tag}":
    raise SystemExit("RELEASE_PUBLICATION_TAG_MISMATCH")
source = publication.get("source_sha")
if not re.fullmatch(r"[0-9a-f]{40}", source or "") or publication.get("reviewed_sha") != source or publication.get("ref_target_sha") != source:
    raise SystemExit("RELEASE_PUBLICATION_SOURCE_INVALID")
if expected_source and expected_source != source:
    raise SystemExit("RELEASE_PUBLICATION_SOURCE_MISMATCH")
required_fixed = {
    f"{expected_tag}.tar.zst",
    "pre-manifest.v1.json",
    "release-manifest.v1.json",
    "SHA256SUMS",
    "ci-evidence-index.v1.json",
}
assets = publication.get("assets")
if not isinstance(assets, list):
    raise SystemExit("RELEASE_PUBLICATION_ASSET_SET_INVALID")
asset_names = {item.get("name") for item in assets}
runtime_names = {name for name in asset_names if re.fullmatch(r"shinemage-dsh-upstream-runtime-[0-9a-f]{40}\.tar\.zst", name or "")}
if asset_names != required_fixed | runtime_names or len(runtime_names) != 1:
    raise SystemExit("RELEASE_PUBLICATION_ASSET_SET_INVALID")
by_name = {}
for item in assets:
    name = item.get("name")
    digest = item.get("sha256")
    size = item.get("size")
    if not isinstance(name, str) or name != pathlib.PurePosixPath(name).name or not re.fullmatch(r"[A-Za-z0-9._-]+", name):
        raise SystemExit("RELEASE_PUBLICATION_ASSET_NAME_INVALID")
    if not re.fullmatch(r"[0-9a-f]{64}", digest or "") or not isinstance(size, int) or size <= 0:
        raise SystemExit(f"RELEASE_PUBLICATION_ASSET_METADATA_INVALID {name}")
    if name in by_name:
        raise SystemExit(f"RELEASE_PUBLICATION_ASSET_DUPLICATE {name}")
    by_name[name] = (digest, size)
for name in sorted(required_fixed | runtime_names):
    digest, size = by_name[name]
    print(f"{name}\t{digest}\t{size}")
PY
while IFS= read -r line; do
  assets+=("$line")
done < "$asset_lines"

[[ "${#assets[@]}" -eq 6 ]] || die "RELEASE_PUBLICATION_ASSET_COUNT_INVALID"

download_one() {
  local name="$1" expected_sha="$2" expected_size="$3"
  local final="$RELEASE_INCOMING/$name" partial="$RELEASE_INCOMING/.${name}.partial"
  if [[ -e "$final" ]]; then
    [[ -f "$final" ]] || die "RELEASE_ASSET_PATH_INVALID $name"
    local existing_size existing_sha
    existing_size=$(file_size "$final")
    existing_sha=$(sha256_file "$final")
    if [[ "$existing_size" == "$expected_size" && "$existing_sha" == "$expected_sha" ]]; then
      echo "RELEASE_FETCH_REUSED name=$name bytes=$existing_size sha256=$existing_sha"
      return
    fi
    die "RELEASE_ASSET_CONFLICT $name"
  fi
  if [[ -f "$partial" ]]; then
    local partial_size partial_sha
    partial_size=$(file_size "$partial")
    if [[ "$partial_size" == "$expected_size" ]]; then
      partial_sha=$(sha256_file "$partial")
      if [[ "$partial_sha" == "$expected_sha" ]]; then
        mv -f "$partial" "$final"
        echo "RELEASE_FETCH_RECOVERED name=$name bytes=$partial_size sha256=$partial_sha"
        return
      fi
    fi
  fi
  local url="${RELEASE_BASE_URL%/}/$name"
  echo "RELEASE_FETCH_DOWNLOAD name=$name expected_bytes=$expected_size"
  if ! curl --fail --location --retry "$RELEASE_ATTEMPTS" --retry-delay "$RELEASE_RETRY_DELAY" \
    --retry-all-errors --connect-timeout "$RELEASE_CONNECT_TIMEOUT" --max-time "$RELEASE_MAX_TIME" \
    --continue-at - --output "$partial" "$url"; then
    die "RELEASE_DOWNLOAD_FAILED $name"
  fi
  local actual_size actual_sha
  actual_size=$(file_size "$partial")
  actual_sha=$(sha256_file "$partial")
  [[ "$actual_size" == "$expected_size" ]] || die "RELEASE_ASSET_SIZE_MISMATCH $name expected=$expected_size actual=$actual_size"
  [[ "$actual_sha" == "$expected_sha" ]] || die "RELEASE_ASSET_DIGEST_MISMATCH $name expected=$expected_sha actual=$actual_sha"
  mv -f "$partial" "$final"
  echo "RELEASE_FETCH_VERIFIED name=$name bytes=$actual_size sha256=$actual_sha"
}

started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
for line in "${assets[@]}"; do
  IFS=$'\t' read -r name digest size <<< "$line"
  download_one "$name" "$digest" "$size"
done

python3 - "$RELEASE_PUBLICATION" "$RELEASE_TAG" "$RELEASE_REPO" "$RELEASE_INCOMING" "$started_at" <<'PY'
import hashlib, json, pathlib, sys

publication_path, tag, repo, incoming, started = sys.argv[1:]
root = pathlib.Path(incoming)
publication = json.loads(pathlib.Path(publication_path).read_text())
required_fixed = {
    f"{tag}.tar.zst",
    "pre-manifest.v1.json",
    "release-manifest.v1.json",
    "SHA256SUMS",
    "ci-evidence-index.v1.json",
}
runtime_names = {item["name"] for item in publication["assets"] if item["name"].startswith("shinemage-dsh-upstream-runtime-")}
if len(runtime_names) != 1:
    raise SystemExit("RELEASE_FETCH_RUNTIME_ASSET_INVALID")
required = sorted(required_fixed | runtime_names)
by_name = {item["name"]: item for item in publication["assets"]}
def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()
for name in required:
    path = root / name
    if not path.is_file():
        raise SystemExit(f"RELEASE_FETCH_MISSING {name}")
    item = by_name[name]
    if path.stat().st_size != item["size"] or digest(path) != item["sha256"]:
        raise SystemExit(f"RELEASE_FETCH_FINAL_VERIFY_FAILED {name}")
manifest = json.loads((root / "release-manifest.v1.json").read_text())
if manifest.get("release_tag") != tag or manifest.get("source_sha") != publication.get("source_sha"):
    raise SystemExit("RELEASE_FETCH_MANIFEST_BINDING_MISMATCH")
runtime_name = next(iter(runtime_names))
if manifest.get("upstream_runtime", {}).get("name") != runtime_name:
    raise SystemExit("RELEASE_FETCH_RUNTIME_BINDING_MISMATCH")
receipt = {
    "schema_version": "release-fetch/v1",
    "status": "FETCHED_VERIFIED",
    "release_tag": tag,
    "source_sha": publication["source_sha"],
    "repository": repo,
    "transport": "github-release-direct",
    "control_plane": "tailscale-ssh",
    "assets": [{"name": name, "bytes": (root / name).stat().st_size, "sha256": digest(root / name)} for name in required],
    "started_at": started,
}
tmp = root / ".release-fetch.v1.json.tmp"
tmp.write_text(json.dumps(receipt, indent=2) + "\n")
tmp.replace(root / "release-fetch.v1.json")
print(f"RELEASE_FETCH_PASS tag={tag} source_sha={publication['source_sha']} incoming={root}")
PY
