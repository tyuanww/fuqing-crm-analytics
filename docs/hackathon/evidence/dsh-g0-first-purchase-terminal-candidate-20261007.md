# 新插件独立更新与杭州终态恢复（2026-10-07）

**固定包的本机组合与杭州 WSL2 终态恢复通过；整体 PARTIAL / release_ready=false。** 新插件复用原 CRM、查询、保存和官方 runtime 包，不要求这些组件跟随插件重新发布。当前生产未切换；杭州 current 仍为 `dsh-0.20.0.0-r3`。

## 固定身份与本轮修复

证据根为 `.context/checks/first-purchase-terminal-candidate-20261007/`（以下记作 OUT）。插件来自干净提交 `3ffbd2a2e5a6c3179aecec09c63522ff1bb2d268`，正式构建后通过原 `pnpm dsh plugin candidate` 入口打包。后续 verifier/runner 改动不改变此插件包来源。

| 对象 | 本次固定值 |
|---|---|
| 新 candidate | `a490457c3e867b3fb0d03fa8daeb04886f7b8657da0b1cf2fbadb30917e7887c` |
| workbench tgz | 437176 B；`c9770d111102791bcc34a0db9a41b23b7e43b3385a9c3909a620617f413ec64b` |
| CRM tgz | 复用 `d682081d8754d68cb34acff59fb7655d84dd7e4b0dd65caaed1499f5a76aafe7` |
| 查询 / 保存源码 | 复用 `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6` |
| 查询 archive | `109251614197e515a34a4824206e93ef53c0185e5c09a24a7906f9f7a967b8b7` |
| 保存 archive | `ee4908c40c7c8d127cec1c25b4bfae83ec6b0997d006bc7bf9615e8ee23f0ac7` |
| 官方 DSH | 0.1.7-rc.2 / `477b4f420553e8a52c2fbccc464d7561b239c443`；未修改上游 |
| Linux runtime | 164918950 B；`a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4` |

`package-diff.json` 核对新旧压缩包：只变更 `lib/index.js`、`lib/tool.js`、`lib/skills.js` 三个编译入口；profile 与服务 binding 原字节/值保持。候选仍是局部插件/服务绑定，完整运行组合由 v4/v5 输入额外固定 CRM、查询和 runtime；不是完整生产发布身份。

实际推进暴露出来源验收把插件 SHA 与服务 SHA 强制相等的旧耦合。因此新增显式 `synthetic-source-http-target-input/v2` / `source-http-target-observation/v2`：服务 `source_sha` 与 candidate 的 `service_compatibility.binding.source_sha` 及服务 archive 对齐，插件仍核对自己的 SHA。v1 保持历史同 SHA 约束；v2 要求固定新 runner、完整 candidate digest、真实目标回执和包摘要，不能重标旧 PASS。新 runner 摘要为 `37b4c835d9cf66f1114bbf56fc51895c0ee214f2382cb8aecef3954b20b212d9`。

## 实际验证

| 验证 | 结果 | OUT 内证据 |
|---|---|---|
| 正式 workbench build / 类型检查 | PASS；使用已有固定 SDK 路径 | `build.log` |
| 本机新插件 + 原服务包 / `RECOVERY=terminal` | **1 PASS / 1 warning，11.78 秒** | `local-v4.log`、`local-command.json` |
| 来源绑定 / runtime 定向回归 | 初轮修复后 **58 PASS / 0 SKIP**；目录兼容修复后来源 verifier **40 PASS / 0 SKIP** | `binding-node-r2.log`、`binding-node-r3.log` |
| Python 输入 / 独立 SHA 合同 | **11 PASS** | `binding-python.log` |
| 完整 release suite | **354 PASS / 0 SKIP / 0 FAIL**；不与定向测试相加 | `release-tests-final.log` |
| 杭州 v2 服务来源与冷恢复 | **10/10 PASS** | `retrieved/source/result/receipt.json` |
| 杭州固定四包 / 官方 runtime / 在途 SIGKILL 恢复 | **1 PASS / 2 warnings，76.49 秒** | `retrieved/host-result/pytest.stdout` |
| 服务回执接线 / CLI 重试 | journal **seq 4**；重试字节与 mtime 不变 | `verify-service-target-r2.log`、`journal-verified.json` |

目标是 Linux x86_64 / WSL2 `6.18.33.2-microsoft-standard-WSL2`、Node 24.21.0、Python 3.14.4、UID 65534。全部 CRM/model/业务数据为隔离 synthetic fixture，使用独立小型 SQLite；未访问真实 DuckDB、未调用真实模型。164.9 MB runtime 由杭州从固定 GitHub Release 下载，18.75 秒完成且摘要一致；Tailscale 只传 28.8 MB 验收材料和小型结果。

杭州终态证据 `interrupted-run.json` 明确为 `FAILED`、`runtime_status=EXITED`、`execution_active=false`、`error_code=EXECUTION_UNKNOWN`、`dispatch_attempts=1`、`result=null`。恢复保留 50 条已提交事件前缀；同请求不重复派发，原成功任务与保存结果保留，最终一个 worker、一条分析。原生普通对话回退通过。FAILED 表示中断已妥善收敛，不代表被中断任务执行成功。

重跑使用新的私有输出目录；本机完整命令保留在 `local-command.json`。目标路径依次是 `remote-setup.py` → `remote-run.py`：先以 `first-purchase-source-target.probe.py run-wsl` 运行 v2 来源矩阵，再通过同一个 `test_analytics_first_purchase_official_host.py` 入口设置 `B0_NATIVE_CRM_RECOVERY=terminal` 和 v5 artifact/Python/wheelhouse。目标不设置源码 checkout 或 `B0_NATIVE_CRM_SOURCE_HTTP`，不下载业务依赖、不重编译官方 runtime。`transfer/input-seal.json` 与 `retrieved/controller/sources.json` 留存输入及控制器来源；控制器包含本轮尚未提交的 v2 verifier 修复，不能称为 clean 发布源码。

## 失败调查与保留

- 首轮 v2 verifier 测试夹具更新 candidate 后，没有同步合成服务握手的 candidate digest；严格验证正确拒绝。修正夹具后通过，原 `binding-node.log` 保留。
- 取回后的检查脚本误读 `worker_count`，实际字段为 `query_worker_count`；修正独立检查脚本后核对通过，没有修改远端输出。
- 首次真实服务回执接线返回 `SERVICE_SOURCE_TARGET_INSTALL_PATH`：旧验证器只接受原独立演练临时路径，拒绝新组合演练的受控子目录。仅 v2 增加 `/tmp/owned-fp-terminal-*/source/source-http-owned-*` 格式，仍拒绝生产路径、路径穿越和 query/save 目录不一致；原日志与修复后结果均保留。没有通过改回执、放宽摘要或重跑业务来覆盖失败。

## 证据完整性与收尾

228 个归档条目（227 个证据文件及清单）逐项校验；结果包 SHA `8fc5878c34164814f3c9904d3270b5ea6da986d5b3be660fb3c1157e4e8f4cc3`。28 个已传输 wheel 复用本机原字节，按实际目标 input 中的逐文件摘要重建可复核输入，不重新下载或改写 Linux 来源回执。349 个封存控制器/包文件及 43 个来源输入均保持。旧 candidate、旧 journal seq 6 和原输入的字节/mtime 保持。

目标生产 current、6677/18090/18092/18093/18094 的监听/PID 快照一致；本次进程已退出，4335–4337 无监听。取回并验证后仅回收本次带专属标记的 `/tmp/owned-fp-terminal-j8rznp7h`。见 `verified.json`、`retrieved/cleanup-check.json`、`remote-cleanup.py.result.json`。

## 仍开放的边界

本次关闭新候选的终态恢复现场子项。新 journal 的 seq 4 **只代表服务目标观察**；原始 Host 终态回执已封存，但尚未接入独立的终态恢复 journal verifier，不能冒用旧 HTTP/浏览器事件或旧 candidate 的 seq 5/6。新候选浏览器、完整跨版本 corpus、真实身份/模型/UAT、签名/SBOM、生产 activation/canary/rollback 和物理分仓仍开放。

## 提交前审查与维修

按 `open-code-review-delegate` 重新取得文件清单和规则，由当前 Agent 审核。OCR 自动选择 6 文件，另有 7 文件因扩展名/默认测试路径被过滤；全部补充人工审核，最终 **total_files=13、reviewed_files=13、skipped_files=0、coverage_rate=100%**（7 个代码/测试、6 个文档）。覆盖调用方先验、candidate/pack/binding 摘要链、v1/v2 兼容、固定 runner、受控临时路径、失败前不写 journal 及证据范围。

审查确认两处低优先级文档漂移并已修正：CHANGELOG 的上一条仍称固定新包/杭州验证未执行；verification 操作入口仍称新包验收开放。二者现已明确新候选隔离终态恢复实际通过、Host journal verifier 尚待接线。同步 STATUS/TODOS 的审修交付阶段，不改旧候选 UNKNOWN 的历史证据。未确认新增 P0/P1 代码缺陷，保留上节列明的后续准入工作。

本轮重新执行的验证保留在 `.context/checks/terminal-candidate-review-20261007/`：

| 命令 / 检查 | 本轮结果 | 证据 |
|---|---|---|
| `node --test scripts/dsh-b0/first-purchase-runtime-artifacts.test.mjs scripts/release/source-target-evidence.test.mjs`（Node 24.19.0） | **61 PASS / 0 SKIP / 0 FAIL** | `node-tests.log` |
| Python 3.14.4，固定测试解释器，`pytest --noconftest -q backend/tests/test_first_purchase_source_target_probe.py` | **11 PASS** | `python-tests.log` |
| 当前 `plugin verify-service` 对原 v1 和新 v2 已封存回执分别重验 | 两者 PASS；各自 runner 摘要保持；58 个受保护文件字节/大小/mtime 不变，旧 journal 当前 seq 6 与新 journal seq 4 不变 | `v1-replay.stdout`、`v2-replay.stdout`、`replay-verification.json` |
| Ruff、`git diff --check`、改动文件 secret scan、文档相对链接 | PASS | `final-review.json` |

完整 release suite 354 PASS 和杭州现场结果属于上面的实施阶段；本轮没有再次运行杭州服务。七个代码/测试文件的摘要与该阶段记录完全一致，审查维修只修正文档。verifier、测试和文档随本次已授权提交交付，提交号以 Git 为准；插件包来源仍为既有 `3ffbd2a2`，远端演练时控制器尚未提交的事实保留。未 push、创建 Release、切换生产或清理旧工作树。
