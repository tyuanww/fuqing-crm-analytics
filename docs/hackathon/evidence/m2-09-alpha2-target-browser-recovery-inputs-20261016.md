# M2-09 alpha2 目标浏览器与目标恢复输入清单

> 用途：给批准的目标执行方准备一次新的、可审计的 alpha2 candidate 执行。清单不授权发布、激活或主仓 pin 变更。

当前固定状态：`M2-09=CANDIDATE_PASS_LIMITED / TARGET_NOT_RUN / MAIN_PIN_UNCHANGED`，`M2-07=BLOCKED`，`release_ready=false`。

## 固定候选身份

| 字段 | 必须值 | 来源或校验方式 |
|---|---|---|
| SDK | `@deepseek-ai/dsh@0.2.1-alpha.2` | 候选 tag 和 preparation |
| upstream SHA | `d743267388641bc76f17c45ce8b4c231aed1d32c` | candidate workspace |
| candidate source SHA | `1bb2646523a7c1cd5aa04d11080617a373af7147` | 九个 pack 的 `source_sha` |
| Cordis | `4.0.5-alpha.1` | profile/runtime peer 检查 |
| dsh-tools | `0.2.1-alpha.2` | candidate package manifest |
| preparation lock SHA | `53b85e28681e338bdab2d9817e51245af680c5f930e3b6dd79cbd8f2f4168f90` | `preparation.json` |
| input root | `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-tracked-prepared-peer-20261014/` | 当前仓库 |
| profiles | `dsh-profile.crm-knowledge.alpha2.json`、`dsh-profile.alpha2.json` | `preparation.json` |
| profile SHA | `f548cd19cb6b7c36e2d258bc14dbf03bbd2f5706f4a405494a71759d8204098b`、`680b2ed2cb7203f94cefb11ffbb701b998d2e487c67e4127fead8e78b29aa612` | `sha256sum` |
| 插件数量 | 9 | `preparation.json` plugins 数组 |

九个 plugin pack 的 manifest SHA、pack SHA 和 source SHA 只以 `preparation.json` 为准。执行方需要把逐项校验结果附在回执，不重新手写一套摘要清单。

## 主仓固定边界

执行前必须读取并记录：

- `dsh-plugins/plugin-kit/toolchain.json` 的 `sdk_version=0.1.7-rc.2`。
- `upstream_sha=477b4f420553e8a52c2fbccc464d7561b239c443`。
- `upstream_lock_sha256=5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa`。
- `git status --short --branch`，受保护的未跟踪目录仍不得读取、修改或加入回执。

这三项任何一项不符，都停止执行并填 `BLOCKED_MAIN_PIN_CHANGED`。不执行 reset、stash、clean、分支切换或自动修复。

## 目标环境输入

由目标执行方在当次运行填写，不接受历史值替代：

| 字段 | 当前登记值 | 本次填写 |
|---|---|---|
| target address | `100.93.46.46` | |
| platform | Linux x86_64 / WSL2 | |
| Node | `24.21.0` | |
| Python | `3.14.4` | |
| zstd | `1.5.5`，如 runner 需要 | |
| authorization evidence | `shinemage-production-target-authorization-20261013.json` | |
| preflight evidence | `shinemage-production-target-preflight-20261013.json` | |
| runner identity | | |
| run id / UTC | | |
| candidate origin | | |
| candidate port | `4329` 或新的空闲端口 | |
| live ports observed | `4328,4332,4336`，必须原样记录 | |

目标执行方必须保存 `node --version`、`python3 --version`、`uname -a`、监听端口和授权/preflight 的原始输出。

## 文件和工具输入

- [执行手册](m2-09-alpha2-target-browser-recovery-runbook-20261016.md)
- [回执模板](m2-09-alpha2-target-browser-recovery-receipt-template-20261016.json)
- `preparation.json`
- `crm-inputs.json`
- `page-inputs.json`
- 两份 profile 文件
- 九个 plugin pack 目录和 manifest
- alpha2 candidate host/client 构建输出
- 批准的 headed browser driver 及版本信息
- 目标 runner 的进程、端口和日志采集能力

浏览器 driver 必须能提供真实导航、页面等待、用户交互、截图、console 和 network 记录。仅能请求 HTTP 或调用后端 helper 的工具不满足输入要求。

## 执行前勾选

- [ ] 已读取当前授权和目标 preflight，确认没有过期或撤销。
- [ ] 已确认主仓 rc2 pin 与三项 SHA 完全匹配。
- [ ] 已解析 `preparation.json`、两个输入 JSON 和两个 profile。
- [ ] 已逐项验证九个 manifest SHA、九个 pack SHA、两个 profile SHA 和 preparation lock SHA。
- [ ] 已确认所有 pack 的 `source_sha` 为 `1bb2646523a7c1cd5aa04d11080617a373af7147`。
- [ ] 已确认 candidate runtime 为 alpha2、Cordis `4.0.5-alpha.1`、dsh-tools `0.2.1-alpha.2`。
- [ ] 已确认目标 Node/Python/平台版本并保存原始输出。
- [ ] 已确认 live `4328/4332/4336` 未被 candidate runner 接管。
- [ ] 已创建唯一临时目录并设置 `umask 077`。
- [ ] 已指定 owned process、candidate origin、candidate port 和日志目录。
- [ ] 已准备 headed browser driver，能够输出原始导航与交互证据。
- [ ] 已准备新的回执文件，未复制旧 PASS 回执。

## 允许和禁止的测试数据

允许使用一条 candidate-owned synthetic history/board fixture。必须记录：

- `contains_real_data=false`
- `model_calls=0`
- fixture 的 `record_id`
- 正文摘要 SHA-256
- profile id、写入时间和读回时间

禁止真实客户资料、真实凭据、真实模型调用和未脱敏业务导出。发现真实数据或无法证明 fixture 来源时，状态为 `CONTAINS_REAL_DATA_UNEXPECTED`，停止并保留失败证据。

## 预期输出文件

| 输出 | 要求 |
|---|---|
| `receipt.json` | 使用本目录模板，填写全部实际值和状态 |
| `input-sha256.txt` | preparation、profile、manifest、pack 的逐项 SHA |
| `environment.txt` | Node、Python、平台、端口、runner 身份 |
| `start-command.txt` / `stop-command.txt` | 只含本次 owned process 的命令 |
| `owner-process.json` | PID、进程组、工作目录、端口和 source SHA |
| `browser/` | driver 日志、页面截图、console/network、plugin inventory |
| `recovery/` | 重启前后记录、PID、日志、页面回读、重复检查 |
| `cleanup.txt` | 进程停止、临时目录清理、live 端口复核、主仓 pin 复核 |
| `receipt.sha256` | 回执最终字节的 SHA-256 |

完成前不能把模板中的 `PENDING` 改成 `PASS`。本次目标执行未开始时，保持 `PENDING_TARGET_EXECUTION`。
