# ACP 真机切换验收（P3-3d cutover）

状态为 **待执行**。本文件是 pinned rc.5 真机上的验收清单，不是执行记录。截至本文件落地，1.1 至 8 的每一步仍为 `NOT_RUN`；任何一步没有原始回执都不能记为通过。基线是 main `e09ff4f`（#237，含 #234/#235/#236/#237），默认 transport 仍是 `bridge`，本清单只在 cutover 构建上执行。

本清单覆盖设计 §7 的 3d 真机项，即真实 `--dump-config`、真实模型 tool call 与 ACP C2 回调、cancel 结算、子进程 SIGKILL 后 `session/resume`、内核重启后的 `acp_bindings` fence 与 active slot 释放、no-tool 结算、关停回收、stdout 纯度和受控回退。它不覆盖 `query` 家族、identity、在线金丝雀比例和生产流量，边界见第 10 节。

## 0. 记号与纪律

所有路径必须是绝对路径。变量含义如下。

| 变量 | 含义 |
|---|---|
| `REPO` | 主仓干净 checkout 的绝对路径，当前验收 head |
| `DSH_SRC` | pinned rc.5 上游 checkout，`git rev-parse HEAD` 必须是 `b830ec95` |
| `DSH_BIN` | 该 checkout 构建出的 `dsh` 入口 |
| `ACP_HOME` | ACP 子进程的私有 `DSH_HOME`，绝对路径，0700 |
| `ACP_WORK` | 内核配置里的 `acp_cwd`，绝对路径，已存在且 0700 |
| `STATE_DIR` | 内核 `state_dir`，绝对路径，0700，内含 `runs.sqlite3` |
| `EVID` | 本次证据根，新建绝对路径，0700 |
| `PORT` | 内核 `base_url` 的 loopback 端口 |
| `PACK_TGZ` | 新 workbench head 的 sealed author pack tarball |
| `KERNEL_CONFIG` | 内核单行 JSON 配置文件，0600，含真实 `transport` 块 |
| `SESSION_ID` | 内核配置里的 `session_id`，b0 合成会话使用固定值 |
| `RUNTIME_TOKEN` | 内核配置里的 `runtime_token`，供 bridge 的 `/internal/native/{fixture,run-context}` 校验；不是 ACP 回调 token |
| `GATEWAY_TOKEN` | 内核配置里的 `gateway_token`，供 `/internal/native/{context,prompt}` 与公开 run API 读取 |
| `CALLBACK_TOKEN` | 内核配置里的 `acp_callback_token`（至少 32 字符），每 boot 以 `B0_ACP_RUNTIME_TOKEN` 传给 ACP 子进程，只授权 `/internal/acp/*`；必须与 `RUNTIME_TOKEN`、`GATEWAY_TOKEN` 不同 |
| `PRE_CUTOVER_REPO` | 回退用的 cutover 前内核 checkout，记录 head 与依赖摘要 |

在 bash 下执行并先设置 `set -o pipefail` 和 `umask 077`，不要在 shell 里开 `set -x`。token 只从既有 0600 环境文件或内核私密配置读取，不写进命令行、不写进仓库、不打印到终端。证据里出现 token 的文件按秘密材料处理。

三个 token 不混用：`GATEWAY_TOKEN` 用于 `/internal/native/context`、`/internal/native/prompt` 和公开 run API；`RUNTIME_TOKEN` 只用于 bridge 原生工具面；`CALLBACK_TOKEN` 只用于 `/internal/acp/tool-call` 与 `/internal/acp/run-context`。5.0 会断言子进程只拿到第三个。

本清单引用的生成器是 [acp-profile.mjs](../../scripts/dsh-b0/acp-profile.mjs)，锁是 [dsh-acp-profile.lock.json](../../config/dsh-acp-profile.lock.json)，tools-only 入口是 [entry-tools.ts](../../dsh-plugins/analytics-workbench/src/entry-tools.ts)，transport 是 [acp_transport.py](../../backend/services/analytics/acp_transport.py)。

命令按 Linux coreutils 写。macOS 上把 `sha256sum` 换成 `shasum -a 256`，`timeout` 换成 `gtimeout`，`stat` 相关断言换成 Python 实现。

### 0.1 相对 #236 清单的修正

#237 合并后，下列旧口径已不成立，本清单按合并代码改写。

| 主题 | #236 清单（旧） | 合并后（本清单） |
|---|---|---|
| 结算丢失与重启 | 重启后 run `UNKNOWN`、`dispatch` `UNKNOWN`、`active_slot=1`，binding `LOST` 但槽位继续占用 | 已证明丢失或重启中的 ACP attempt CAS binding `LOST`，run `FAILED`/`EXECUTION_UNKNOWN`，dispatch `EXITED`，释放唯一 active slot（5.4） |
| no-tool 结算 | 未单列；无工具调用的 `end_turn` 无法结算 | prompt 已结算但没有工具证据的 turn 记 `FAILED`/`EXECUTION_UNKNOWN`，binding `SETTLED`，释放槽位（5.5） |
| 工具回调 | 子进程走 journal + `/internal/native/*`，依赖 `B0_SESSION_ID`/requestId | 子进程 POST `/internal/acp/tool-call`，body 只有 `{acp_session_id, call_id, query 或 request}`；内核用 `acp_bindings` join 到 run（5.1.1） |
| 子进程环境 | 继承内核 `dict(os.environ)`，模型凭据靠继承 | 只继承 allowlist，另加 `DSH_HOME`、`B0_ACP_BASE_URL`、per-boot `B0_ACP_RUNTIME_TOKEN`、`B0_RUNTIME_FAMILY`、`B0_ACP_CALLBACK=1`；内核秘密不跨界（5.0） |
| row config | 需要 `<acp_home>/cordis.patch.yml` 注入 `baseUrl`/`runtimeToken` | 由 scoped env 提供，home patch 已废弃；dump 里出现 row config 视为漂移（3.2 与 4） |
| 关停 | 未断言子进程回收 | `RunDispatcher.close()` 关闭 transport，lifespan `finally` 回收 child（5.6） |
| 准入 | health 只证明 `initialize` + `session/list` | health 先验证生成的 tools-only profile，再起 child；业务/bridge profile 失败关闭（5.0） |

## 1. 前置条件

逐项执行并记录到 `$EVID/00-preconditions/`。任一项失败即停止，不要带着失败前置进入真实模型演练。

### 1.1 宿主 pin

```bash
mkdir -p "$EVID/00-preconditions"
git -C "$DSH_SRC" rev-parse HEAD | tee "$EVID/00-preconditions/dsh-src-head.txt"
node -e "const p=require(process.argv[1]); if(p.version!=='0.2.1-rc.5') throw new Error(p.version)" \
  "$DSH_SRC/apps/cli/package.json"
"$DSH_BIN" --version | tee "$EVID/00-preconditions/dsh-version.txt"
sha256sum "$DSH_BIN" | tee "$EVID/00-preconditions/dsh-bin.sha256"
```

预期结果是 `b830ec950faba0a46dda564be3e2d854afed94f1`、`0.2.1-rc.5`、CLI 版本 `0.2.1-rc.5`。通过判据是三条都逐字匹配；任意一条不匹配即 `FAIL`，本清单不能继续。

### 1.2 模型与网络

```bash
test -n "${DEEPSEEK_API_KEY:?set the deployment model credential}" \
  && echo model-credential-present | tee "$EVID/00-preconditions/model-credential.txt"
getent hosts api.deepseek.com | tee "$EVID/00-preconditions/provider-dns.txt"
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 15 https://api.deepseek.com/ \
  | tee "$EVID/00-preconditions/provider-http.txt"
```

预期结果是凭据存在，DNS 有解析，HTTPS 返回 200、401 或 404 之一。通过判据是 DNS 解析成功、TLS 握手完成、HTTP 状态可读；401 或 404 只表示端点可达，不表示模型可用。真实模型可用性由 5.1 的 tool call 结算证明。如果部署改用了别的 provider，把上面的端点和凭据变量换成该 provider 的对应值，并在 README 记录实际值，不要把凭据值写进证据。

内核环境里的 `DEEPSEEK_API_KEY` 只用于本步探测；#237 后 ACP 子进程不再继承它。子进程必须按下列之一取得模型凭据，并在 README 记录选择与摘要：

1. 在 `$ACP_HOME` 里预置 pinned rc.5 使用的凭据存储（0600），子进程按自己的 `DSH_HOME` 读取；
2. 在 `KERNEL_CONFIG.acp_env` 里显式放入 `DEEPSEEK_API_KEY`（`KERNEL_CONFIG` 本身 0600，按秘密材料处理）。

两条都没有时，child 的模型调用会失败，5.1 不能通过。不要把内核环境当作隐式回退。

### 1.3 sealed author pack

```bash
mkdir -p "$EVID/00-preconditions/pack"
sha256sum "$PACK_TGZ" | tee "$EVID/00-preconditions/pack.sha256"
tar -xzf "$PACK_TGZ" -C "$EVID/00-preconditions/pack"
# 如果 tarball 顶层不是 package/，按实际解包根调整 PACK_ROOT
PACK_ROOT="$EVID/00-preconditions/pack/package"
node - "$PACK_ROOT" "$REPO/config/dsh-acp-profile.lock.json" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [root, lockPath] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const assert = (ok, name) => { if (!ok) throw new Error(name); };
assert(pkg.name === lock.plugin, 'pack name');
assert(pkg.version === lock.plugin_version, 'pack version');
assert(pkg.exports?.['./tools'] === lock.tools_export, 'tools export');
assert(pkg.exports?.['./cordis.acp.patch.yml'] === lock.patch_export, 'patch export');
assert(Array.isArray(pkg.files) && pkg.files.includes('lib/entry-tools.js'), 'files list');
assert(fs.statSync(path.join(root, 'lib/entry-tools.js')).size > 0, 'built tools entry');
const patch = fs.readFileSync(path.join(root, 'cordis.acp.patch.yml'));
const want = lock.patch_sha256;
const got = require('node:crypto').createHash('sha256').update(patch).digest('hex');
assert(got === want, 'patch sha256');
console.log(JSON.stringify({ name: pkg.name, version: pkg.version, tools: pkg.exports['./tools'], patch_sha256: got }));
NODE
sha256sum "$PACK_ROOT/lib/entry-tools.js" | tee "$EVID/00-preconditions/entry-tools.built.sha256"
```

预期结果是包名 `@shine-mage/dsh-analytics-workbench-b0`、版本 `0.0.0-b0`、`./tools` 指向 `./lib/entry-tools.js`、`./cordis.acp.patch.yml` 存在且 sha256 等于锁里的 `patch_sha256`。通过判据是上面的 `node` 断言全部通过，并且 `lib/entry-tools.js` 非空。作者仓 repack 已随主仓 #235 回填，作者 PR #16 仍未合；pack 必须与当前主仓锁一致，不一致时先完成作者 PR 与锁回填，不要用旧 pack 通过本步。

### 1.4 目录、权限和 pnpm

```bash
for dir in "$ACP_HOME" "$ACP_WORK" "$STATE_DIR" "$EVID"; do
  test -d "$dir" || { echo "FAIL missing $dir"; exit 1; }
done
python3 - "$ACP_HOME" "$ACP_WORK" "$STATE_DIR" "$EVID" <<'PY'
import os, stat, sys
for path in sys.argv[1:]:
    s = os.stat(path)
    assert stat.S_ISDIR(s.st_mode), path
    assert (s.st_mode & 0o077) == 0, f'{path} must be 0700'
    assert s.st_uid == os.getuid(), f'{path} owner'
print('dirs-ok')
PY
test ! -e "$ACP_HOME/profiles/analytics-acp" && echo profile-dir-fresh
pnpm --version | tee "$EVID/00-preconditions/pnpm-version.txt"
```

预期结果是四个目录都存在、都是 0700、都属于当前用户，`profiles/analytics-acp` 尚不存在，pnpm 可执行。通过判据是 `dirs-ok` 打印且 pnpm 版本落在部署固定的 11.28.x 范围。`acp_home` 必须是 ACP 子进程专用的私有 home，不能指向 Web 宿主的 `DSH_HOME`，否则会 resume 到用户会话，违反设计 R7。

### 1.5 `acp_env` 与保留键

#237 后子进程不再继承内核环境，旧版“内核 env 里不能出现 `B0_*`”不再是孩子行为的判据。仍需保证 `acp_env` 不覆盖内核注入的 scoped 值，也不把 bridge 时代的关联 id 带进 ACP 分支。

```bash
mkdir -p "$EVID/00-preconditions"
python3 - "$KERNEL_CONFIG" <<'PY' | tee "$EVID/00-preconditions/acp-env.json"
import json, sys
cfg = json.loads(open(sys.argv[1], encoding='utf-8').read().splitlines()[0])
extra = cfg.get('acp_env') or {}
reserved = {'DSH_HOME', 'B0_ACP_CALLBACK', 'B0_ACP_BASE_URL', 'B0_ACP_RUNTIME_TOKEN',
            'B0_RUNTIME_FAMILY', 'B0_SESSION_ID', 'B0_SESSION_IDS', 'B0_PORT_BASE',
            'B0_RUNTIME_TOKEN', 'B0_GATEWAY_TOKEN'}
bad = sorted(set(extra) & reserved)
assert not bad, f'acp_env overrides reserved keys: {bad}'
print(json.dumps({'acp_env_keys': sorted(extra)}, sort_keys=True))
PY
```

预期结果是 `acp_env` 只含显式允许的额外键（通常是 `DEEPSEEK_API_KEY`，或空对象）。通过判据是命令退出 0 且 `bad` 断言未触发。

`B0_SESSION_ID` 守卫在 #237 后由 [tool.ts](../../dsh-plugins/analytics-workbench/src/tool.ts) 的 `acpCallbackEnabled()` 分支取代：ACP 分支根本不读它，只有 bridge 分支才读。因此本步不再要求内核 env 为空，而是要求 `acp_env` 不夹带这些 id；子进程实际 env 由 5.0 用 `/proc/<pid>/environ` 实测。`B0_RUNTIME_FAMILY` 由内核按 `family` 注入，不要在 `acp_env` 里重复。

### 1.6 cutover 构建必须已含的项

本清单是 cutover 门禁，不是 main `e09ff4f` 的门禁。#237 已修掉回收/回调阻塞项，但下列构建项仍未合入；缺任何一项时本清单会在对应步骤失败。完整清单、证据与完成判据见第 9 节。

| 项 | 被哪一步证明 | 缺失时的可观察结果 |
|---|---|---|
| `dispatch_intents.transport` 列，dispatch 时写 `acp`，并在 receipt/canary 可读 | 5.1 至 5.5 | `dispatch.transport` 不存在，无法证明 attempt 由 ACP 路径持有 |
| bridge 删除范围收敛到 b0 自动化，保留 `query` 家族 bridge | 8 | 回退时 b0 仍有 bridge 行/端口/token，或误删 query 家族 bridge |
| identity 归属已定：ACP 不支持 identity，first_purchase/CRM identity 仍有 Host owner | 构建评审，本清单不演练 | 自动化 run 报 `IDENTITY_UNAVAILABLE`，或删 bridge 后 identity 无 owner |
| rc.5 surface gate 与 ACP 相关 CI 步转 blocking | 构建门禁，本清单不演练 | 影子门禁继续 `continue-on-error`，回归不阻断合并 |
| 默认 transport 翻到 `acp`（或部署显式选择且回退可切） | 1.7 | 部署仍默认 `bridge`，cutover 未真正发生 |
| 作者 PR #16 合入、作者 archive 重建、C0 例外可移除 | 1.3 | pack/锁/作者 archive 不一致，1.3 失败 |

### 1.7 内核 ACP 块

内核配置沿用部署已有的 bridge 配置，只把 transport 块换成下面这组键。`KERNEL_CONFIG` 必须是单行 JSON、0600，由内核从 stdin 读取。

```json
{
  "transport": "acp",
  "family": "b0",
  "acp_cwd": "<ACP_WORK 的绝对路径>",
  "acp_home": "<ACP_HOME 的绝对路径>",
  "acp_command": "<DSH_BIN 的绝对路径>",
  "acp_args": ["--profile", "analytics-acp"],
  "acp_timeout_ms": 30000,
  "acp_cancel_grace_ms": 5000,
  "acp_close_timeout_ms": 2000,
  "acp_write_timeout_ms": 5000,
  "acp_callback_token": "<至少 32 字符，且不同于 runtime_token/gateway_token>"
}
```

预期结果是 `AcpTransport.from_config` 接受该块：`acp_cwd` 是已存在的绝对目录，`acp_home` 是私有绝对目录，`acp_command`/`acp_args` 非空，`acp_cancel_grace_ms` 是非负整数，`acp_close_timeout_ms`/`acp_write_timeout_ms` 是正整数，`acp_callback_token` 至少 32 字符。通过判据是这些字段都由 [acp_transport.py](../../backend/services/analytics/acp_transport.py) 的 `from_config` 校验通过，并且内核启动后 health 的 `ready` 为 `true`。

内核配置还要保留 `base_url`（`from_config` 也接受 `acp_base_url` 覆盖）、`state_dir`、`session_id`、`runtime_token`、`gateway_token`、`fixture` 和 `method_package_digest`；`from_config` 只消费 origin/home/timeout 等 transport 字段，`method_package_digest` 由 ACP 回调路由读取。`state_dir` 必须与第 5 节使用的 `$STATE_DIR` 是同一个绝对路径。现有配置必须显式提供 `base_url`（本清单的 `$PORT` 就是它的端口），否则 5.0 无法把子进程的 `B0_ACP_BASE_URL` 与配置对齐。子进程 env 由 allowlist 加 `DSH_HOME`、`B0_ACP_CALLBACK=1`、`B0_ACP_BASE_URL`、`B0_ACP_RUNTIME_TOKEN`、`B0_RUNTIME_FAMILY` 组成；模型凭据不继承（见 1.2），`B0_RUNTIME_FAMILY` 由 `family` 注入，不用 `acp_env` 手写。

`method_package_digest` 必须等于已安装 pack 的 `lib/skills.js` 导出的 `methodPackageDigest`，否则 `/internal/acp/run-context` 返回 409，skills 的 `agent/pre-step` 失败关闭，5.1 不会产出工具证据。用下列命令核对：

```bash
node --input-type=module - "$PACK_ROOT" <<'NODE'
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const skills = await import(pathToFileURL(`${root}/lib/skills.js`).href);
console.log(skills.methodPackageDigest);
NODE
```

最后从 `KERNEL_CONFIG` 读出并导出三个 capability，不要手写 token，也不要把它们打印到终端：

```bash
eval "$(python3 - "$KERNEL_CONFIG" <<'PY'
import json, shlex, sys
cfg = json.loads(open(sys.argv[1], encoding='utf-8').read().splitlines()[0])
for key, name in (('session_id', 'SESSION_ID'), ('runtime_token', 'RUNTIME_TOKEN'),
                  ('gateway_token', 'GATEWAY_TOKEN'), ('acp_callback_token', 'CALLBACK_TOKEN')):
    value = cfg.get(key)
    if not isinstance(value, str) or not value:
        raise SystemExit(f'missing {key}')
    print(f'export {name}={shlex.quote(value)}')
PY
)"
test "$RUNTIME_TOKEN" != "$GATEWAY_TOKEN" && test "$CALLBACK_TOKEN" != "$RUNTIME_TOKEN" \
  && test "$CALLBACK_TOKEN" != "$GATEWAY_TOKEN" || { echo 'FAIL tokens not separated'; exit 1; }
```

## 2. 生成 profile

```bash
cd "$REPO"
node scripts/dsh-b0/acp-profile.mjs --check | tee "$EVID/01-profile-check.log"
PROFILE="$ACP_HOME/profiles/analytics-acp"
node scripts/dsh-b0/acp-profile.mjs --write "$PROFILE" | tee "$EVID/01-profile-write.log"
diff -u <(node scripts/dsh-b0/acp-profile.mjs --print-patch) "$PROFILE/cordis.patch.yml" \
  | tee "$EVID/01-profile-patch.diff"
node - "$PROFILE" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
if (pkg.name !== 'dsh-profile-analytics-acp') throw new Error('profile package name');
const bundles = pkg.dsh?.profile?.bundles ?? [];
if (JSON.stringify(bundles) !== JSON.stringify(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-acp-app'])) {
  throw new Error('profile bundles');
}
for (const name of ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml']) {
  const s = fs.statSync(path.join(dir, name));
  if (!s.isFile()) throw new Error(name);
  if ((s.mode & 0o777) !== 0o600) throw new Error(`${name} must be 0600`);
}
if ((fs.statSync(dir).mode & 0o777) !== 0o700) throw new Error('profile dir must be 0700');
console.log(JSON.stringify({ dir, bundles }));
NODE
ls -la "$PROFILE" | tee "$EVID/01-profile-files.txt"
sha256sum "$PROFILE"/* | tee "$EVID/01-profile-sha256.txt"
mkdir -p "$EVID/01-profile"
cp "$PROFILE/package.json" "$PROFILE/cordis.patch.yml" "$PROFILE/pnpm-workspace.yaml" "$EVID/01-profile/"
```

预期结果是 `acp-profile --check ok`，写出三个文件，patch 与 `--print-patch` 逐字节一致，bundle 列表是 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-acp-app`，文件模式是 0600。通过判据是 `01-profile-patch.diff` 为空、`node` 断言通过、三个文件齐全。生成的 patch 只有 `id`/`name`，没有 `config:`；row 的 origin/token 由内核 scoped env 提供（5.0），不要手写回 profile。`--write` 默认拒绝覆盖；需要重跑时先把旧目录整体归档到 `$EVID/01-profile-old/`，再用 `--write "$PROFILE" --force`，不要手工编辑生成物。

这份生成物同时是 health 的准入条件：`AcpTransport._verify_profile_once()` 在起 child 前读 `$PROFILE/package.json` 与 `$PROFILE/cordis.patch.yml`，要求 profile 名、bundle 列表、恰好一条 `@shine-mage/dsh-analytics-workbench-b0/tools` row、且没有 bare bridge row 或 `connection`/`webServer`/`bridge`。任一不符时 `ready` 保持 `false`，不会进入 `session/new`。

## 3. 安装 workbench pack 并确认只挂 tools 行

### 3.1 安装

```bash
DSH_HOME="$ACP_HOME" "$DSH_BIN" plugin --profile analytics-acp add "$PACK_TGZ" \
  2>&1 | tee "$EVID/02-install.log"
test -f "$PROFILE/node_modules/@shine-mage/dsh-analytics-workbench-b0/lib/entry-tools.js"
mkdir -p "$EVID/02-install"
cp "$PROFILE/package.json" "$EVID/02-install/package.json"
test -f "$PROFILE/pnpm-lock.yaml" && cp "$PROFILE/pnpm-lock.yaml" "$EVID/02-install/pnpm-lock.yaml"
```

预期结果是 `dsh plugin` 退出码 0，profile 的 `package.json` 出现 `@shine-mage/dsh-analytics-workbench-b0` 依赖，`node_modules` 里能解析到安装包。通过判据是退出码 0 且 `lib/entry-tools.js` 存在。`dsh plugin` 只负责注册包，不负责把 row 装进 profile；row 由第 2 步生成的 patch 提供。

### 3.2 确认不再需要 home 层 row config

#237 后 `resolveNativeRuntime()` 在 ACP 分支从 `B0_ACP_BASE_URL` 与 `B0_ACP_RUNTIME_TOKEN` 读取 origin/token，因此 #236 的 `<acp_home>/cordis.patch.yml` 注入已废弃。它若残留，会以 Config 优先级盖过 scoped env，造成 origin/token 漂移。本步只确认它不存在，且生成的 patch 没有 row config。

```bash
mkdir -p "$EVID/02-install"
test ! -e "$ACP_HOME/cordis.patch.yml" || { echo 'FAIL stale home patch'; exit 1; }
node scripts/dsh-b0/acp-profile.mjs --print-patch > "$EVID/02-install/expected.patch.yml"
diff -u "$EVID/02-install/expected.patch.yml" "$PROFILE/cordis.patch.yml" \
  | tee "$EVID/02-install/patch.diff"
if grep -Eq 'baseUrl|runtimeToken|[[:space:]]config:' "$PROFILE/cordis.patch.yml"; then
  echo 'FAIL row config in profile patch'; exit 1
fi
```

预期结果是没有 `<acp_home>/cordis.patch.yml`，profile patch 与生成器逐字节一致，且 patch 里没有 `config:`/`baseUrl`/`runtimeToken`。通过判据是三条命令都退出 0。若部署确实需要显式 row config（例如非 loopback 的验收夹具），必须单独评审并在 README 记录，不得沿用旧 home patch。

### 3.3 只挂 tools 入口的断言

```bash
node - "$PROFILE" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const dep = pkg.dependencies?.['@shine-mage/dsh-analytics-workbench-b0'];
if (!dep) throw new Error('workbench dependency missing');
const installed = JSON.parse(fs.readFileSync(path.join(
  dir, 'node_modules/@shine-mage/dsh-analytics-workbench-b0/package.json'), 'utf8'));
if (installed.exports?.['./tools'] !== './lib/entry-tools.js') throw new Error('tools subpath');
if (!fs.statSync(path.join(dir,
  'node_modules/@shine-mage/dsh-analytics-workbench-b0/lib/entry-tools.js')).size) {
  throw new Error('empty tools entry');
}
console.log(JSON.stringify({ dep, tools: installed.exports['./tools'] }));
NODE
```

预期结果是依赖版本与安装包的 `./tools` 导出匹配。通过判据是上面的断言全部通过，并且第 4 步的 dump 里只有一个 workbench 行，名字是 `@shine-mage/dsh-analytics-workbench-b0/tools`。真正的“加载”由 5.1 的 tool call 结算证明；`connection` 或 `webServer` 注入会让 ACP 子进程永久等待注入，`session/new` 或首次 prompt 不会结算，本步的 dump 断言只能证明组合面，不能单独证明运行时装载。

## 4. 真实 `--dump-config` 断言

```bash
DSH_HOME="$ACP_HOME" "$DSH_BIN" --profile analytics-acp --dump-config \
  > "$ACP_HOME/03-dump-config.yml" 2> "$EVID/03-dump-config.err"
DUMP_STATUS=$?
echo "$DUMP_STATUS" > "$EVID/03-dump-config.exit"
test "$DUMP_STATUS" -eq 0
chmod 600 "$ACP_HOME/03-dump-config.yml"
node scripts/dsh-b0/acp-profile.mjs --check-dump "$ACP_HOME/03-dump-config.yml" \
  | tee "$EVID/03-check-dump.log"
node - "$ACP_HOME/03-dump-config.yml" <<'NODE'
const fs = require('node:fs');
const text = fs.readFileSync(process.argv[2], 'utf8');
const rows = text.split(/\r?\n/);
const tools = rows.filter(line => /name:\s*['"]?@shine-mage\/dsh-analytics-workbench-b0\/tools['"]?\s*$/.test(line));
const bare = rows.filter(line => /name:\s*['"]?@shine-mage\/dsh-analytics-workbench-b0['"]?\s*$/.test(line));
if (tools.length !== 1) throw new Error(`tools rows ${tools.length}`);
if (bare.length !== 0) throw new Error('bare workbench row');
const block = rows.join('\n');
for (const bad of ['connection', 'webServer', 'createServer', 'bridge']) {
  if (new RegExp(bad, 'i').test(block.split(tools[0])[1]?.split(/\n\s*-\s/)[0] ?? '')) {
    throw new Error(`forbidden ${bad} in tools row`);
  }
}
if (/baseUrl:|runtimeToken:|(^|\s)config:/m.test(block)) {
  throw new Error('row config must come from the scoped child environment');
}
console.log('dump-shape-ok');
NODE
```

预期结果是 `--dump-config` 退出码 0，`--check-dump` 打印 `acp-profile --check-dump ok`，dump 里恰好一个 tools 行、没有 bare 行、tools 行内没有 `connection`、`webServer`、`createServer` 或 `bridge`，也没有 `config:`/`baseUrl`/`runtimeToken`。通过判据是上述命令都成功。row config 不再是部署注入项；出现它说明还有旧 home patch 或手改 profile，按 3.2 处理。

dump 现在不含 token，但仍按 0600 保存并记录 sha256；同时直接检查三个 capability 都没有出现在 dump 里：

```bash
sha256sum "$ACP_HOME/03-dump-config.yml" | tee "$EVID/03-dump-config.sha256"
for name in RUNTIME_TOKEN GATEWAY_TOKEN CALLBACK_TOKEN; do
  value="${!name}"
  if grep -Fq "$value" "$ACP_HOME/03-dump-config.yml"; then
    echo "FAIL dump contains $name"; exit 1
  fi
done
```

通过判据是三个 `grep` 都未命中。dump 与 sha256 可进入可分享证据；`KERNEL_CONFIG` 仍按秘密材料处理。

## 5. 真实运行演练

以下六个演练按顺序执行。每个演练使用独立的 `$EVID/04-normal`、`$EVID/05-cancel`、`$EVID/06-sigkill-resume`、`$EVID/07-kernel-restart`、`$EVID/04b-no-tool-settle`、`$EVID/04c-shutdown`；5.0 另用 `$EVID/04a-child-env`。每次 run 都新建 `requestId`，不复用旧 id。5.1 至 5.3 必须在 5.4 之前完成，因为 5.4 会重启内核。5.4 与 5.5 现在都会释放 active slot；5.6 停止内核，必须最后做。

### 5.0 启动、profile 准入与子进程 env

health 的 `ready` 只在生成的 tools-only profile 通过校验、child `initialize` 成功、`session/list` 返回后为真；profile 缺失、business/bridge row 或未安装 pack 都会在起 child 前失败关闭。若 `ready` 一直为 `false`，先看 `kernel.err` 里的 `ACP profile` 行，再回第 2、3 步。

```bash
cd "$REPO"
mkdir -p "$EVID/04-normal"
python3.14 -m backend.analytics_runtime < "$KERNEL_CONFIG" \
  > "$EVID/kernel.out" 2> "$EVID/kernel.err" &
KERNEL_PID=$!
echo "$KERNEL_PID" | tee "$EVID/kernel.pid"
for i in $(seq 1 60); do
  curl -fsS -H "authorization: Bearer $GATEWAY_TOKEN" \
    "http://127.0.0.1:$PORT/internal/native/context" > "$EVID/health.json" 2>/dev/null || true
  if python3 -c "import json; raise SystemExit(0 if json.load(open('$EVID/health.json'))['ready'] is True else 1)" 2>/dev/null; then
    break
  fi
  sleep 1
done
python3 -c "import json; assert json.load(open('$EVID/health.json'))['ready'] is True" \
  && echo ready | tee "$EVID/health.txt"
```

预期结果是 `ready`。`ready` 为 `true` 说明 profile 准入、ACP `initialize` 与 `session/list` 都成功；如果为 `false`，先看 `$EVID/kernel.err` 里的 `acp:` 或 `ACP profile` 行，不要继续。

随后实测子进程 env，确认 allowlist 与 token 分离：

```bash
mkdir -p "$EVID/04a-child-env"
ACP_PID="$(pgrep -P "$KERNEL_PID" -f 'analytics-acp' | head -1)"
test -n "$ACP_PID" || { echo 'FAIL no ACP child'; exit 1; }
echo "$ACP_PID" | tee "$EVID/04a-child-env/acp.pid"
tr '\0' '\n' < "/proc/$ACP_PID/environ" | cut -d= -f1 | sort \
  | tee "$EVID/04a-child-env/keys.txt"
python3 - "$KERNEL_CONFIG" "/proc/$ACP_PID/environ" <<'PY'
import json, sys
cfg = json.loads(open(sys.argv[1], encoding='utf-8').read().splitlines()[0])
raw = open(sys.argv[2], 'rb').read().decode('utf-8')
env = dict(item.split('=', 1) for item in raw.split('\0') if item)
allowlist = {'PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'TEMP', 'TMP',
             'SYSTEMROOT', 'OPENSSL_CONF'}
forced = {'DSH_HOME', 'B0_ACP_CALLBACK', 'B0_ACP_BASE_URL',
          'B0_ACP_RUNTIME_TOKEN', 'B0_RUNTIME_FAMILY'}
extra = set(cfg.get('acp_env') or {})
unknown = sorted(set(env) - allowlist - forced - extra)
forbidden = sorted(set(env) & {'B0_SESSION_ID', 'B0_SESSION_IDS', 'B0_PORT_BASE',
                               'B0_RUNTIME_TOKEN', 'B0_GATEWAY_TOKEN'})
assert not unknown, f'unexpected child env: {unknown}'
assert not forbidden, f'bridge ids crossed into the child: {forbidden}'
assert env['B0_ACP_CALLBACK'] == '1', env['B0_ACP_CALLBACK']
assert env['DSH_HOME'] == cfg['acp_home'], env['DSH_HOME']
assert env['B0_ACP_BASE_URL'] == cfg['base_url'].rstrip('/'), env['B0_ACP_BASE_URL']
assert env['B0_RUNTIME_FAMILY'] == cfg.get('family', 'b0'), env['B0_RUNTIME_FAMILY']
assert ('DEEPSEEK_API_KEY' in env) == ('DEEPSEEK_API_KEY' in extra), 'model credential path'
token = env['B0_ACP_RUNTIME_TOKEN']
assert len(token) >= 32
assert token == cfg['acp_callback_token']
assert token != cfg['runtime_token'] and token != cfg['gateway_token']
print(json.dumps({'keys': sorted(env), 'token_separated': True}, sort_keys=True))
PY
```

预期结果是 `token_separated`，子进程 key 集合等于 allowlist 加五个 forced key，再加 `acp_env` 里显式列出的键。通过判据是上面的断言全部通过；出现 `B0_SESSION_ID`、`B0_PORT_BASE`、`B0_RUNTIME_TOKEN`、`B0_GATEWAY_TOKEN`、`PYTHONPATH` 或任何未声明键即 `FAIL`。`B0_ACP_CALLBACK=1` 就是 [tool.ts](../../dsh-plugins/analytics-workbench/src/tool.ts) 走 ACP 分支的开关；此时 `B0_SESSION_ID` 守卫不再参与，5.1.1 的回调探针补上这条分支的证据。

先创建一次只读抽查脚本，供六个演练共用。脚本只读 SQLite，不写内核库。

```bash
cat > "$EVID/capture.py" <<'PY'
#!/usr/bin/env python3
import json, sqlite3, sys
db, run_id = sys.argv[1], sys.argv[2]
con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
con.row_factory = sqlite3.Row
def rows(sql):
    return [dict(row) for row in con.execute(sql, (run_id,))]
out = {
    'run': rows('SELECT * FROM runs WHERE run_id=?'),
    'dispatch': rows('SELECT * FROM dispatch_intents WHERE run_id=?'),
    'steps': rows('SELECT * FROM steps WHERE run_id=?'),
    'bindings': rows('SELECT * FROM acp_bindings WHERE run_id=?'),
    'events': [json.loads(row['event_json']) for row in
               con.execute('SELECT event_json FROM events WHERE run_id=? ORDER BY sequence', (run_id,))],
}
print(json.dumps(out, indent=2, sort_keys=True, default=str))
PY
chmod 700 "$EVID/capture.py"
```

### 5.1 正常工具调用

```bash
mkdir -p "$EVID/04-normal"
REQUEST_ID="accept-normal-$(date +%s)"
BODY="$(python3 - "$REQUEST_ID" "$SESSION_ID" <<'PY'
import json, sys
print(json.dumps({
    'requestId': sys.argv[1],
    'sessionId': sys.argv[2],
    'mode': 'queue',
    'content': [{'type': 'text',
                 'text': '调用 analytics_b0_query 工具，query 参数为 channel_repeat_rate，然后根据工具结果回答。'}],
}, ensure_ascii=False))
PY
)"
curl -fsS -X POST "http://127.0.0.1:$PORT/internal/native/prompt" \
  -H "authorization: Bearer $GATEWAY_TOKEN" -H 'content-type: application/json' \
  -d "$BODY" | tee "$EVID/04-normal/accepted.json"
RUN_ID="$(python3 -c "import json; print(json.load(open('$EVID/04-normal/accepted.json'))['run_id'])")"
for i in $(seq 1 180); do
  curl -fsS -H "authorization: Bearer $GATEWAY_TOKEN" \
    "http://127.0.0.1:$PORT/api/v1/analytics/runs/$RUN_ID" > "$EVID/04-normal/snapshot.json"
  STATUS="$(python3 -c "import json; print(json.load(open('$EVID/04-normal/snapshot.json'))['status'])")"
  case "$STATUS" in SUCCEEDED|FAILED|CANCELLED|NEEDS_INPUT) break;; esac
  sleep 1
done
echo "$STATUS" | tee "$EVID/04-normal/status.txt"
python3 "$EVID/capture.py" "$STATE_DIR/runs.sqlite3" "$RUN_ID" > "$EVID/04-normal/settle.json"
```

预期结果是 run 结算 `SUCCEEDED`，至少一条 `state=SUCCEEDED` 的 step 且没有未完成 step，`runs.primary_result_ref` 指向其中一条，它的 `call_id` 非空，`acp_bindings` 恰好一行且 `state=SETTLED`，`prompt_rpc_id` 非空，`dispatch.state=EXITED`，`dispatch.transport=acp`，`run.active_slot` 为 NULL。通过判据是下面的断言全部通过，其中主 step 的 `call_id` 就是 ACP `tool_call` 携带并由工具回传 K 的真实 `tool_call_id`；它必须非空，且不能等于 `run_id`。

```bash
python3 - "$EVID/04-normal/settle.json" <<'PY'
import json, re, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
run = d['run'][0]
assert run['status'] == 'SUCCEEDED', run['status']
assert run['error_code'] is None, run['error_code']
assert run['active_slot'] is None, run['active_slot']
done = [s for s in d['steps'] if s['state'] == 'SUCCEEDED']
assert done, d['steps']
assert not [s for s in d['steps'] if s['state'] != 'SUCCEEDED'], d['steps']
primary = next((s for s in done if s['step_id'] == run['primary_result_ref']), None)
assert primary is not None, (run['primary_result_ref'], done)
call_id = primary['call_id']
assert re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', call_id), call_id
assert call_id != run['run_id'], 'tool_call_id must not be the run id'
assert len(d['bindings']) == 1, d['bindings']
b = d['bindings'][0]
assert b['state'] == 'SETTLED', b['state']
assert b['acp_session_id'], b['acp_session_id']
assert b['prompt_rpc_id'], b['prompt_rpc_id']
assert d['dispatch'][0]['state'] == 'EXITED', d['dispatch']
assert d['dispatch'][0].get('transport') == 'acp', d['dispatch']
print('normal-ok', call_id)
PY
```

`dispatch.transport` 属于 cutover 构建项（1.6、第 9 节）；main `e09ff4f` 的 `dispatch_intents` 还没有该列，本断言只在 cutover 构建上成立。

### 5.1.1 ACP C2 回调探针

5.1 的正常结算已经证明正路径：step 的 `call_id` 由子进程 POST `/internal/acp/tool-call` 预留，body 只有 `{acp_session_id, call_id, query}`，没有内核 `session_id`/`request_id`。本节用同一份已经 `SETTLED` 的 binding 证明路由、拒绝语义和 token 分离；正向预留由 5.1 证明，不要手工造一条 `BOUND` 行来“补正路径”。

```bash
mkdir -p "$EVID/04-normal/callback"
ACP_SESSION_ID="$(python3 -c "import json; print(json.load(open('$EVID/04-normal/settle.json'))['bindings'][0]['acp_session_id'])")"
CALL_ID="$(python3 -c "import json; d=json.load(open('$EVID/04-normal/settle.json')); r=d['run'][0]; print(next(s['call_id'] for s in d['steps'] if s['step_id']==r['primary_result_ref']))")"
CHILD_BODY="$(python3 -c "import json,sys; print(json.dumps({'acp_session_id':sys.argv[1],'call_id':sys.argv[2],'query':'channel_repeat_rate'}))" "$ACP_SESSION_ID" "$CALL_ID")"
KERNEL_ID_BODY="$(python3 -c "import json,sys; print(json.dumps({'acp_session_id':sys.argv[1],'call_id':sys.argv[2],'query':'channel_repeat_rate','session_id':'s','request_id':'r'}))" "$ACP_SESSION_ID" "$CALL_ID")"
probe() {
  local label="$1" token="$2" body="$3"
  curl -sS -o "$EVID/04-normal/callback/$label.json" -w '%{http_code}' \
    -X POST "http://127.0.0.1:$PORT/internal/acp/tool-call" \
    -H "authorization: Bearer $token" -H 'content-type: application/json' \
    -d "$body" > "$EVID/04-normal/callback/$label.status"
}
probe gateway-token "$GATEWAY_TOKEN" "$CHILD_BODY"
probe runtime-token "$RUNTIME_TOKEN" "$CHILD_BODY"
probe unknown-session "$CALLBACK_TOKEN" "${CHILD_BODY/$ACP_SESSION_ID/acp-unknown-session}"
probe settled-binding "$CALLBACK_TOKEN" "$CHILD_BODY"
probe kernel-ids "$CALLBACK_TOKEN" "$KERNEL_ID_BODY"
curl -sS -o "$EVID/04-normal/callback/run-context.json" -w '%{http_code}' \
  -X POST "http://127.0.0.1:$PORT/internal/acp/run-context" \
  -H "authorization: Bearer $CALLBACK_TOKEN" -H 'content-type: application/json' \
  -d "$(python3 -c "import json,sys; print(json.dumps({'acp_session_id':sys.argv[1],'unit_id':'call-1','package_digest':'0'*64}))" "$ACP_SESSION_ID")" \
  > "$EVID/04-normal/callback/run-context.status"
python3 - "$EVID/04-normal/callback" <<'PY'
import json, os, sys
root = sys.argv[1]
def status(name):
    return open(os.path.join(root, name + '.status'), encoding='utf-8').read().strip()
def body(name):
    return json.dumps(json.load(open(os.path.join(root, name + '.json'), encoding='utf-8')))
assert status('gateway-token') == '401', status('gateway-token')
assert status('runtime-token') == '401', status('runtime-token')
assert status('unknown-session') == '409', status('unknown-session')
assert status('settled-binding') == '409', status('settled-binding')
assert status('kernel-ids') == '422', status('kernel-ids')
assert status('run-context') == '409', status('run-context')
assert 'UNBOUND_NATIVE_REQUEST' in body('unknown-session'), body('unknown-session')
assert 'UNBOUND_NATIVE_REQUEST' in body('settled-binding'), body('settled-binding')
assert 'UNBOUND_NATIVE_REQUEST' in body('run-context'), body('run-context')
print('acp-callback-probe-ok')
PY
```

预期结果是 gateway/runtime token 都被 401 拒绝，未知 ACP session、已 `SETTLED` 的 binding 和已结算的 run-context 读到 `409 UNBOUND_NATIVE_REQUEST`，body 里带内核 `session_id`/`request_id` 的请求被 422 拒绝。通过判据是上面的断言全部通过。网关 token 与内核 runtime token 都拿不到回调能力，只有 `CALLBACK_TOKEN` 能到达路由，这正是 0.1 所说的 token 分离。

### 5.2 cancel 演练

在 run 仍为 `RUNNING` 时发 cancel。若模型太快导致 run 先结算，本次 run 作废，换一个更长的自动化重跑，不要用“结算后再 cancel”冒充取消演练。

```bash
mkdir -p "$EVID/05-cancel"
REQUEST_ID="accept-cancel-$(date +%s)"
BODY="$(python3 - "$REQUEST_ID" "$SESSION_ID" <<'PY'
import json, sys
print(json.dumps({
    'requestId': sys.argv[1],
    'sessionId': sys.argv[2],
    'mode': 'queue',
    'content': [{'type': 'text',
                 'text': '请先用较长的推理说明你的分析计划，再调用 analytics_b0_query，query 参数为 channel_repeat_rate。'}],
}, ensure_ascii=False))
PY
)"
curl -fsS -X POST "http://127.0.0.1:$PORT/internal/native/prompt" \
  -H "authorization: Bearer $GATEWAY_TOKEN" -H 'content-type: application/json' \
  -d "$BODY" | tee "$EVID/05-cancel/accepted.json"
RUN_ID="$(python3 -c "import json; print(json.load(open('$EVID/05-cancel/accepted.json'))['run_id'])")"
for i in $(seq 1 60); do
  curl -fsS -H "authorization: Bearer $GATEWAY_TOKEN" \
    "http://127.0.0.1:$PORT/api/v1/analytics/runs/$RUN_ID" > "$EVID/05-cancel/pre-cancel.json"
  STATUS="$(python3 -c "import json; print(json.load(open('$EVID/05-cancel/pre-cancel.json'))['status'])")"
  [ "$STATUS" = RUNNING ] && break
  sleep 0.2
done
test "$STATUS" = RUNNING || { echo "FAIL pre-cancel status $STATUS"; exit 1; }
VERSION="$(python3 -c "import json; print(json.load(open('$EVID/05-cancel/pre-cancel.json'))['version'])")"
curl -fsS -X POST "http://127.0.0.1:$PORT/api/v1/analytics/runs/$RUN_ID/cancel" \
  -H "authorization: Bearer $GATEWAY_TOKEN" -H "idempotency-key: cancel-$RUN_ID" \
  -H "if-match: $VERSION" -H 'content-type: application/json' \
  -d '{"reason":"USER_REQUEST"}' | tee "$EVID/05-cancel/cancel.json"
for i in $(seq 1 180); do
  curl -fsS -H "authorization: Bearer $GATEWAY_TOKEN" \
    "http://127.0.0.1:$PORT/api/v1/analytics/runs/$RUN_ID" > "$EVID/05-cancel/snapshot.json"
  STATUS="$(python3 -c "import json; print(json.load(open('$EVID/05-cancel/snapshot.json'))['status'])")"
  case "$STATUS" in SUCCEEDED|FAILED|CANCELLED|NEEDS_INPUT) break;; esac
  sleep 1
done
echo "$STATUS" | tee "$EVID/05-cancel/status.txt"
python3 "$EVID/capture.py" "$STATE_DIR/runs.sqlite3" "$RUN_ID" > "$EVID/05-cancel/settle.json"
```

预期结果是 cancel 请求被接受时 run 仍是 `RUNNING`，最终 `CANCELLED`，`acp_bindings` 是 `SETTLED`，并且事件里没有 `run.completed`。工具可能在 cancel 之后已经完成并留下 `SUCCEEDED` 的 step，这是设计允许的，不改变 run 的 `CANCELLED`。通过判据是下面的断言全部通过。

```bash
python3 - "$EVID/05-cancel/settle.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
run = d['run'][0]
assert run['status'] == 'CANCELLED', run['status']
assert run['cancel_reason'] == 'USER_REQUEST', run['cancel_reason']
assert run['error_code'] is None, run['error_code']
assert len(d['bindings']) == 1 and d['bindings'][0]['state'] == 'SETTLED', d['bindings']
assert all(e.get('type') != 'run.completed' for e in d['events']), [e.get('type') for e in d['events']]
print('cancel-ok')
PY
```

通过判据还要包含一条时间证据。`pre-cancel.json` 的 `status` 必须是 `RUNNING`，否则不能证明 cancel 发生在 prompt 结算之前。`status.txt` 必须是 `CANCELLED`，任何 `SUCCEEDED` 都是 `FAIL`。

#237 后 `CANCELLED` 仍然只由 settlement 产生。若 child 在 deadline + grace 后仍不结算、被 transport 退休，或内核观察到 settlement 丢失，结果是 `FAILED`/`EXECUTION_UNKNOWN`、binding `LOST`、`active_slot` 释放（dispatcher 的 `_reclaim_acp_lost`）。这不是 cancel 演练的通过形态：记录为 `FAIL`，检查 child 是否卡死或 `session/cancel` 是否送达；不要把 `FAILED` 改写成 `CANCELLED`，也不要手工改 binding。

### 5.3 子进程 SIGKILL 后 resume

本步在孩子空闲时 SIGKILL，隔离 `session/resume` 语义；prompt 在飞时丢失结算的路径由 5.4 覆盖。先确认 5.1 已经结算并拿到它的 `acp_session_id`。

```bash
mkdir -p "$EVID/06-sigkill-resume"
ACP_PID="$(pgrep -P "$KERNEL_PID" -f 'analytics-acp' | head -1)"
test -n "$ACP_PID" || { echo "FAIL no ACP child"; exit 1; }
echo "$ACP_PID" | tee "$EVID/06-sigkill-resume/acp.pid"
kill -9 "$ACP_PID"
for i in $(seq 1 30); do kill -0 "$ACP_PID" 2>/dev/null || break; sleep 0.2; done
kill -0 "$ACP_PID" 2>/dev/null && { echo "FAIL child alive"; exit 1; }
```

预期结果是 ACP 子进程退出，内核进程仍在。随后发起第二次正常 run。它会触发 `_ensure_child` 新建子进程，并在 dispatch 时对同一个 `acp_session_id` 调用 `session/resume`。

```bash
REQUEST_ID="accept-resume-$(date +%s)"
BODY="$(python3 - "$REQUEST_ID" "$SESSION_ID" <<'PY'
import json, sys
print(json.dumps({
    'requestId': sys.argv[1],
    'sessionId': sys.argv[2],
    'mode': 'queue',
    'content': [{'type': 'text',
                 'text': '再次调用 analytics_b0_query 工具，query 参数为 channel_repeat_rate，然后返回结果。'}],
}, ensure_ascii=False))
PY
)"
curl -fsS -X POST "http://127.0.0.1:$PORT/internal/native/prompt" \
  -H "authorization: Bearer $GATEWAY_TOKEN" -H 'content-type: application/json' \
  -d "$BODY" | tee "$EVID/06-sigkill-resume/accepted.json"
RUN_ID="$(python3 -c "import json; print(json.load(open('$EVID/06-sigkill-resume/accepted.json'))['run_id'])")"
for i in $(seq 1 180); do
  curl -fsS -H "authorization: Bearer $GATEWAY_TOKEN" \
    "http://127.0.0.1:$PORT/api/v1/analytics/runs/$RUN_ID" > "$EVID/06-sigkill-resume/snapshot.json"
  STATUS="$(python3 -c "import json; print(json.load(open('$EVID/06-sigkill-resume/snapshot.json'))['status'])")"
  case "$STATUS" in SUCCEEDED|FAILED|CANCELLED|NEEDS_INPUT) break;; esac
  sleep 1
done
python3 "$EVID/capture.py" "$STATE_DIR/runs.sqlite3" "$RUN_ID" > "$EVID/06-sigkill-resume/settle.json"
```

预期结果是第二个 run `SUCCEEDED`，新 binding 的 `acp_session_id` 与 5.1 的 binding 相同，内核日志没有 `session/resume rejected`。通过判据是下面的断言全部通过。

```bash
python3 - "$EVID/04-normal/settle.json" "$EVID/06-sigkill-resume/settle.json" <<'PY'
import json, sys
first = json.load(open(sys.argv[1], encoding='utf-8'))['bindings'][0]
second = json.load(open(sys.argv[2], encoding='utf-8'))['bindings'][0]
assert second['state'] == 'SETTLED', second['state']
assert second['acp_session_id'] == first['acp_session_id'], (first, second)
assert second['prompt_rpc_id'] != first['prompt_rpc_id'], 'prompt ids must differ'
print('resume-ok', second['acp_session_id'])
PY
grep -F 'session/resume rejected' "$EVID/kernel.err" && { echo 'FAIL resume rejected'; exit 1; } || true
```

如果新 binding 的 `acp_session_id` 与 5.1 不同，说明发生了 `session/new` 而不是 `session/resume`，本次 drill `FAIL`，不要用“仍然成功”解释成 resume 通过。

### 5.4 内核重启与 `acp_bindings` fence

本步让一个 prompt 在飞时 SIGKILL 内核，重启后证明旧的 `BOUND` 被 fence 成 `LOST`，run 终态为 `FAILED`/`EXECUTION_UNKNOWN`，dispatch `EXITED`，唯一 active slot 释放，并且同一个 attempt 没有被重新 dispatch。5.4 会重启内核，所以仍放在 5.1–5.3 之后；但它不再把槽位留到最后。

```bash
mkdir -p "$EVID/07-kernel-restart"
REQUEST_ID="accept-restart-$(date +%s)"
BODY="$(python3 - "$REQUEST_ID" "$SESSION_ID" <<'PY'
import json, sys
print(json.dumps({
    'requestId': sys.argv[1],
    'sessionId': sys.argv[2],
    'mode': 'queue',
    'content': [{'type': 'text',
                 'text': '请先用较长的推理说明你的分析计划，再调用 analytics_b0_query，query 参数为 channel_repeat_rate。'}],
}, ensure_ascii=False))
PY
)"
curl -fsS -X POST "http://127.0.0.1:$PORT/internal/native/prompt" \
  -H "authorization: Bearer $GATEWAY_TOKEN" -H 'content-type: application/json' \
  -d "$BODY" | tee "$EVID/07-kernel-restart/accepted.json"
RUN_ID="$(python3 -c "import json; print(json.load(open('$EVID/07-kernel-restart/accepted.json'))['run_id'])")"
for i in $(seq 1 60); do
  python3 "$EVID/capture.py" "$STATE_DIR/runs.sqlite3" "$RUN_ID" > "$EVID/07-kernel-restart/before.json"
  if python3 - "$EVID/07-kernel-restart/before.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
raise SystemExit(0 if d['bindings'] and d['bindings'][0]['state'] == 'BOUND' else 1)
PY
  then break; fi
  sleep 0.2
done
cp "$EVID/07-kernel-restart/before.json" "$EVID/07-kernel-restart/bound.json"
kill -9 "$KERNEL_PID"
wait "$KERNEL_PID" 2>/dev/null || true
for i in $(seq 1 30); do kill -0 "$KERNEL_PID" 2>/dev/null || break; sleep 0.2; done
for i in $(seq 1 30); do pgrep -f 'analytics-acp' >/dev/null || break; sleep 0.2; done
cd "$REPO"
python3.14 -m backend.analytics_runtime < "$KERNEL_CONFIG" \
  > "$EVID/07-kernel-restart/kernel.out" 2> "$EVID/07-kernel-restart/kernel.err" &
KERNEL_PID=$!
echo "$KERNEL_PID" | tee "$EVID/07-kernel-restart/kernel.pid"
for i in $(seq 1 60); do
  curl -fsS -H "authorization: Bearer $GATEWAY_TOKEN" \
    "http://127.0.0.1:$PORT/internal/native/context" > "$EVID/07-kernel-restart/health.json" 2>/dev/null || true
  if python3 -c "import json; raise SystemExit(0 if json.load(open('$EVID/07-kernel-restart/health.json'))['ready'] is True else 1)" 2>/dev/null; then
    break
  fi
  sleep 1
done
python3 -c "import json; assert json.load(open('$EVID/07-kernel-restart/health.json'))['ready'] is True"
python3 "$EVID/capture.py" "$STATE_DIR/runs.sqlite3" "$RUN_ID" > "$EVID/07-kernel-restart/after.json"
```

预期结果是重启后 run 变为 `FAILED`，`error_code` 为 `EXECUTION_UNKNOWN`，`phase` 为 `FINALIZING`，`dispatch.state` 为 `EXITED`，binding 变为 `LOST`，`active_slot` 为 NULL，`dispatch.attempts` 与重启前相同，binding 行数仍为 1；新增事件包含 `run.failed`，且没有新的 `run.started`。通过判据是下面的断言全部通过。

```bash
python3 - "$EVID/07-kernel-restart/before.json" "$EVID/07-kernel-restart/after.json" <<'PY'
import json, sys
before = json.load(open(sys.argv[1], encoding='utf-8'))
after = json.load(open(sys.argv[2], encoding='utf-8'))
b_run, a_run = before['run'][0], after['run'][0]
assert before['bindings'][0]['state'] == 'BOUND', before['bindings']
assert after['bindings'][0]['state'] == 'LOST', after['bindings']
assert len(after['bindings']) == 1, after['bindings']
assert a_run['status'] == 'FAILED', a_run['status']
assert a_run['error_code'] == 'EXECUTION_UNKNOWN', a_run['error_code']
assert a_run['phase'] == 'FINALIZING', a_run['phase']
assert a_run['active_slot'] is None, a_run['active_slot']
assert after['dispatch'][0]['state'] == 'EXITED', after['dispatch']
assert after['dispatch'][0]['attempts'] == before['dispatch'][0]['attempts'], 'attempts moved'
assert a_run['attempt_id'] == b_run['attempt_id'], 'attempt changed'
assert after['dispatch'][0].get('transport') == 'acp', after['dispatch']
new_events = after['events'][len(before['events']):]
assert all(e.get('type') != 'run.started' for e in new_events), 'redispatched'
assert any(e.get('type') == 'run.failed' for e in new_events), [e.get('type') for e in new_events]
print('kernel-restart-ok')
PY
```

如果 `bound.json` 的 binding 不是 `BOUND`，说明 prompt 在 kill 前已经结算，本次 run 作废，换一个更长的自动化重跑，不要修改断言迁就结果。如果重启后出现第二条 `acp_bindings` 行、`dispatch.attempts` 增加或新的 `run.started`，本步 `FAIL`，这表示同一个 attempt 被重新派发，属于设计禁止的双副作用。

槽位释放再用一次真实 run 证明；5.4 之后的队列必须能前进，而不是被旧的 lost attempt 永久占住：

```bash
REQUEST_ID="accept-restart-next-$(date +%s)"
BODY="$(python3 - "$REQUEST_ID" "$SESSION_ID" <<'PY'
import json, sys
print(json.dumps({
    'requestId': sys.argv[1],
    'sessionId': sys.argv[2],
    'mode': 'queue',
    'content': [{'type': 'text',
                 'text': '调用 analytics_b0_query 工具，query 参数为 channel_repeat_rate，然后返回结果。'}],
}, ensure_ascii=False))
PY
)"
curl -fsS -X POST "http://127.0.0.1:$PORT/internal/native/prompt" \
  -H "authorization: Bearer $GATEWAY_TOKEN" -H 'content-type: application/json' \
  -d "$BODY" | tee "$EVID/07-kernel-restart/next-accepted.json"
NEXT_RUN_ID="$(python3 -c "import json; print(json.load(open('$EVID/07-kernel-restart/next-accepted.json'))['run_id'])")"
for i in $(seq 1 180); do
  curl -fsS -H "authorization: Bearer $GATEWAY_TOKEN" \
    "http://127.0.0.1:$PORT/api/v1/analytics/runs/$NEXT_RUN_ID" > "$EVID/07-kernel-restart/next-snapshot.json"
  NEXT_STATUS="$(python3 -c "import json; print(json.load(open('$EVID/07-kernel-restart/next-snapshot.json'))['status'])")"
  case "$NEXT_STATUS" in SUCCEEDED|FAILED|CANCELLED|NEEDS_INPUT) break;; esac
  sleep 1
done
python3 "$EVID/capture.py" "$STATE_DIR/runs.sqlite3" "$NEXT_RUN_ID" > "$EVID/07-kernel-restart/next.json"
python3 - "$EVID/07-kernel-restart/next.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
run = d['run'][0]
assert run['status'] == 'SUCCEEDED', run['status']
assert run['active_slot'] is None, run['active_slot']
assert len(d['bindings']) == 1 and d['bindings'][0]['state'] == 'SETTLED', d['bindings']
assert d['dispatch'][0]['state'] == 'EXITED', d['dispatch']
assert d['dispatch'][0]['attempts'] == 1, d['dispatch']
assert d['dispatch'][0].get('transport') == 'acp', d['dispatch']
print('post-restart-run-ok')
PY
```

预期结果是新 run `SUCCEEDED`，证明旧 attempt 的 lost 终态没有继续占槽，也没有被重新派发。通过判据是 `post-restart-run-ok`。

### 5.5 no-tool 结算与顺序推进

prompt 可能在没有任何工具调用的情况下 `end_turn`。rc.5 把 `blocked`/`aborted` 也塌缩成 `end_turn`，所以这种 turn 没有成功证据，但 prompt 响应仍是 exit proof。本步证明它被记成 `FAILED`/`EXECUTION_UNKNOWN`、binding `SETTLED`、槽位释放，随后一个正常 run 仍能推进。

```bash
mkdir -p "$EVID/04b-no-tool-settle"
REQUEST_ID="accept-no-tool-$(date +%s)"
BODY="$(python3 - "$REQUEST_ID" "$SESSION_ID" <<'PY'
import json, sys
print(json.dumps({
    'requestId': sys.argv[1],
    'sessionId': sys.argv[2],
    'mode': 'queue',
    'content': [{'type': 'text',
                 'text': '不要调用任何工具，也不要读取 Skill；只回复“已收到”。'}],
}, ensure_ascii=False))
PY
)"
curl -fsS -X POST "http://127.0.0.1:$PORT/internal/native/prompt" \
  -H "authorization: Bearer $GATEWAY_TOKEN" -H 'content-type: application/json' \
  -d "$BODY" | tee "$EVID/04b-no-tool-settle/accepted.json"
RUN_ID="$(python3 -c "import json; print(json.load(open('$EVID/04b-no-tool-settle/accepted.json'))['run_id'])")"
for i in $(seq 1 180); do
  curl -fsS -H "authorization: Bearer $GATEWAY_TOKEN" \
    "http://127.0.0.1:$PORT/api/v1/analytics/runs/$RUN_ID" > "$EVID/04b-no-tool-settle/snapshot.json"
  STATUS="$(python3 -c "import json; print(json.load(open('$EVID/04b-no-tool-settle/snapshot.json'))['status'])")"
  case "$STATUS" in SUCCEEDED|FAILED|CANCELLED|NEEDS_INPUT) break;; esac
  sleep 1
done
python3 "$EVID/capture.py" "$STATE_DIR/runs.sqlite3" "$RUN_ID" > "$EVID/04b-no-tool-settle/settle.json"
python3 - "$EVID/04b-no-tool-settle/settle.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
run = d['run'][0]
assert run['status'] == 'FAILED', run['status']
assert run['error_code'] == 'EXECUTION_UNKNOWN', run['error_code']
assert run['active_slot'] is None, run['active_slot']
assert len(d['bindings']) == 1 and d['bindings'][0]['state'] == 'SETTLED', d['bindings']
assert d['dispatch'][0]['state'] == 'EXITED', d['dispatch']
assert d['dispatch'][0].get('transport') == 'acp', d['dispatch']
assert not [s for s in d['steps'] if s['state'] == 'SUCCEEDED'], d['steps']
assert all(e.get('type') != 'run.completed' for e in d['events']), [e.get('type') for e in d['events']]
print('no-tool-settle-ok')
PY
```

预期结果是 `no-tool-settle-ok`，binding 是 `SETTLED` 而不是 `LOST`：prompt 确实结算了，只是没有成功证据。如果模型仍然调用了工具并让 run `SUCCEEDED`，本次 run 作废，换更严格的自动化 prompt 重跑，不要修改断言。

再用一个正常 run 证明槽位没有被 no-tool 失败占住：

```bash
REQUEST_ID="accept-no-tool-next-$(date +%s)"
BODY="$(python3 - "$REQUEST_ID" "$SESSION_ID" <<'PY'
import json, sys
print(json.dumps({
    'requestId': sys.argv[1],
    'sessionId': sys.argv[2],
    'mode': 'queue',
    'content': [{'type': 'text',
                 'text': '调用 analytics_b0_query 工具，query 参数为 channel_repeat_rate，然后返回结果。'}],
}, ensure_ascii=False))
PY
)"
curl -fsS -X POST "http://127.0.0.1:$PORT/internal/native/prompt" \
  -H "authorization: Bearer $GATEWAY_TOKEN" -H 'content-type: application/json' \
  -d "$BODY" | tee "$EVID/04b-no-tool-settle/next-accepted.json"
NEXT_RUN_ID="$(python3 -c "import json; print(json.load(open('$EVID/04b-no-tool-settle/next-accepted.json'))['run_id'])")"
for i in $(seq 1 180); do
  curl -fsS -H "authorization: Bearer $GATEWAY_TOKEN" \
    "http://127.0.0.1:$PORT/api/v1/analytics/runs/$NEXT_RUN_ID" > "$EVID/04b-no-tool-settle/next-snapshot.json"
  NEXT_STATUS="$(python3 -c "import json; print(json.load(open('$EVID/04b-no-tool-settle/next-snapshot.json'))['status'])")"
  case "$NEXT_STATUS" in SUCCEEDED|FAILED|CANCELLED|NEEDS_INPUT) break;; esac
  sleep 1
done
python3 "$EVID/capture.py" "$STATE_DIR/runs.sqlite3" "$NEXT_RUN_ID" > "$EVID/04b-no-tool-settle/next.json"
python3 - "$EVID/04b-no-tool-settle/next.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
assert d['run'][0]['status'] == 'SUCCEEDED', d['run'][0]['status']
assert d['run'][0]['active_slot'] is None
assert d['bindings'][0]['state'] == 'SETTLED', d['bindings']
assert d['dispatch'][0].get('transport') == 'acp', d['dispatch']
print('sequential-after-no-tool-ok')
PY
```

### 5.6 关停与子进程回收

最后一个演练停掉内核，证明 lifespan 的 `finally` 经 `RunDispatcher.close()` 关闭 transport 并回收 child，而不是留下孤儿进程或永远占住 dispatcher lock。

```bash
mkdir -p "$EVID/04c-shutdown"
ACP_PID="$(pgrep -P "$KERNEL_PID" -f 'analytics-acp' | head -1)"
test -n "$ACP_PID" || { echo 'FAIL no ACP child before shutdown'; exit 1; }
echo "$ACP_PID" | tee "$EVID/04c-shutdown/acp.pid"
kill -TERM "$KERNEL_PID"
wait "$KERNEL_PID" 2>/dev/null || true
kill -0 "$KERNEL_PID" 2>/dev/null && { echo 'FAIL kernel still running'; exit 1; }
for i in $(seq 1 100); do kill -0 "$ACP_PID" 2>/dev/null || break; sleep 0.1; done
kill -0 "$ACP_PID" 2>/dev/null && { echo 'FAIL ACP child orphaned'; exit 1; }
echo shutdown-reaped | tee "$EVID/04c-shutdown/reaped.txt"
python3 - "$STATE_DIR" <<'PY'
import fcntl, os, sys, time
path = os.path.join(sys.argv[1], '.dispatcher.lock')
deadline = time.monotonic() + 10
while True:
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        if time.monotonic() >= deadline:
            raise SystemExit('dispatcher lock still held')
        time.sleep(0.1)
    else:
        os.close(fd)
        print('dispatcher-lock-released')
        break
PY
```

预期结果是 `shutdown-reaped` 与 `dispatcher-lock-released`：`SIGTERM` 后内核在 10 秒内退出，child 在 10 秒内消失，lock 可重新获取。通过判据是三条都成功。若 child 仍存活，检查 lifespan 是否执行到 `dispatcher.close()`，不要手工 `kill -9` 后记为通过。

## 6. stdout 纯净度

ACP 子进程的 stdout 只允许 JSON-RPC 2.0。日志、banner 和任何普通文本都必须走 stderr。transport 在读到非 JSON-RPC 行时会直接让 child 失败，`observe` 随之丢失结算；正常 run 能 `SUCCEEDED` 本身已经说明该窗口没有污染，本节再用直接探针给出字节级证据。

先做最小 `initialize` 探针，不依赖模型凭据。

```bash
mkdir -p "$EVID/08-stdout"
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  | DSH_HOME="$ACP_HOME" "$DSH_BIN" --profile analytics-acp \
      > "$EVID/08-stdout/init.stdout" 2> "$EVID/08-stdout/init.stderr"
```

再做一次 `initialize` 加 `session/new` 探针，证明 tools-only 组合能真正创建会话。`sleep` 保持 stdin 打开，避免 `session/new` 在创建过程中被 EOF 打断。

```bash
{ printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
  printf '%s\n' "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"session/new\",\"params\":{\"cwd\":\"$ACP_WORK\",\"mcpServers\":[]}}"
  sleep 20
} | timeout 60 env DSH_HOME="$ACP_HOME" "$DSH_BIN" --profile analytics-acp \
      > "$EVID/08-stdout/session.stdout" 2> "$EVID/08-stdout/session.stderr"
```

预期结果是两个 stdout 文件里每一行都是 JSON-RPC 2.0，`session.stdout` 的第二条响应带 `result.sessionId`，stderr 可以包含诊断日志。通过判据是下面的断言全部通过，并且 `kernel.err` 没有 `ACP stdout` 或 `contamination`。

```bash
python3 - "$EVID/08-stdout/init.stdout" "$EVID/08-stdout/session.stdout" <<'PY'
import json, sys
for path in sys.argv[1:]:
    lines = [line for line in open(path, 'rb').read().splitlines() if line.strip()]
    assert lines, f'{path} empty'
    for line in lines:
        msg = json.loads(line)
        assert msg.get('jsonrpc') == '2.0', (path, msg)
        assert 'method' in msg or ('id' in msg and ('result' in msg or 'error' in msg)), (path, msg)
print('stdout-pure')
PY
python3 - "$EVID/08-stdout/session.stdout" <<'PY'
import json, sys
msgs = [json.loads(line) for line in open(sys.argv[1], 'rb').read().splitlines() if line.strip()]
new = [m for m in msgs if m.get('id') == 2]
assert len(new) == 1 and isinstance(new[0].get('result', {}).get('sessionId'), str), msgs
print('session-new-ok', new[0]['result']['sessionId'])
PY
grep -E 'ACP stdout|contamination' "$EVID/kernel.err" "$EVID/07-kernel-restart/kernel.err" && { echo 'FAIL contaminated'; exit 1; } || true
```

通过判据是 stdout 的每一行都能 `json.loads` 成 JSON-RPC 2.0 响应，`session/new` 返回 `sessionId`，stderr 与 `kernel.err` 里没有污染记录。如果 `kernel.err` 出现 `ACP stdout is not JSON-RPC`，本次验收直接 `FAIL`，不要删除日志或重试掩盖。

## 7. 证据路径与保留物

证据根使用新建的 0700 目录，例如 `/srv/acp-acceptance/2026-11-05-<ticket>`。不要复用上一轮目录，不要写到仓库。必须保留的原始件如下。

| 路径 | 内容 | 说明 |
|---|---|---|
| `00-preconditions/` | rc.5 head、CLI 版本、pack sha256、pnpm 版本、目录权限、`acp_env` 检查 | 证明宿主与输入 |
| `01-profile/` | `package.json`、`cordis.patch.yml`、`pnpm-workspace.yaml` 与 sha256 | 证明生成物 |
| `02-install.log`、`02-install/package.json`、`02-install/pnpm-lock.yaml`、`02-install/patch.diff` | 安装日志、安装后的 profile 清单与锁、生成 patch 对比 | 证明安装与“无 row config” |
| `03-dump-config.yml`、`03-check-dump.log` | dump 与断言输出 | 0600，另记 sha256；不含 token |
| `04-normal/settle.json` | run、dispatch、steps、bindings、events 的只读快照 | 正常结算 receipt 与真实 `tool_call_id` |
| `04-normal/callback/` | ACP C2 回调探针的 status/body | 证明路由、拒绝语义与 token 分离 |
| `04a-child-env/keys.txt`、`04a-child-env/acp.pid` | 子进程 env 键名与 PID | 证明 allowlist、无 bridge id、token 分离 |
| `05-cancel/settle.json`、`05-cancel/pre-cancel.json` | cancel 结算与 cancel 前状态 | 证明 cancel 发生在结算前 |
| `06-sigkill-resume/settle.json`、`04-normal/settle.json` | 两次 binding 的 `acp_session_id` 对比 | 证明 resume 而不是新会话 |
| `07-kernel-restart/bound.json`、`07-kernel-restart/after.json`、`07-kernel-restart/next.json` | 重启前后的 run、dispatch、bindings，以及重启后的前进 run | 证明 fence 到 `LOST`/`FAILED`、槽位释放且未重派 |
| `04b-no-tool-settle/settle.json`、`04b-no-tool-settle/next.json` | no-tool 结算与后续正常 run | 证明 `FAILED`/`EXECUTION_UNKNOWN` + `SETTLED` + 槽位释放 |
| `04c-shutdown/reaped.txt` | 关停回收回执 | 证明 child 被 lifespan 回收、lock 释放 |
| `08-stdout/init.stdout`、`08-stdout/session.stdout`、`08-stdout/*.stderr` | 子进程 stdout 与 stderr | 证明纯净度 |
| `09-shadow-diff.json`、`09-shadow-diff.log` | 3c 离线对拍报告与退出码 | 证明语料无 `UNEXPECTED` |
| `10-rollback/` | 回退前后 health、cutover 前 head、回退 run 结算 | 证明回退可执行；config 含 token，不复制到证据目录 |
| `MANIFEST.sha256` | 以上所有可分享文件的 sha256 | 证据清单 |
| `README.md` | 宿主、pin、执行人、日期、每步 PASS/FAIL、开放项 | 人读索引 |

生成 shadow-diff 报告并记录退出码。

```bash
node scripts/ci/rc5-shadow-compare.mjs \
  --fixtures scripts/ci/fixtures/rc5-shadow \
  --out "$EVID/09-shadow-diff.json" | tee "$EVID/09-shadow-diff.log"
python3 - "$EVID/09-shadow-diff.json" <<'PY'
import json, sys
report = json.load(open(sys.argv[1], encoding='utf-8'))
assert report['summary']['unexpected'] == 0, report['summary']
print('shadow-ok', report['summary'])
PY
```

通过判据是对拍命令退出码 0，`summary.unexpected` 为 0。`MISSING_IN_ACP` 与 `EXPECTED_CODEC_COLLAPSE` 可以保留，但必须在 `README.md` 里逐条引用设计 R3 或 3c 分类，不能新增未解释差异。最后生成清单。

```bash
python3 - "$EVID" <<'PY'
import hashlib, os, sys
root = sys.argv[1]
lines = []
for base, _, files in os.walk(root):
    for name in files:
        if name == 'MANIFEST.sha256':
            continue
        path = os.path.join(base, name)
        digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
        lines.append(f'{digest}  {os.path.relpath(path, root)}')
open(os.path.join(root, 'MANIFEST.sha256'), 'w', encoding='utf-8').write('\n'.join(sorted(lines)) + '\n')
print('manifest-entries', len(lines))
PY
```

## 8. 回退到 bridge

回退是内核配置切换加 cutover 前内核 checkout，不是改代码、锁或 profile。先停掉 ACP 内核，保留 `acp_bindings` 与全部证据，再用 cutover 前的内核 checkout 启动 `transport=bridge`。

```bash
mkdir -p "$EVID/10-rollback"
STATE_DIR_ROLLBACK="$EVID/10-rollback/state"
mkdir -m 0700 -p "$STATE_DIR_ROLLBACK"
kill -TERM "$KERNEL_PID" 2>/dev/null || true
wait "$KERNEL_PID" 2>/dev/null || true
python3 - "$KERNEL_CONFIG" "$KERNEL_CONFIG.rollback" "$STATE_DIR_ROLLBACK" <<'PY'
import json, sys
cfg = json.loads(open(sys.argv[1], encoding='utf-8').read().splitlines()[0])
cfg['transport'] = 'bridge'
cfg['state_dir'] = sys.argv[3]
for key in ('acp_cwd', 'acp_home', 'acp_env', 'acp_args', 'acp_command', 'acp_base_url',
            'acp_timeout_ms', 'acp_cancel_grace_ms', 'acp_close_timeout_ms',
            'acp_write_timeout_ms', 'acp_callback_token'):
    cfg.pop(key, None)
open(sys.argv[2], 'w', encoding='utf-8').write(json.dumps(cfg, separators=(',', ':')) + '\n')
print('rollback-config-written')
PY
git -C "$PRE_CUTOVER_REPO" rev-parse HEAD | tee "$EVID/10-rollback/pre-cutover-head.txt"
(cd "$PRE_CUTOVER_REPO" && python3.14 -m backend.analytics_runtime < "$KERNEL_CONFIG.rollback" \
  > "$EVID/10-rollback/kernel.out" 2> "$EVID/10-rollback/kernel.err") &
KERNEL_PID=$!
for i in $(seq 1 60); do
  curl -fsS -H "authorization: Bearer $GATEWAY_TOKEN" \
    "http://127.0.0.1:$PORT/internal/native/context" > "$EVID/10-rollback/health.json" 2>/dev/null || true
  if python3 -c "import json; raise SystemExit(0 if json.load(open('$EVID/10-rollback/health.json'))['ready'] is True else 1)" 2>/dev/null; then
    break
  fi
  sleep 1
done
python3 -c "import json; assert json.load(open('$EVID/10-rollback/health.json'))['ready'] is True" \
  && echo bridge-ready | tee "$EVID/10-rollback/health.txt"
```

预期结果是 cutover 前内核以 `bridge` 启动，`ready` 为 `true`。回退 run 使用新的 `STATE_DIR_ROLLBACK`，但原因不再是 5.4 占槽（它已经释放槽位）：新的 state dir 让 cutover 的 `acp_bindings`、事件和 run 记录保持只读证据，避免旧内核按不同 schema 写同一库。回退 run 直接复用 5.1 的 prompt 与轮询命令块，把 `$EVID/04-normal` 全部换成 `$EVID/10-rollback/run`，只断言 `run.status == SUCCEEDED` 与 `dispatch.state == EXITED`，不要断言 `dispatch.transport == acp`。然后确认旧的 `acp_bindings` 行仍在。

```bash
python3 - "$STATE_DIR/runs.sqlite3" <<'PY'
import sqlite3, sys
con = sqlite3.connect(f'file:{sys.argv[1]}?mode=ro', uri=True)
count = con.execute("SELECT count(*) FROM acp_bindings").fetchone()[0]
assert count >= 1, count
print('bindings-preserved', count)
PY
```

以下对象必须在回退窗口内保持不动，不能为了回退删除或重写。

| 对象 | 要求 |
|---|---|
| W 宿主与 `business` profile | 不重启、不改 profile、不删 bridge 行 |
| W 侧 bridge 端口块与 `B0_RUNTIME_TOKEN` | 保留到 cutover 后一个 release，回退窗口结束前不删 |
| `config/*lock*.json` 与 sealed composition artifact | 不改、不重算，回退不是重新密封 |
| `dsh-plugins/` 源码与 workbench pack | 不改、不重打包 |
| `acp_home` 与 `profiles/analytics-acp` | 保留，回退不清理 ACP 现场 |
| `acp_bindings` 表与 `runs.sqlite3` | 保留，旧行只读，不删除、不改写 |
| CRM 数据、DuckDB、生产配置 | 完全不动 |

通过判据是 bridge ready 为 `true`、一条 bridge run `SUCCEEDED`、旧 binding 计数不减少、上述对象均无改动。回退后仍在飞的 ACP attempt 在重启时按 5.4 的规则 fence 成 `LOST`，绝不重新派发；不要尝试用同一个 attempt 重新 prompt。

## 9. 剩余 cutover 构建工作量

以下各项仍未在 main `e09ff4f` 合入，是本清单在 cutover 构建上执行前必须补齐的工作。#237 解决的是 P3-3 的回收与回调阻塞（0.1），不包含这些构建项。

| 项 | main `e09ff4f` 的证据 | 本清单的依赖 | 完成判据 |
|---|---|---|---|
| `dispatch_intents.transport` 列与 canary | [jobs.py](../../backend/services/analytics/jobs.py) 的 `CREATE TABLE dispatch_intents` 只有 `state`/`attempts`，dispatch 不写 transport；3c 只有离线 shadow compare | 5.1 至 5.5 的 `dispatch.transport == 'acp'` | 迁移列（additive）、dispatch 时写 `acp`、receipt/诊断可读；补 S-B 在线 canary：`hash(request_id) % N` 分流与两路径计数，离线报告不能代替 |
| bridge 删除范围 | `HostBridge` 仍是默认，`/internal/native/*`、`B0_PORT_BASE`/`B0_RUNTIME_TOKEN`/`B0_SESSION_ID` 仍被 [serve.mjs](../../scripts/dsh-b0/serve.mjs)、`bridge.ts`、[runtime.py](../../backend/services/analytics/runtime.py) 使用 | 1.7 与 8；删得过宽会破坏 `query` 家族 | b0 自动化不再有 W 侧 bridge row/端口块/token；`query` 家族 bridge 保持并有测试；回退窗口内可切回 |
| identity 归属 | [acp_transport.py](../../backend/services/analytics/acp_transport.py) 的 `CAPABILITIES` 不含 `identity`；[native_identity.py](../../backend/services/analytics/first_purchase/native_identity.py) 仍 `bridge.call("identity")`，ACP 路径会映射为 retryable `IDENTITY_UNAVAILABLE` | 1.7 的 `family` 选择与 8 的删除范围 | 明确 owner：b0 自动化用内核 registry actor；first_purchase/CRM identity 继续由 Host bridge 或其他已评审 owner 提供；删 bridge 不得让 identity 无 owner |
| 门禁转 blocking | [lint.yml](../../.github/workflows/lint.yml) 的 rc.5 surface gate job 与三个步骤仍是 `continue-on-error: true` | 不适用于单次演练，但决定 cutover 后能否长期守护 | 去掉 rc.5 gate 的 `continue-on-error`，把 ACP 相关测试纳入 merge-gate；回归能阻断合并 |
| 默认 transport 翻到 `acp` | [analytics_runtime.py](../../backend/analytics_runtime.py) 的 `build_host_transport` 默认 `bridge`；只有部署配置显式选择才走 ACP | 1.7 | 部署默认或唯一可选 ACP；保留 `transport=bridge` 回退开关与第 8 节证据 |
| 作者 pack 与 C0 前置 | #235 回填了作者 repack、锁链和 sealed artifact；作者 PR #16 仍未合；`competition-c0-contract.generated.d.ts` 仍是已评审例外 | 1.3 的 pack/锁断言 | #16 合入并按 rc.5 重建作者 archive；重新回填 [dsh-acp-profile.lock.json](../../config/dsh-acp-profile.lock.json) 的 `entry_sha256`/`patch_sha256`；C0 例外在 author archive 重建后移除或重新说明 |

`dispatch_intents.transport` 的 canary 与 S-B 双路径流量属于 3c 的在线部分，本清单的 5.x 只证明单路径 ACP 结算，不证明分流比例。identity 与门禁两项也不在本清单的演练范围内，必须在 cutover 构建评审中单独签字。

## 10. 本清单仍然不能证明什么

- 在线金丝雀比例和 S-B 双路径流量。本清单只做单宿主、单路径验收，不给 `hash(request_id) % N` 的分流比例或双路径行数。
- 生产流量、真实用户会话、真实 CRM 与仓库数据、多租户身份。所有 run 都是验收夹具或部署允许的自动化。
- `query` 家族和用户聊天路径。它们按设计留在 bridge，本清单不覆盖。
- ACP identity。`AcpTransport` 不提供 `identity` 操作，本清单的 b0 自动化也不调用它；first_purchase/CRM identity 的归属只作为第 9 节的构建前置，不做运行时演练。
- 并发与排队。设计接受自动化 run 串行，本清单不证明子进程池、队列或多会话并发。
- 审批路径和拒绝 UX。`session/requestPermission` 的机器 allowlist、人工审批和工具拒绝没有在本清单逐项演练。
- 原因保真度。`blocked`、`aborted`、`interrupted` 在 rc.5 codec 里的塌缩仍在，本清单不证明 `NEEDS_INPUT` 可恢复。
- 高负载下的 update 丢失率、长 prompt 的延迟、超时分布和背压。
- callback token 的轮换或长期保管。`CALLBACK_TOKEN` 是 per-boot 能力，本清单只证明它与其他两个 token 分离，不证明轮换。
- Windows、WSL 跨 OS 和跨文件系统。本清单假定同一 OS、同一 home、精确 cwd。
- 生产回退演练。本清单只做受控回退，不证明真实流量下的回退窗口。
- workbench 作者仓 repack 之外的供应链。pack 只按 1.3 的摘要和合同核对，不替代作者仓的发布身份或签名。
