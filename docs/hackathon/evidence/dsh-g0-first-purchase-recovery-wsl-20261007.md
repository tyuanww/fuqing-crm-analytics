# 首购候选的目标恢复验收（2026-10-07）

本轮实际执行杭州 WSL2 隔离恢复矩阵，复用原候选 `861d6ef1c42b23b5f2ad4427ba9a19ecb032651c61efa6414303e0729feea4d4`、原四包和 runtime `a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4`。**验收有进展，但 T2/T7 仍 PARTIAL，release_ready=false。** 当前包的崩溃任务会保留 UNKNOWN 和活动名额；这不是业务恢复完成。

## 本轮实际结果

证据根目录：`.context/checks/first-purchase-recovery-wsl-20261007/`。下列路径均相对此目录。目标为 Linux x86_64 / WSL2 `6.18.33.2-microsoft-standard-WSL2`、Node 24.21.0、Python 3.14.4、UID 65534；服务、会话与库均为本次拥有的 synthetic fixture。

| 验证 | 结果与边界 | 证据 |
|---|---|---|
| 原四包 / 官方 Host HTTP 整链 | pytest **1 passed, 2 warnings，76.91 秒**；包含离线控制器安装的总耗时 78.95 秒。未运行浏览器 | `retrieved/result-r3/pytest.stdout`、`receipt.json` |
| 在途 Host SIGKILL | 正式首购命令受理、调度器派发、模型请求待响应时强杀。恢复后 50 条已提交事件前缀摘要不变，恢复会话为 53 条事件，CRM 需要重新登录 | `retrieved/result-r3/tests/test_official_host_crm_query_s0/official-host/recovery-observations.json` |
| UNKNOWN / 幂等 / 原生回退 | 崩溃 run 为 UNKNOWN，`dispatch_attempts=1`；同请求重放返回同 run，不重复派发；已有查询仍 SUCCEEDED，仍只有 1 个 worker、1 条分析；新的普通原生会话可完成对话 | 同上及 `interrupted-run.json`、`source-boundary.json` |
| rc2 截断末帧 | 官方编译 reader/writer，插入 63 字节不完整 Zstandard 末帧；只读打开不改字节，续写修复后从 6 条到 12 条事件，完整前缀不变，新进程重读一致 | `retrieved/wal-r2/session-recovery.json` 与 10 组进程 stdout/stderr |
| rc1→rc2→rc1 | rc1 写一个用户/助手流式文本回合，rc2 读并续写，rc1 回读全部 12 条；只读不改变状态。保留的旧状态快照仍能由 rc1 读回原 6 条；四项合计 **4 PASS** | 同上；`retrieved/wal-inputs.json` |
| 固定旧/新保存服务 | 旧 `56198c32` / 新 `f9726f68` 的原 archive，离线冷安装、旧状态升级、崩溃重放、只读旧服务、forward-fix、备份恢复、未知 schema 拒绝等 **14/14 PASS** | `retrieved/service-recovery/result/receipt.json` |
| 本机相关测试 | 新恢复测试及既有 mock **8 PASS / 0 SKIP**；宿主/包保护 **45 PASS / 3 SKIP**。三项未执行需显式服务双包/Python/wheelhouse 参数，不冒充通过 | `local-tests-final.log`、`host-guards.log` |

可复现入口（Node 24；每次使用新输出目录，已有目录拒绝覆盖）：

```sh
B0_BUILD_UPSTREAM=/absolute/pinned-rc2-checkout node --test \
  scripts/dsh-b0/recovery-model-gate.test.mjs \
  scripts/dsh-b0/session-recovery.test.mjs \
  scripts/dsh-b0/mock-provider.test.mjs

node scripts/dsh-b0/session-recovery.mjs /absolute/new-owned-output \
  /absolute/rc2-runtime/node_modules/.pnpm/node_modules/@deepseek-ai \
  /absolute/rc1-checkout/apps/cli/node_modules/@deepseek-ai
```

官方首购整链使用既有 `backend/tests/test_analytics_first_purchase_official_host.py`，显式设置 `B0_NATIVE_CRM_RECOVERY=1` 和原 v5 artifact/Python/wheelhouse 输入；本轮确切目标命令、精简环境、输入 seal 与更新源码保存在 `remote-execute-r3.py` 及取回的 `run-r3.py`/controller。默认路径不新增故障动作，recovery 与 browser opt-in 互斥。此次 controller 基于 `b6cecdb6` 加本地增量，**没有重打业务包，也不是 clean 发布源码**。

## 发现并修正的演练问题

1. 本机首轮使用了错误的 peer 根目录；第二轮误按 `.jsonl.zst` 查找文件，官方扩展名实际是 `.jsonl.zstd`。修正入口与后缀后，真实持久化通过。测试另发现 macOS `/var` 路径别名；新建输出后规范化 realpath，仍拒绝覆盖已有目录。原日志保留。
2. WSL r1 在 Host 启动前缺少新增 browser/runtime evidence 模块。补齐实际 import 闭包后只读加载通过；保持同一业务包。
3. WSL r2 向业务会话直接发送普通 prompt，插件正确拒绝 `query context has no bound native request`。r3 改为正式 `/first-purchase` 入口→调度器→在途请求，不绕过上下文权限。
4. WAL 初轮仅用户回合；最终 r2 扩充为带 step 和 assistant stream 的完整回合后重新执行 10 个冷进程，四项通过。不是把旧结果移用于新夹具。

## 尚未关闭的 P1：恢复后的请求投影

实际崩溃 run 为 `UNKNOWN / execution_active=true`，占用原活动名额。安全性测试证明了**未重复执行、未误报成功**；没有证明任务已结束或名额可释放。当前不能把矩阵整体标成业务恢复完成。

代码核对发现：`native-evidence.mjs` 的 `nativeJournal()` 在 `session/created` 时初始化空投影，只监听后续 `session/event`；固定 rc2 的 Session 合同明确说明恢复 seed **不会重新发布 session/event**（上游 `packages/core/session/src/index.ts` 的 `firstLiveSeq` 说明）。当前实现不能据此完整重建历史 request/turn 对应关系。`bridge.ts` 的 `/observe` 又依赖该投影提供相关性证明；不能用“进程已退出”直接替代请求终态。

下一步优先补这个读取/投影接缝：通过官方持久化读取合同恢复历史、处理恢复期间新事件及 disposed 会话，保持请求 ID/turn/exit 三者一致；证据不足或冲突时仍 fail-closed。不得新增被上游弃用的同步 `snapshotEvents()` 调用，不改上游源码。先做恢复投影负测与本机官方 Host 验证，再生成经审查的新插件候选验证终态释放；原候选保留这次 UNKNOWN 事实，不覆盖为修复后的结果。

## 保留与限制

- 15 个原固定输入的字节/mtime 保持，原 journal **seq 6** 字节/mtime 不变。远端 185 个 sealed payload 文件未改。取回 **291 个文件**逐项校验，归档 SHA `1e3f0268a4b462e23add740a8c73334beb9210715e5c29deb5c653c5bc235c70`，见 `verified.json`、`retrieved/results-inventory.json`。
- 本次进程已退出、4335–4337 已关闭；现役 current 与 6677/18090/18092/18093/18094 监听/PID 快照一致。本次远端临时目录已回收，rc1 tracked source 未改，见 `retrieved/cleanup-check.json`、`remote-cleanup.py.result.json`。
- rc1 来自 tracked clean `46a7f68b0922371ce7144b668b90e377d8e799f4`；记录了加载模块的版本和编译字节摘要，但**旧编译闭包的构建证明未核验**。跨版本只覆盖本轮文本会话 corpus，不覆盖全部 tool/media/delegation、rc1 整个 profile 或 0.2.0。
- 服务 14 项使用合成身份及 A64 candidate 准入、启用时效策略；不替代首购四包关闭时效的整链，也不代表生产身份获准。旧服务可写降级仍 **BLOCKED_PROVENANCE_NOT_PRESERVED**；profile 回退应保留新服务与持久状态。
- 本次新回执尚未接入 release journal。真实模型/业务 UAT、供应链、生产 activation/canary/rollback、完整客户端验收和物理分仓未关闭。没有访问真实 DuckDB、生产保存/切换、commit、push 或发布。
