# 首购独立服务：杭州 WSL 隔离验收（2026-10-06）

结论：同一旧/新不可变服务包在实际杭州 WSL2 上完成 **14/14 检查**，覆盖目标预检、离线冷安装、合成身份/状态、真实 loopback HTTP 保存、进程崩溃恢复与兼容边界。成功轮次的 10 个临时服务进程全部退出，此前失败轮次的 1 个进程也已回收；安装目录和临时状态已回收，生产入口监听地址与 PID 快照未改变。产品仍 **PARTIAL**，`release_ready=false`、activation `BLOCKED`。

本次承接 `79434033` 后的[平台依赖准备](./dsh-g0-service-target-platform-20261006.md)。没有修改服务业务代码或重新构建服务包，没有启用生产身份、保存 UI、DSH profile 或生产部署。下文 PASS 只覆盖首购服务的合成验收，不代表指标/知识服务、官方 DSH 宿主或真实业务验收完成。

## 输入、环境与执行边界

| 项目 | 本次实际值 |
|---|---|
| 目标 | Linux x86_64，`6.18.33.2-microsoft-standard-WSL2`，Python 3.14.4 |
| 运行身份 | 现有 `nobody`，UID 65534；SSH 仅负责专属 `/tmp/shinemage-service-acceptance-20261006-*` 目录的接收与有限命令启动 |
| 原服务配对回执 SHA-256 | `d27b6f63edf6358c06156fd645ed7285fd11e6ea96c64040a4d06fd7b69070d0`；本轮先经现有 `verifyServiceArtifactEvidence` 重新核验 |
| 旧服务源码 / archive SHA-256 | `56198c32a52d9822c7a3338d92b0fa077d1c61bc` / `5bffce97eae7365ab7b75876dfb2f7c5a0ac30d66003ccd01f308e3c2444509f` |
| 新服务源码 / archive SHA-256 | `a50bd42492195040efaa6989c90e4fe84030551c` / `9a92540edb9c5c6e26ce4857a1d780f4fcc7dcd243016bc4d8dd1a3a10b00775` |
| 依赖 | 两个独立新 venv，各自离线安装相同的 13 项固定 Linux wheel；与平台准备回执逐包核对 SHA-256，并核对完整安装清单 |
| 合成状态 | 本地由旧 SHA 的实际 synthetic worker 生成；8 个文件共 164,033 字节，仅含测试标记、context、RunStore 小型 SQLite/WAL 和任务锁；不含真实 DuckDB 或 CRM 数据 |
| 成功输入 manifest SHA-256 | `c4a53ca7a5bb3a886faf220a8465b111eed9c5a6dcabce1ba4e144f44bdf7ef8`，28 个内容文件及外层 manifest |
| 验收适配脚本 SHA-256 | `08a1650f0c8af1bea785d9d2c30f8086e06c6757737e70b41c7a0f13c505df79`；本次有限证据编排，不是生产安装器或发布门禁 |

复用既有 `service-target-preflight.py`、`secure-unpack.py`、`service-runtime.fixture.py`、`first-purchase-package.fixture.py`。它们的字节摘要随输入 manifest 固定；远端不带仓库、不运行 git、不构建源码、不联网解析依赖。安装继续使用 `--no-index --no-deps --only-binary :all: --require-hashes --no-compile`。

现场实际命令链为：所选 Python 的 `-I -B service-target-preflight.py` → 有界安全解包 → `service-runtime.fixture.py ... --wheelhouse ...` → 新 venv 的 `service.py check` → 包外 fixture 的 `legacy-write / serve / recover / legacy-readonly`。每个应用只从解包后的文件加载，OpenAPI 与包内合同逐字段一致；fixture 拒绝导入 DuckDB、其他服务和 worker。测试凭据仅在内存和子进程 stdin 中传递，服务只监听 `127.0.0.1` 的临时端口，日志脱敏。外层命令限制 180 秒；没有安装系统服务或修改现役进程。

## 14 项当前观测

| 检查 | 结果与含义 |
|---|---|
| 旧包预检与冷安装 | PASS：WSL2/Python/ABI、依赖闭包、完整安装 inventory、manifest 与应用 check |
| 新包预检与冷安装 | PASS：同上，二进制依赖由实际应用加载 |
| 旧服务保存 | PASS：仅合成任务生成旧版分析 |
| 旧状态升级读取 | PASS：新服务可读旧分析，未记录的 provenance 明确返回拒绝 |
| freshness、候选准入、权限 | PASS：固定测试时钟下 FRESH；未准入 digest 和只读身份不能保存，拒绝后无新增记录 |
| 幂等、冲突与进程崩溃 | PASS：相同命令只生成一条 D15 分析；冲突拒绝；对本次持有的进程真实发送 SIGKILL |
| 崩溃后的 reconcile/replay/UNKNOWN | PASS：新进程没有 RunStore 或 admission provider，仍能回放原回执；记录不重复；未见过的 action 返回 SAVE_UNKNOWN |
| 旧服务只读回退 | PASS：受控只读身份可读新分析，写入拒绝；退出后数据库摘要不变；旧服务没有 D15 回执 API |
| 新服务 forward-fix | PASS：标题新版本保留 facts 与 provenance，旧写入口不能绕过 versioned save |
| 小型合成备份冷恢复 | PASS：SQLite backup 到本次新目录，新进程恢复回执、版本与记录数 |
| 检出旧服务可写降级损失 | PASS：仅隔离副本中允许旧 writer，确认其会丢失 provenance；预期结论是 `BLOCKED_PROVENANCE_NOT_PRESERVED`，不允许生产照做 |
| 旧服务遇到未知 schema | PASS：拒绝启动，数据库摘要不变 |
| 新服务遇到未知 schema | PASS：拒绝启动，数据库摘要不变 |
| 验收后输入与安装内容完整性 | PASS：两份已安装应用再次 check，输入文件摘要全部不变 |

这里的保存 identity 和 allowlist 仍使用既有 fixture 的合成 digest（`a` 重复 64 次），不表示真实 plugin candidate 已获生产保存授权；时钟也是 fixture 固定值，不证明生产 freshness/UNKNOWN 时间窗口。profile 回退必须保留新版服务与 durable state，不能把插件回退说成数据回滚。

## 实际失败、修复与重试

1. 本地临时准备命令曾含不可见字符，解析阶段即失败，尚未产生文件；移除后完成准备。验收适配脚本初次 lint 的 21 处多语句格式问题经 formatter 修正，最终 Ruff/语法通过。这些都是本次测试编排问题，没有改动产品代码。
2. 第一轮逐文件 SCP 在 90 秒超时，已观察到 11 个文件、2,804,282 字节；没有执行不完整输入。保留失败记录，改为传单个 3,706,880 字节固定 tar，实际 19.63 秒完成；远端先核对完整 SHA，再校验条目、解包和逐文件复核。这是本次传输观测，不是 Tailscale 性能保证。
3. 首次运行已完成两份冷安装，旧服务启动时正确拒绝 `B0 state directory must be owned by the caller and mode 0700`。原因是本次合成状态 tar 只收文件，遗漏目录权限。第二份夹具 tar 显式保留目录 `0700`；本地先用同一安全解包器核验，再在新的目标目录重跑。两个服务 archive、13 个 wheel、应用源码与测试逻辑均未改变；前次 FAIL 回执和日志保留，最终 14/14 不是沿用前次结果。

## 原始证据与未关闭项

本地根目录：`.context/checks/service-target-acceptance-20261006/`。

- `input/`、`input-v2/`、`input-transfer.tar`：前后输入与不可变传输包；`seed-source-manifest.json` 记录合成 worker 的来源。
- `target-run-v1.log`、`retrieved-failure/result/`：首次实际运行 2 项完成后 FAIL，含权限拒绝与回收结果。
- `target-run.log`、`retrieved-pass/result/`：成功运行逐阶段记录、两个 venv 的安装/preflight/check 清单和各进程日志。
- `retrieved-pass/result/receipt.json` SHA-256：`d392f6c484a0e900cd5a5eb3e97c7f19abc3b468e62efc0811c4346333e80cb7`。
- `target-cleanup-verification.json`、`local-evidence-verification.json`、`whole-run-verification.json`：成功轮次回收后 10 个 owned PID 均不存在，无临时安装目录残留；失败轮次 1 个进程亦已记录退出与回收。从第一轮传输前至最终验收后的 6677、18090、18092、18093、18094 监听/PID 快照一致；下载回执的 hash、输入、原服务包及 14 项状态复核通过。只证明这些观测，不扩大为全量生产健康验收。

这次只关闭 **首购服务的 WSL 合成冷安装与恢复** 子项。原包的 dirty 构建来源标记没有被改成 reviewed；最终干净候选、签名/SBOM/CVE/发布来源、目标证据验证器与原 candidate journal 接线、真实身份/策略、生产时限、DSH UI/浏览器、官方宿主 WSL/session/WAL、其他服务及物理分仓仍开放。当前 JSON 是证据记录，尚未作为 release gate 输入，`journal_binding=NOT_RUN`。本轮未 commit、push、发 Release 或生产切换。
