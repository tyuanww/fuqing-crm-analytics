#!/usr/bin/env bash
set -euo pipefail

# Open the authenticated production DSH entry without printing its launch
# credential. The credential is read over the existing Tailscale SSH path and
# handed directly to macOS open(1), matching the upstream DSH contract.

ssh_key="${SHINEMAGE_SSH_KEY:-${HOME}/.ssh/id_ed25519_github}"
ssh_target="${SHINEMAGE_SSH_TARGET:-root@100.93.46.46}"
runtime_file="${SHINEMAGE_DSH_RUNTIME:-/srv/shinemage/dsh/runtime/browser-private.json}"
public_origin="${SHINEMAGE_DSH_ORIGIN:-https://app.tyuan.chat}"

# Do not turn this helper into a token forwarder for arbitrary origins or
# remote paths. A custom SSH target is useful for a private recovery host, but
# the runtime file and browser origin remain fixed to the production contract.
[ "${runtime_file}" = "/srv/shinemage/dsh/runtime/browser-private.json" ] \
  || { echo '杭州 DSH runtime 路径必须是受控生产路径' >&2; exit 1; }
[ "${public_origin}" = "https://app.tyuan.chat" ] \
  || { echo '杭州 DSH 公网入口必须是 https://app.tyuan.chat' >&2; exit 1; }

command -v ssh >/dev/null || { echo '需要 ssh' >&2; exit 1; }
command -v python3 >/dev/null || { echo '需要 python3' >&2; exit 1; }
command -v open >/dev/null || { echo '需要 macOS open' >&2; exit 1; }

launch_url="$(ssh -q -o BatchMode=yes -o ConnectTimeout=8 -i "${ssh_key}" "${ssh_target}" \
  "python3 -c 'import json; print(json.load(open(\"/srv/shinemage/dsh/runtime/browser-private.json\"))[\"launchUrl\"])'")"

public_url="$(python3 - "${launch_url}" "${public_origin}" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit

launch = urlsplit(sys.argv[1])
origin = urlsplit(sys.argv[2])
if (launch.scheme, launch.netloc) != ("http", "127.0.0.1:6677"):
    raise SystemExit("杭州 DSH 启动链接来源不是预期的本地 6677")
if not launch.query or launch.fragment:
    raise SystemExit("杭州 DSH 启动链接缺少认证参数")
if origin.scheme != "https" or not origin.netloc:
    raise SystemExit("公网 DSH 地址必须是 https URL")
print(urlunsplit((origin.scheme, origin.netloc, launch.path or "/", launch.query, "")))
PY
)"

open "${public_url}"
printf '%s\n' '已打开杭州 DSH 认证入口；认证参数未打印。'
