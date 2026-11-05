# ACP 真机切换验收（P3-3d cutover）

状态为 **待执行**。本文件是 pinned rc.5 真机上的验收清单，不是执行记录。截至本文件落地，下列步骤全部为 `NOT_RUN`；任何一步没有原始回执都不能记为通过。基线是 main `60d7f4e8`（#234），默认 transport 仍是 `bridge`，本清单只在 cutover 构建上执行。

本清单覆盖设计 §7 的 3d 真机项，即真实 `--dump-config`、真实模型 tool call、cancel 结算、子进程 SIGKILL 后 `session/resume`、内核重启后的 `acp_bindings` fence、stdout 纯净度和受控回退。它不覆盖 `query` 家族、在线金丝雀比例和生产流量，边界见第 9 节。

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
| `RUNTIME_TOKEN` | 内核配置里的 `runtime_token`，供 K 的 native 路由校验 |
| `GATEWAY_TOKEN` | 内核配置里的 `gateway_token`，供公开 run API 读取 |
| `PRE_CUTOVER_REPO` | 回退用的 cutover 前内核 checkout，记录 head 与依赖摘要 |

在 bash 下执行并先设置 `set -o pipefail` 和 `umask 077`，不要在 shell 里开 `set -x`。token 只从既有 0600 环境文件或内核私密配置读取，不写进命令行、不写进仓库、不打印到终端。证据里出现 token 的文件按秘密材料处理。

本清单引用的生成器是 [acp-profile.mjs](../../scripts/dsh-b0/acp-profile.mjs)，锁是 [dsh-acp-profile.lock.json](../../config/dsh-acp-profile.lock.json)，tools-only 入口是 [entry-tools.ts](../../dsh-plugins/analytics-workbench/src/entry-tools.ts)，transport 是 [acp_transport.py](../../backend/services/analytics/acp_transport.py)。

命令按 Linux coreutils 写。macOS 上把 `sha256sum` 换成 `shasum -a 256`，`timeout` 换成 `gtimeout`，`stat` 相关断言换成 Python 实现。

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

预期结果是包名 `@shine-mage/dsh-analytics-workbench-b0`、版本 `0.0.0-b0`、`./tools` 指向 `./lib/entry-tools.js`、`./cordis.acp.patch.yml` 存在且 sha256 等于锁里的 `patch_sha256`。通过判据是上面的 `node` 断言全部通过，并且 `lib/entry-tools.js` 非空。作者仓 repack 仍在进行，pack 必须来自新的 workbench head；如果 pack 与当前主仓锁不一致，先完成 repack 与锁回填，不要用旧 pack 通过本步。

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

### 1.5 必需环境与 bridge 遗留变量

```bash
env -0 | tr '\0' '\n' | grep -E '^DEEPSEEK_API_KEY=' | sed 's/=.*/=<set>/' \
  | tee "$EVID/00-preconditions/model-env.txt"
for name in B0_SESSION_ID B0_SESSION_IDS B0_PORT_BASE B0_RUNTIME_TOKEN B0_GATEWAY_TOKEN; do
  if printenv "$name" >/dev/null; then echo "FAIL $name is set"; fi
done | tee "$EVID/00-preconditions/legacy-env.txt"
```

预期结果是模型凭据已设置，五个 bridge 时代的变量全部不存在。通过判据是 `legacy-env.txt` 为空。ACP 子进程会继承内核环境，残留的 `B0_SESSION_ID`、`B0_PORT_BASE` 或 `B0_RUNTIME_TOKEN` 会让 typed tool 走回 bridge 形状，5.1 的守卫断言就失去意义。如果部署确实还需要 `B0_RUNTIME_FAMILY` 来选 family，只允许保留这一个非秘密变量，并在 README 记录原因。

### 1.6 cutover 构建必须已含的项

本清单是 cutover 门禁，不是 #234 的门禁。下面的项在 #234 之后才合入；缺任何一项时本清单会在对应步骤失败。

| 项 | 被哪一步证明 | 缺失时的可观察结果 |
|---|---|---|
| typed tool 的 `B0_SESSION_ID` 守卫重做，三个 family 都按 K 的 dispatch 绑定识别 ACP 随机 UUID | 5.1 | 工具执行报 `no bound execution context`，run 不结算 SUCCEEDED |
| tools 行的 `baseUrl` 与 `runtimeToken` Config 注入 | 3.2 和 4 | 工具回落到 `B0_PORT_BASE`，连接失败或打到错误端口 |
| `dispatch_intents.transport` 列，dispatch 时写 `acp` | 5.1 至 5.4 的 receipt | `dispatch.transport` 不存在，无法证明 attempt 由 ACP 路径持有 |
| bridge 行、端口块和 token 的删除范围与回退窗口 | 8 | 回退时没有可用的 cutover 前内核或 W 侧 bridge 行 |

### 1.7 内核 ACP 块

内核配置沿用部署已有的 bridge 配置，只把 transport 块换成下面这组键。`KERNEL_CONFIG` 必须是单行 JSON、0600，由内核从 stdin 读取。

```json
{
  "transport": "acp",
  "acp_cwd": "<ACP_WORK 的绝对路径>",
  "acp_home": "<ACP_HOME 的绝对路径>",
  "acp_command": "<DSH_BIN 的绝对路径>",
  "acp_args": ["--profile", "analytics-acp"],
  "acp_timeout_ms": 30000,
  "acp_cancel_grace_ms": 5000,
  "acp_close_timeout_ms": 2000
}
```

预期结果是 `AcpTransport.from_config` 接受该块，`acp_cwd` 已存在，`acp_home` 是私有目录，`acp_command` 是绝对路径，`acp_cancel_grace_ms` 是非负整数，`acp_close_timeout_ms` 是正整数。通过判据是这些字段都由 [acp_transport.py](../../backend/services/analytics/acp_transport.py) 的 `from_config` 校验通过，并且内核启动后 health 的 `ready` 为 `true`。模型凭据由内核环境继承，不用 `acp_env` 传递秘密；只有非默认 family 才在 `acp_env` 里放 `B0_RUNTIME_FAMILY`。执行 5.x 前从 `KERNEL_CONFIG` 读出并导出 `SESSION_ID`、`RUNTIME_TOKEN`、`GATEWAY_TOKEN`，不要在命令里手写 token。`KERNEL_CONFIG` 的 `state_dir` 必须与第 5 节使用的 `$STATE_DIR` 是同一个绝对路径。

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

预期结果是 `acp-profile --check ok`，写出三个文件，patch 与 `--print-patch` 逐字节一致，bundle 列表是 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-acp-app`，文件模式是 0600。通过判据是 `01-profile-patch.diff` 为空、`node` 断言通过、三个文件齐全。`--write` 默认拒绝覆盖；需要重跑时先把旧目录整体归档到 `$EVID/01-profile-old/`，再用 `--write "$PROFILE" --force`，不要手工编辑生成物。

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

### 3.2 给 tools 行注入内核 origin 与 token

生成的 patch 只插入 row，不带 config。真实工具仍需要 `baseUrl` 和 `runtimeToken`，否则会回落到即将删除的 `B0_PORT_BASE`。用同一份内核配置生成 home 层 patch，避免两份值漂移。

```bash
python3 - "$KERNEL_CONFIG" "$ACP_HOME/cordis.patch.yml" <<'PY'
import json, os, re, sys
cfg = json.loads(open(sys.argv[1], encoding='utf-8').read().splitlines()[0])
base = cfg.get('base_url')
token = cfg.get('runtime_token')
assert isinstance(base, str) and base.startswith('http://127.0.0.1:'), 'kernel base_url'
assert isinstance(token, str) and re.fullmatch(r'[A-Za-z0-9_-]{32,256}', token), 'kernel runtime_token'
text = (
    '- id: analytics-workbench-tools\n'
    '  config:\n'
    f'    baseUrl: {base}\n'
    f'    runtimeToken: {token}\n'
)
open(sys.argv[2], 'w', encoding='utf-8').write(text)
os.chmod(sys.argv[2], 0o600)
print('home-patch-written')
PY
chmod 600 "$ACP_HOME/cordis.patch.yml"
sha256sum "$ACP_HOME/cordis.patch.yml" | tee "$EVID/02-home-patch.sha256"
```

预期结果是 `home-patch-written`，home patch 模式 0600，`baseUrl` 与内核 `base_url` 一致。通过判据是脚本断言通过且文件可读。该文件含 `runtimeToken`，按秘密材料处理，不进仓库、不进可分享证据。

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
if (!/baseUrl:\s*http:\/\/127\.0\.0\.1:\d+/.test(block)) throw new Error('tools row baseUrl');
if (!/runtimeToken:/.test(block)) throw new Error('tools row runtimeToken');
console.log('dump-shape-ok');
NODE
```

预期结果是 `--dump-config` 退出码 0，`--check-dump` 打印 `acp-profile --check-dump ok`，dump 里恰好一个 tools 行、没有 bare 行、tools 行内没有 `connection`、`webServer`、`createServer` 或 `bridge`，并且带 `baseUrl` 和 `runtimeToken`。通过判据是上述三条命令都成功。dump 是秘密材料，因为 row 的 config 含 `runtimeToken`；保留 0600 原件与 sha256，可分享证据只放脱敏副本。

```bash
python3 - "$ACP_HOME/03-dump-config.yml" "$EVID/03-dump-config.redacted.yml" "$KERNEL_CONFIG" <<'PY'
import hashlib, json, sys
raw, out, cfg_path = sys.argv[1:]
cfg = json.loads(open(cfg_path, encoding='utf-8').read().splitlines()[0])
text = open(raw, encoding='utf-8').read()
for key in ('runtime_token', 'gateway_token'):
    value = cfg.get(key)
    if value:
        text = text.replace(value, '<REDACTED>')
open(out, 'w', encoding='utf-8').write(text)
print('redacted-sha256', hashlib.sha256(open(out, 'rb').read()).hexdigest())
PY
sha256sum "$ACP_HOME/03-dump-config.yml" | tee "$EVID/03-dump-config.sha256"
```

预期结果是脱敏副本里不再出现两个 token，原件的 sha256 已记录。原件留在 `$ACP_HOME`，不进证据目录；只有脱敏副本和 sha256 进入可分享证据。通过判据是脱敏后 `grep -F "$RUNTIME_TOKEN"` 与 `grep -F "$GATEWAY_TOKEN"` 都为空。

## 5. 真实运行演练

以下四个演练按顺序执行。每个演练使用独立的 `$EVID/04-normal`、`$EVID/05-cancel`、`$EVID/06-sigkill-resume`、`$EVID/07-kernel-restart`；每次 run 都新建 `requestId`，不复用旧 id。5.1 至 5.3 必须在 5.4 之前完成，因为 5.4 会让 run 停在 UNKNOWN 并占用唯一 active slot。

先启动内核并等待 ACP health 就绪。

```bash
cd "$REPO"
mkdir -p "$EVID/04-normal"
python3.14 -m backend.analytics_runtime < "$KERNEL_CONFIG" \
  > "$EVID/kernel.out" 2> "$EVID/kernel.err" &
KERNEL_PID=$!
echo "$KERNEL_PID" | tee "$EVID/kernel.pid"
for i in $(seq 1 60); do
  if curl -fsS -H "authorization: Bearer $RUNTIME_TOKEN" \
      "http://127.0.0.1:$PORT/internal/native/context" > "$EVID/health.json" 2>/dev/null; then
    break
  fi
  sleep 1
done
python3 -c "import json; assert json.load(open('$EVID/health.json'))['ready'] is True" \
  && echo ready | tee "$EVID/health.txt"
```

预期结果是 `ready`。`ready` 为 `true` 说明 ACP 的 `initialize` 与 `session/list` 成功；如果为 `false`，先看 `$EVID/kernel.err` 里的 `acp:` 行，不要继续。

先创建一次只读抽查脚本，供四个演练共用。脚本只读 SQLite，不写内核库。

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
  -H "authorization: Bearer $RUNTIME_TOKEN" -H 'content-type: application/json' \
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
  -H "authorization: Bearer $RUNTIME_TOKEN" -H 'content-type: application/json' \
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
  -H "authorization: Bearer $RUNTIME_TOKEN" -H 'content-type: application/json' \
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

本步让一个 prompt 在飞时 SIGKILL 内核，重启后证明旧的 `BOUND` 被 fence 成 `LOST`，并且同一个 attempt 没有被重新 dispatch。它会占用唯一 active slot，所以放在最后。

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
  -H "authorization: Bearer $RUNTIME_TOKEN" -H 'content-type: application/json' \
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
for i in $(seq 1 30); do kill -0 "$KERNEL_PID" 2>/dev/null || break; sleep 0.2; done
for i in $(seq 1 30); do pgrep -f 'analytics-acp' >/dev/null || break; sleep 0.2; done
cd "$REPO"
python3.14 -m backend.analytics_runtime < "$KERNEL_CONFIG" \
  > "$EVID/07-kernel-restart/kernel.out" 2> "$EVID/07-kernel-restart/kernel.err" &
KERNEL_PID=$!
echo "$KERNEL_PID" | tee "$EVID/07-kernel-restart/kernel.pid"
for i in $(seq 1 60); do
  if curl -fsS -H "authorization: Bearer $RUNTIME_TOKEN" \
      "http://127.0.0.1:$PORT/internal/native/context" > "$EVID/07-kernel-restart/health.json" 2>/dev/null; then
    break
  fi
  sleep 1
done
python3 "$EVID/capture.py" "$STATE_DIR/runs.sqlite3" "$RUN_ID" > "$EVID/07-kernel-restart/after.json"
```

预期结果是重启后 run 变为 `UNKNOWN`，`error_code` 为 `EXECUTION_UNKNOWN`，`dispatch.state` 为 `UNKNOWN`，binding 变为 `LOST`，`active_slot` 仍为 1，`dispatch.attempts` 与重启前相同，binding 行数仍为 1，事件里没有新的 `run.started`。通过判据是下面的断言全部通过。

```bash
python3 - "$EVID/07-kernel-restart/before.json" "$EVID/07-kernel-restart/after.json" <<'PY'
import json, sys
before = json.load(open(sys.argv[1], encoding='utf-8'))
after = json.load(open(sys.argv[2], encoding='utf-8'))
b_run, a_run = before['run'][0], after['run'][0]
assert before['bindings'][0]['state'] == 'BOUND', before['bindings']
assert after['bindings'][0]['state'] == 'LOST', after['bindings']
assert len(after['bindings']) == 1, after['bindings']
assert a_run['status'] == 'UNKNOWN', a_run['status']
assert a_run['error_code'] == 'EXECUTION_UNKNOWN', a_run['error_code']
assert a_run['active_slot'] == 1, a_run['active_slot']
assert after['dispatch'][0]['state'] == 'UNKNOWN', after['dispatch']
assert after['dispatch'][0]['attempts'] == before['dispatch'][0]['attempts'], 'attempts moved'
assert a_run['attempt_id'] == b_run['attempt_id'], 'attempt changed'
new_events = after['events'][len(before['events']):]
assert all(e.get('type') != 'run.started' for e in new_events), 'redispatched'
print('kernel-restart-ok')
PY
```

如果 `bound.json` 的 binding 不是 `BOUND`，说明 prompt 在 kill 前已经结算，本次 run 作废，换一个更长的自动化重跑，不要修改断言迁就结果。如果重启后出现第二条 `acp_bindings` 行、`dispatch.attempts` 增加或新的 `run.started`，本步 `FAIL`，这表示同一个 attempt 被重新派发，属于设计禁止的双副作用。

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
grep -E 'ACP stdout|contamination' "$EVID/kernel.err" && { echo 'FAIL contaminated'; exit 1; } || true
```

通过判据是 stdout 的每一行都能 `json.loads` 成 JSON-RPC 2.0 响应，`session/new` 返回 `sessionId`，stderr 与 `kernel.err` 里没有污染记录。如果 `kernel.err` 出现 `ACP stdout is not JSON-RPC`，本次验收直接 `FAIL`，不要删除日志或重试掩盖。

## 7. 证据路径与保留物

证据根使用新建的 0700 目录，例如 `/srv/acp-acceptance/2026-11-05-<ticket>`。不要复用上一轮目录，不要写到仓库。必须保留的原始件如下。

| 路径 | 内容 | 说明 |
|---|---|---|
| `00-preconditions/` | rc.5 head、CLI 版本、pack sha256、pnpm 版本、目录权限、env 检查 | 证明宿主与输入 |
| `01-profile/` | `package.json`、`cordis.patch.yml`、`pnpm-workspace.yaml` 与 sha256 | 证明生成物 |
| `02-install.log`、`02-install/package.json`、`02-install/pnpm-lock.yaml`、`02-home-patch.sha256` | 安装日志、安装后的 profile 清单与锁、home patch 摘要 | 证明安装与 row config |
| `03-dump-config.redacted.yml`、`03-check-dump.log` | 脱敏 dump 与断言输出 | 原件 0600，另记 sha256 |
| `04-normal/settle.json` | run、dispatch、steps、bindings、events 的只读快照 | 正常结算 receipt 与真实 `tool_call_id` |
| `05-cancel/settle.json`、`05-cancel/pre-cancel.json` | cancel 结算与 cancel 前状态 | 证明 cancel 发生在结算前 |
| `06-sigkill-resume/settle.json`、`04-normal/settle.json` | 两次 binding 的 `acp_session_id` 对比 | 证明 resume 而不是新会话 |
| `07-kernel-restart/bound.json`、`07-kernel-restart/after.json` | 重启前后的 run、dispatch、bindings | 证明 fence 到 LOST 且未重派 |
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
kill -TERM "$KERNEL_PID"; wait "$KERNEL_PID" 2>/dev/null || true
python3 - "$KERNEL_CONFIG" "$KERNEL_CONFIG.rollback" "$STATE_DIR_ROLLBACK" <<'PY'
import json, sys
cfg = json.loads(open(sys.argv[1], encoding='utf-8').read().splitlines()[0])
cfg['transport'] = 'bridge'
cfg['state_dir'] = sys.argv[3]
for key in ('acp_cwd', 'acp_home', 'acp_env', 'acp_args', 'acp_command',
            'acp_timeout_ms', 'acp_cancel_grace_ms', 'acp_close_timeout_ms'):
    cfg.pop(key, None)
open(sys.argv[2], 'w', encoding='utf-8').write(json.dumps(cfg, separators=(',', ':')) + '\n')
print('rollback-config-written')
PY
git -C "$PRE_CUTOVER_REPO" rev-parse HEAD | tee "$EVID/10-rollback/pre-cutover-head.txt"
(cd "$PRE_CUTOVER_REPO" && python3.14 -m backend.analytics_runtime < "$KERNEL_CONFIG.rollback" \
  > "$EVID/10-rollback/kernel.out" 2> "$EVID/10-rollback/kernel.err") &
KERNEL_PID=$!
for i in $(seq 1 60); do
  if curl -fsS -H "authorization: Bearer $RUNTIME_TOKEN" \
      "http://127.0.0.1:$PORT/internal/native/context" > "$EVID/10-rollback/health.json" 2>/dev/null; then
    break
  fi
  sleep 1
done
python3 -c "import json; assert json.load(open('$EVID/10-rollback/health.json'))['ready'] is True" \
  && echo bridge-ready | tee "$EVID/10-rollback/health.txt"
```

预期结果是 cutover 前内核以 `bridge` 启动，`ready` 为 `true`。回退 run 使用新的 `STATE_DIR_ROLLBACK`，因为 5.4 的 UNKNOWN run 仍占用原 `STATE_DIR` 的唯一 active slot；旧 `STATE_DIR` 只读保留。回退 run 直接复用 5.1 的 prompt 与轮询命令块，把 `$EVID/04-normal` 全部换成 `$EVID/10-rollback/run`，只断言 `run.status == SUCCEEDED` 与 `dispatch.state == EXITED`，不要断言 `dispatch.transport == acp`。然后确认旧的 `acp_bindings` 行仍在。

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

## 9. 本清单仍然不能证明什么

- 在线金丝雀比例和 S-B 双路径流量。本清单只做单宿主、单路径验收，不给 `hash(request_id) % N` 的分流比例或双路径行数。
- 生产流量、真实用户会话、真实 CRM 与仓库数据、多租户身份。所有 run 都是验收夹具或部署允许的自动化。
- `query` 家族和用户聊天路径。它们按设计留在 bridge，本清单不覆盖。
- 并发与排队。设计接受自动化 run 串行，本清单不证明子进程池、队列或多会话并发。
- 审批路径和拒绝 UX。`session/requestPermission` 的机器 allowlist、人工审批和工具拒绝没有在本清单逐项演练。
- 原因保真度。`blocked`、`aborted`、`interrupted` 在 rc.5 codec 里的塌缩仍在，本清单不证明 `NEEDS_INPUT` 可恢复。
- 高负载下的 update 丢失率、长 prompt 的延迟、超时分布和背压。
- Windows、WSL 跨 OS 和跨文件系统。本清单假定同一 OS、同一 home、精确 cwd。
- 生产回退演练。本清单只做受控回退，不证明真实流量下的回退窗口。
- workbench 作者仓 repack 之外的供应链。pack 只按 1.3 的摘要和合同核对，不替代作者仓的发布身份或签名。
