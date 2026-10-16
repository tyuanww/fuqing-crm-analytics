# M2-09 alpha2 目标浏览器与目标恢复执行手册

> 版本：2026-10-16。此手册只用于隔离的 DSH `0.2.1-alpha.2` 候选，不改变主仓 DSH pin，也不授予生产激活或发布授权。

## 目标和边界

本手册要取得两项相互独立、可回读的目标证据：

1. 在批准的 Linux x86_64 / WSL2 目标上，用真实 headed browser 操作隔离 alpha2 candidate 页面。
2. 只重启本次由 runner 所有的 candidate 进程，重新加载同一页面，读回重启前写入的同一 history/board 记录。

这两项证据只证明 alpha2 candidate 的目标兼容性。它们不证明主仓已经适配 alpha2，不替代真实业务 UAT，不改变 M2-07 的状态，也不把 synthetic fixture 当作真实业务数据。

禁止以下动作：

- 修改、提交或替换 `dsh-plugins/plugin-kit/toolchain.json`。
- 使用 `--plugin off`、旧 rc2 服务、生产入口 helper 或仅 HTTP 的探针代替真实页面操作。
- 接管或重启 live 端口 `4328`、`4332`、`4336`。
- 复用旧的 `PASS` 回执。旧回执只作历史参考，必须产生新的 runner 绑定回执。
- 使用真实凭据、真实客户数据或真实模型调用。fixture 必须记录 `contains_real_data=false`、`model_calls=0`。

## 固定输入

| 项目 | 值 |
|---|---|
| 候选 SDK | `@deepseek-ai/dsh@0.2.1-alpha.2` |
| alpha2 upstream SHA | `d743267388641bc76f17c45ce8b4c231aed1d32c` |
| candidate source SHA | `1bb2646523a7c1cd5aa04d11080617a373af7147` |
| Cordis peer/runtime | `4.0.5-alpha.1` |
| dsh-tools | `0.2.1-alpha.2` |
| 本地 Node | `24.19.0` |
| 目标 Node | `24.21.0` |
| 目标 Python | `3.14.4` |
| 目标平台 | Linux x86_64 / WSL2 |
| 目标地址 | `100.93.46.46`，执行前仍须读取最新授权和 preflight |
| 预留 live 端口 | `4328, 4332, 4336`，禁止接管 |
| candidate 端口 | `4329`，冲突时改用新空闲端口并记录 |
| preparation | `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-prepared-peer-20261014/preparation.json` |
| preparation SHA | `待执行时由 sha256sum 读取，不能手填` |
| candidate 输入根 | `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-prepared-peer-20261014/` |
| 两份 profile | `profiles/dsh-profile.crm-knowledge.alpha2.json`、`profiles/dsh-profile.alpha2.json` |
| profile SHA | `f548cd19cb6b7c36e2d258bc14dbf03bbd2f5706f4a405494a71759d8204098b`、`680b2ed2cb7203f94cefb11ffbb701b998d2e487c67e4127fead8e78b29aa612` |
| preparation lock SHA | `53b85e28681e338bdab2d9817e51245af680c5f930e3b6dd79cbd8f2f4168f90` |

`preparation.json` 是九个 plugin pack 的 manifest/pack SHA 及来源 SHA 的权威清单。目标机必须逐项验证它，不得凭文档中的摘要跳过校验。

## 执行前检查

### 1. 主仓 pin 不变

在主仓工作树执行：

```bash
set -eu
repo="$PWD"
python3 - <<'PY'
import json
from pathlib import Path
p = Path("dsh-plugins/plugin-kit/toolchain.json")
d = json.loads(p.read_text())
expected = {
    "sdk_version": "0.1.7-rc.2",
    "upstream_sha": "477b4f420553e8a52c2fbccc464d7561b239c443",
    "upstream_lock_sha256": "5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa",
}
for k, v in expected.items():
    if d.get(k) != v:
        raise SystemExit(f"MAIN_PIN_CHANGED {k}: {d.get(k)!r}")
print("MAIN_PIN_UNCHANGED")
PY
git status --short --branch
```

出现 `MAIN_PIN_CHANGED` 时立即停止，回执状态为 `BLOCKED_MAIN_PIN_CHANGED`。不要自动修复或回退。

### 2. 候选输入完整性

在候选输入根执行：

```bash
set -eu
input_root="$PWD/.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-prepared-peer-20261014"
python3 -m json.tool "$input_root/preparation.json" >/dev/null
python3 -m json.tool "$input_root/crm-inputs.json" >/dev/null
python3 -m json.tool "$input_root/page-inputs.json" >/dev/null
python3 - <<'PY'
import hashlib, json
from pathlib import Path
root = Path('.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-prepared-peer-20261014')
prep = json.loads((root / 'preparation.json').read_text())
def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()
for profile in prep['profiles']:
    p = root / profile['path']
    if sha(p) != profile['sha256']:
        raise SystemExit(f"PROFILE_SHA_MISMATCH {profile['path']}")
inputs = []
for name in ('crm-inputs.json', 'page-inputs.json'):
    inputs.append(json.loads((root / name).read_text()))
manifest_by_id = {}
for data in inputs:
    for item in data['plugins']:
        manifest_by_id[item['id']] = item
for plugin in prep['plugins']:
    item = manifest_by_id.get(plugin['id'])
    if item is None:
        raise SystemExit(f"PLUGIN_INPUT_NOT_FOUND {plugin['id']}")
    manifest = root / item['manifest']
    if not manifest.is_file() or sha(manifest) != plugin['manifest_sha256']:
        raise SystemExit(f"MANIFEST_SHA_MISMATCH {plugin['id']}")
    packs = list(manifest.parent.glob('*.tgz'))
    if len(packs) != 1 or sha(packs[0]) != plugin['pack_sha256']:
        raise SystemExit(f"PACK_SHA_MISMATCH {plugin['id']}")
    if plugin['source_sha'] != '1bb2646523a7c1cd5aa04d11080617a373af7147':
        raise SystemExit(f"SOURCE_SHA_MISMATCH {plugin['id']}")
print('PROFILE_MANIFEST_PACK_AND_SOURCE_SHA_VALID')
PY
```

上面的 `preparation.json` 内插件清单必须由目标 runner 重新解析。实际 runner 应按 `crm-inputs.json` 与 `page-inputs.json` 中的相对 manifest 路径逐项计算 SHA，并将结果写入回执；不能只检查文件名或包数量。若目标机不能运行上述校验，回执为 `BLOCKED_TARGET_INPUTS`。

### 3. 目标环境和端口

在批准的目标 runner 上记录下列真实输出，不要把历史值复制为当前值：

```bash
set -eu
node --version
python3 --version
uname -a
ss -ltnp | grep -E ':(4328|4329|4332|4336)\\b' || true
```

确认目标授权文件和 preflight 仍有效后，再创建本次唯一的临时目录：

```bash
run_id="m2-09-alpha2-$(date -u +%Y%m%dT%H%M%SZ)-$$"
run_root="${TMPDIR:-/tmp}/$run_id"
umask 077
mkdir -p "$run_root"/input "$run_root"/logs "$run_root"/screenshots "$run_root"/receipt
printf '%s\n' "$run_root" > "$run_root/receipt/run-root.txt"
```

目录只能由本次 runner 使用。不得写入 live/current、正式 profile、journal 或共享 storage。

## 候选启动

1. 将候选输入根、候选 workspace 中已经构建的 alpha2 host/client 和本手册指定的 profile 复制到目标机的 `$run_root/input`。复制后重新计算 preparation、profile、manifest 和 pack SHA。
2. 选择一个不在 live 端口集合中的 candidate 端口。优先使用 `4329`；冲突时选择 `127.0.0.1` 上的空闲端口，并把端口探测输出附入回执。
3. 用批准的 alpha2 candidate runner 启动 host/client。命令必须记录在 `$run_root/receipt/start-command.txt`，进程 PID、进程组、工作目录和环境摘要写入 `$run_root/receipt/owner-process.json`。不要把密钥写入日志。
4. 只等待本次进程报告 ready。记录 health URL、candidate origin、实际监听端口和启动日志。未能区分 owned process 与 live process 时停止，回执为 `BLOCKED_PROCESS_OWNERSHIP`。

runner 必须明确使用 alpha2 source SHA `1bb264...`、upstream SHA `d743...` 和 Cordis `4.0.5-alpha.1`。如果启动输出显示 rc2 或其他 Cordis 版本，回执为 `FAILED_CANDIDATE_VERSION`。

## 目标浏览器步骤

使用真实 headed browser driver。浏览器驱动的导航、等待、点击或键盘操作必须有原始日志或截图。仅调用后端 helper、读取 HTTP 200 或返回一个合成 DOM 不构成浏览器证据。

1. 打开 `$candidate_origin`，记录浏览器、driver 版本、窗口模式、URL、页面标题和首次 ready 时间。
2. 收集初始 console error、页面异常和关键 network error。把 transient reconnect warning 单独记录，不能与稳定错误混在一起。
3. 在 candidate-owned fixture 入口写入一条 synthetic history/board 记录。记录 `record_id`、正文摘要的 SHA-256、创建时间、来源 profile 和 `contains_real_data=false`。
4. 在页面中通过用户可见控件读回该记录，执行一次最小交互，例如打开历史项、切换 board 面板或展开详情。记录操作序列、截图和读回结果。
5. 检查页面上的 plugin inventory 与 profile id，确认只加载本次输入中的插件。记录 `model_calls=0`，不得用真实模型调用替代 fixture。
6. 将完整浏览器结果写入回执的 `browser` 节点。任何一步缺少原始浏览器证据都标记 `TARGET_BROWSER_NOT_RUN` 或 `FAILED_BROWSER_EVIDENCE`，不能标记 PASS。

浏览器 PASS 的必要条件是：真实 headed page 导航成功，页面交互和读回成功，记录 id 与摘要 SHA 与写入值相同，console 没有稳定错误，插件清单与 profile 相符，且 `contains_real_data=false`、`model_calls=0`。

## 目标恢复步骤

恢复检查必须复用浏览器步骤产生的同一条记录，不得重建一条“看起来相同”的记录。

1. 在重启前保存 history/board 的 `record_id`、正文摘要 SHA、页面 URL、profile id 和当前截图，写入 `recovery.pre_restart`。
2. 只停止本次 runner 所有的 candidate host/client 进程，保存停止命令和 PID。不要执行面向系统的 service restart，也不要触碰 live 进程。
3. 用相同候选输入、相同 profile 和 candidate 端口重新启动。记录新 PID、启动日志和 ready 时间。新进程若加载了其他 source SHA，回执为 `FAILED_RESTART_VERSION`。
4. 在同一个受控 browser session 中重新加载页面，等待 ready，读取同一条 history/board 记录。记录 post-restart 的 id、摘要 SHA、截图和 console/network 输出。
5. 验证前后 id 和摘要 SHA 完全一致，没有重复记录，没有丢失 profile 或 plugin inventory。短暂的 reconnect warning 只能写入 `transient_warnings`；ready 后仍存在的错误写入 `stable_errors` 并使恢复失败。
6. 将停止、重启、重载和回读的原始命令、PID、时间戳和日志路径写入回执。

恢复 PASS 的必要条件是：owned process 重启成功，同一页面重新 ready，同一条记录完整读回，id/摘要 SHA 不变，无重复，ready 后无稳定 console/network error，live 端口保持不变。

## 清理和收口

```bash
set -eu
# 只停止本次 runner 记录的 PID/进程组
# 具体命令由 approved runner 提供，执行结果写入 receipt/stop-command.txt

ss -ltnp | grep -E ':(4328|4332|4336)\\b' || true
sha256sum dsh-plugins/plugin-kit/toolchain.json
```

停止 owned process 后才删除 `$run_root`。删除前将 receipt、日志、截图和 `sha256sum` 清单复制到批准的证据归档位置。确认：

- live 端口和 live 进程未变化。
- 没有写入正式 profile、journal、live/current 或真实业务 storage。
- 主仓 toolchain 仍为 rc2。
- `production_switched=false`、`release_ready=false`。

## 回执状态和判定

整体 `PASS` 只允许在 browser 和 recovery 都 PASS、输入完整性通过、主仓 pin 未变、清理完成时使用。允许的中间状态包括：

- `PENDING_TARGET_EXECUTION`
- `TARGET_BROWSER_NOT_RUN`
- `TARGET_RECOVERY_NOT_RUN`
- `BLOCKED_TARGET_INPUTS`
- `BLOCKED_PROCESS_OWNERSHIP`
- `BLOCKED_MAIN_PIN_CHANGED`
- `FAILED_BROWSER_EVIDENCE`
- `FAILED_CANDIDATE_VERSION`
- `FAILED_RESTART_VERSION`
- `FAILED_RESTART_READBACK`
- `CONTAINS_REAL_DATA_UNEXPECTED`

任何一项为 `NOT_RUN`、`UNKNOWN` 或 `BLOCKED` 时，M2-09 仍是 `CANDIDATE_PASS_LIMITED / TARGET_NOT_RUN`，M2-07 继续 `BLOCKED`，`release_ready=false`。只有目标执行产生完整回执后，才重新评估 M2-09；本手册本身不改变验收状态。

## 必须归档的输出

- 本手册指定的 JSON 回执副本及 SHA-256。
- 目标环境、端口、授权和 preflight 的原始输出。
- preparation、两份 profile、九个 manifest 和 pack 的逐项 SHA 清单。
- candidate 启停命令、PID/进程组和 ready 日志。
- headed browser driver 日志、截图、console/network 日志和 plugin inventory。
- 重启前后记录 id、摘要 SHA、页面回读和重复检查。
- 清理输出以及主仓 rc2 pin 的复核输出。
