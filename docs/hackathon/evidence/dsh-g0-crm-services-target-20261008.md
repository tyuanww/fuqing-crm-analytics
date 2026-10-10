# CRM 指标与知识服务的 WSL 隔离冷安装（2026-10-08）

**本次两个服务均完成目标平台离线冷安装，15/15 HTTP 与保护观测通过；4 个自有服务进程全部回收。** 安装阶段 3.269 秒，HTTP 阶段 4.620 秒。此前首购服务的结果未用于本次判定。产品仍 **PARTIAL**；本报告是受控 synthetic 目标观测，`release_ready=false`、`activation=NOT_RUN`。

## 不可变输入

从基线 `68845ad0dfce2737d5e7b017916f16d4c8ec5255` 开始，47 个领域、资源及打包配方输入逐字节与 Git tree 核对。两个包均调用现有 [packService](../../../scripts/crm-calibration/package-service.mjs) 一次；打包前后工作树当时确实 clean，原 candidate receipt 的 `worktree_dirty=false` 保留。随后并行插件工作与本次新验证器使工作树 dirty，后续状态另行记录，未把整个当前工作树表示成 clean release。

| 包 | bytes | archive SHA-256 | manifest SHA-256 |
|---|---:|---|---|
| metrics `0.1.0rc1` | 50,015 | `1492219b59c82da4901ad3c9608d217e1fe583bc41bb46fb41f7527711eb3edf` | `0b2db2d60f6a3ccb5c8fff9950c98f6c143ff699251570fa4188e36a3965fb79` |
| knowledge `0.1.0rc1` | 50,835 | `7a48bb22c7de0d4b36a4afb1b94e2ef41c90ee4bf431798fbda95450d31041a6` | `059d754aafb88294836cbe76551ceefa8b0b1e1bd4e1449e65cf9c0dd88dda5c` |

metrics 使用精确 14 个 wheel，knowledge 使用精确 13 个；后者未安装 DuckDB。13 个公共 wheel 复用已有 Linux cache，但本次重新读取官方 PyPI 版本元数据，逐个核对名称、版本、文件、大小与 SHA。新增 DuckDB `1.5.6` 从官方 `files.pythonhosted.org` 下载，匹配 [PyPI 固定版本元数据](https://pypi.org/pypi/duckdb/1.5.6/json)：

- 文件：`duckdb-1.5.6-cp314-cp314-manylinux_2_26_x86_64.manylinux_2_28_x86_64.whl`
- 大小：21,575,132 bytes
- SHA-256：`19c5e485e59613b8878d1670bcaa7a010f53c5a4da5ae8e08863e5e529ca6182`

这验证下载字节与 HTTPS 元数据一致，不是发布者签名或完整供应链背书。精确 URL、14 项依赖版本及元数据摘要在本地 `wheel-preparation.json`，每个服务只收到自己的 wheel 清单。安装使用现有 [service-runtime.fixture.py](../../../scripts/crm-calibration/service-runtime.fixture.py) 的 `--no-index --no-deps --require-hashes --only-binary :all: --no-compile`，目标 venv 不装 pip；额外文件/依赖、错误摘要以及实际安装闭包不一致均拒绝。

## 执行与隔离

新增的 [目标验证器](../../../scripts/crm-calibration/crm-services-target.py) 是显式 opt-in 的包观测入口，不编码杭州地址，也不更改服务启动策略。它复用既有 `secure-unpack.py`、离线安装 helper 和包内 `service.py check`。namespace、SSH 和 systemd 控制器只保留在 ignored 的本轮证据目录。

实际宿主为杭州既有 WSL2 x86_64，内核 `6.18.33.2-microsoft-standard-WSL2`，Python `3.14.4`，既有 pip `26.0.1`。Python 原 realpath 为 `/srv/shinemage/toolchain/python-3.14.4/cpython-3.14.4-linux-x86_64-gnu/bin/python3.14`，只读 bind 精确 prefix 到自有 tooling，随后隐藏整个 `/srv`；没有安装或更改系统工具链。

恢复目录为 `/tmp/owned-crm-services-r1-20261008-pbdgd1rx`，首次失败目录 `/tmp/owned-crm-services-20261008-sq337s59` 保留。两次均为独立 mount/network/PID namespace、nobody、独立 venv/HOME/TMP，只监听 namespace 内 `127.0.0.1` 临时端口。输入和 Python prefix 只读，安装后两个 app 与 venv 再以只读 bind 运行；生产 release/runtime/data、旧 SDK、自有目录之外的临时树、root/home/mnt 不可读，外网禁用。

12/12 隔离预检通过。transient unit 限制为 MemoryHigh=2G、MemoryMax=3G、CPUQuota=100%、TasksMax=192、RuntimeMaxSec=900、Nice=5、IOWeight=20、KillMode=control-group；各 install/http 阶段另限 360 秒。恢复启动前 MemAvailable 为 16,947,760kB，load1/5/15 为 0.7324/0.2881/0.1479。未声称终态 `[not set]` 的 MemoryPeak 为实际峰值。

在上述受限环境中依次调用：

```sh
python3.14 -I input/helpers/crm-services-target.py \
  --input /absolute/owned/input --input-sha256 VERIFIED_INPUT_SHA256 \
  --output /absolute/owned/work/result --phase install
# controller 将 app 和 venv 只读 bind 后，使用同一解释器与输入继续：
python3.14 -I input/helpers/crm-services-target.py \
  --input /absolute/owned/input --input-sha256 VERIFIED_INPUT_SHA256 \
  --output /absolute/owned/work/result --phase http
```

准确 argv/cwd/超时、pip 安装记录和 `service.py check` 输出在 `recovery-r1/retrieved/work/`。首次输入 manifest SHA 为 `2ca7ea74a1514ee76c321477048375457aeef6d5ee2f497419bd45ac11f5de0d`；恢复 manifest 为 `edb1ed57892c0333adfe2dd85395d0c12857231758f8ef230542a5471d159022`。39 项输入只有验证器 helper 变化，服务 archive 和 wheel 没变。

## 实际观测

| 观测 | 本次结果 |
|---|---|
| 新 venv 冷安装、完整依赖 inventory、包内 check | metrics 14 / knowledge 13，2/2 PASS |
| 两服务 capabilities、缺合同头拒绝、Origin 拒绝 | 200 / 409 CONTRACT_MISMATCH / 403 ORIGIN_REJECTED |
| 两份实际 HTTP OpenAPI | 与各自包内 JSON 逐字段相同 |
| `sales_window_summary`、`existing_customer_repurchase`、`sample_followup` | 三次 200，固定 synthetic source/metric version 与 facts |
| `contains_real_data=true` | 400 FORBIDDEN，无真实源路径 |
| 知识“客单价”解释 | 包含 D001；明确实现未在服务包重验，真实业务验收=false |
| 停止并重启 metrics | 停止后端点不可达；knowledge 原进程及解释保持，metrics 新进程恢复查询 |
| 停止并重启 knowledge | 停止后端点不可达；metrics 原进程继续查询，knowledge 新进程解释相同 |
| 依赖导入边界 | knowledge 的 DuckDB/_duckdb 不可发现；固定源码的持续 import hook 未出现禁止前缀导入 |
| 只读安装/输入保护 | 两 app、两 venv 清单及39项输入摘要前后保持；post-check再次通过 |

HTTP 与保护总计 **15/15 PASS**；冷安装另计 **2/2 PASS**，不把预检/安装和 HTTP 计数混成一个测试套件。metrics app/venv 分别保持 39/585 条文件、目录、链接记录；knowledge 为 26/514 条。

导入 hook 拒绝知识包中的 DuckDB、指标 semantic/read-only 实现与 analytics/worker，以及其他未声明服务模块。初始化落盘守卫已安装及初始加载集合；被禁止的导入先同步落 attempt 再抛错。正常解释器退出才标 `final_snapshot=true`。本次四个服务均收到 SIGTERM，记录明确为 `snapshot_phase=guard-installed / final_snapshot=false`；初始加载集合不冒充进程退出时的全量快照。这是在已固定服务代码中的持续 import 拒绝观测，不是任意代码沙箱承诺。

## 失败保留与恢复

首次 SSH 连接 40 秒超时，尚未创建远端目录；目标节点只读探针显示 Online/Active，经 DERP(tok) 返回，随后 SSH 恢复。一个只读主机探针还出现引用错误，修正后获得实际 WSL 内核/load；未重启 Tailscale、WSL、生产服务或修改 route。

首次实际 run 的两项冷安装和前 13 项 HTTP 通过，但验证器用 `atexit` 写导入凭据，uvicorn 的 SIGTERM 退出未调用它，凭据缺失导致整体 **FAIL**。4 个进程已回收，生产快照保持。保留 `failure-summary.json`、原 complete/result 和62个取回文件，不以 systemd 的 `Result=success` 覆盖业务结果。

主 Agent 已核对上述62个失败证据及73个恢复证据的完整摘要；旧guard的两个独立SIGTERM复现也已验证为“退出码-15、凭据未落盘”，原始命令/结果保存在 `original-guard-regression.json`。这里记录实际运行失败，不是根据源码推断或声明仓库代码不存在。

用封存原 guard 的实际代码独立复现两种失败：普通等待和捕获禁止导入后，SIGTERM 都导致凭据缺失。修复只涉及新验证器及测试：在 app 导入前同步记录守卫状态，每个禁止 attempt 立即记录，区分初始化/被拒导入/正常退出快照。[边界测试](../../../backend/tests/test_crm_services_target.py)当次 **12 PASS / 0 FAIL / 0 SKIP**，覆盖摘要漂移、缺项/额外/链接、wheel污染、已有输出保护、超时及顽固自有进程回收、真实 SIGTERM、捕获禁止导入和正常退出标记。

经主 Agent 重新审查冻结后，恢复先在远端重核旧39输入全部 hash，在新 owned 目录复制同一包与 wheels，仅更新 helper/manifest，之后再次核对新旧39项。旧失败目录与输入保持，未重新 pack 或重复传送27.9MB输入，只传小型修复；恢复的两个 venv 均重新冷安装。

## 保护与证据

两次运行的生产 current 均为 `/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3`；各次前后及两次之间的 6677、18090、18092、18093、18094 完整监听/PID 行相同。CRM/WeKnora 的 docker-proxy PID 分别为 1808/1705 和 1747/1903，6677 的完整 nginx PID 集合保存在快照 JSON。只核对该元数据，没有调用生产 API 或读取真实 DuckDB/凭据。

两次自有 unit 最终均 `inactive / dead / MainPID=0`，恢复的 namespace 返回0，result/complete正文均PASS；四个服务子进程均 reaped。旧失败证据、输入包、wheel和owned目录保留，没有删除资产；未部署、改 candidate/journal、提交或 push。

本地证据根：`.context/checks/crm-services-target-20261008/`。

| 证据 | 摘要/结果 |
|---|---|
| `final-result.json` | 汇总固定输入、15观测、完整性/生产保护及范围 |
| `source-input-manifest.json` | 47个clean领域/配方输入的逐文件SHA；结束再次核验未变 |
| `original-guard-regression.json` | 旧guard两个真实SIGTERM失败复现 |
| 首次 `evidence.tar.gz` | 62文件逐项校验；SHA `5f49ee2e96475e8b8d8ca4973e1f02f0486c31d3c81d012f2e29879bdf63f390` |
| 恢复 `recovery-r1/evidence.tar.gz` | 73文件逐项校验；SHA `c6d0c245dd89c7e15628f3e8e81e25b7d722b591fa0486c6fe99414dcd785e50` |
| 远端实际runner | SHA `8650257658327e849b9b52149e38d7047085156a956fcb7721f20d1c5f3f9bdd` |

主 Agent 集成后仅将三处分号语句拆行以修复 Ruff E702，该次格式化源码 SHA 为 `26c13aba43cf63e9b55d0f787a94ebeefb7c27b6e80142b522266ce7a097e9cf`；AST（排除位置属性）与远端执行快照完全相同，guard程序字符串未变。该次格式化源码的 bounded 后端12项与Ruff再次通过，见 `.context/checks/parallel-followup-20261008/runner-format-equivalence.json` 和 `bounded-target-format/summary.json`。未仅为格式变化重复连接/执行WSL，也未把新源码摘要替换为远端实际摘要；原执行快照、135项取回文件和handoff摘要保留。

本次关闭这两个固定 synthetic 服务包的 WSL 离线冷安装与限定 HTTP 观测缺口。生产安装/激活、真实业务与私有知识 ACL、真实身份、签名来源/供应链、候选准入、浏览器 UAT、完整 B0/release 和远端 CI 均不在通过范围；产品保持 PARTIAL。

后续对提交 `1dae6de7` 的[OCR审修](dsh-g0-parallel-followup-ocr-review-20261008.md)又修改路径、两套安装的启动前核验及进程退出竞态清理，已验证本地20项回归并正常提交 `5bf2bc77`。审修提交时新版runner的WSL为NOT_RUN，与本报告封存源码不再AST等价；上述摘要、2/2冷安装和15/15 HTTP仍只属于原执行。随后新版原字节另行完成WSL复验，见[独立新证据](dsh-g0-crm-services-target-ocr-wsl-20261008.md)，不替换本报告的原始源码摘要和运行记录。
