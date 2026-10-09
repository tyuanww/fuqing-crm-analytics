# 新候选固定服务包与本机终态组合验核（2026-10-08）

本轮 A 线只补当前 candidate 的既有准入缺口，没有产品源码修改、重打包或重建 DSH。专属树为 `/Users/hutou/.codex/worktrees/shinemage-candidate-admission/fuqing-crm-analytics`，detached HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`。Git 可见新增仅本页与[机器核验](shinemage-candidate-admission-validation-20261008.json)。本 Agent 没有 commit、push、PR、合并、发布或部署。

## 实际结果与固定身份

| 项目 | 本次结果 |
|---|---|
| 当前 candidate | `993daf31daa79137c22ce8d16c84b61892117386a9b7b8c5119fa0be62abefb0`；插件源码 `bd647352d02402c679b04172855e40ec8f2d96a5` |
| workbench | `b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b` |
| CRM | 既有 `d682081d8754d68cb34acff59fb7655d84dd7e4b0dd65caaed1499f5a76aafe7` |
| 查询与保存服务源码 | 同为 `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6` |
| 查询 archive | 既有 `109251614197e515a34a4824206e93ef53c0185e5c09a24a7906f9f7a967b8b7` |
| 保存 archive | 既有 `ee4908c40c7c8d127cec1c25b4bfae83ec6b0997d006bc7bf9615e8ee23f0ac7` |
| 官方 DSH | 0.1.7-rc.2 / `477b4f420553e8a52c2fbccc464d7561b239c443`；不修改上游 |
| 服务包只读验核 | 当前 `verifyPluginService` 接受原 pair-r2；专属复制 journal 从 seq 2 到 seq 3 |
| 幂等与旧证据拒绝 | 重试结果一致、复制 journal 字节不变；旧 target 拒绝 `SERVICE_SOURCE_TARGET_CANDIDATE_BINDING`；旧 terminal 封套拒绝 `PLUGIN_HOST_TERMINAL_PARENT` |
| 新候选本机固定组合 | 现有官方 Host 单条测试 **1 PASS / 1 warning，13.13 秒，exit 0** |

服务包验核重新核对两个 archive、manifest、来源、配方、当前 verifier 和既有九场观察记录；没有重跑九场服务业务过程。机器结果里的 `scenario_count: 9` 是已封存证据的覆盖数，不是本轮新执行九项测试。历史 WSL source-target v2 核对完整 candidate digest 与 candidate.json 原字节，无法转用于这个新候选。

主 Agent 在本线复制 journal 演练后，通过现有 CLI 正式追加集成树的 `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`，seq 3；正式 journal SHA 为 `018bf8a055af8e2315c7071d54aa73bc9ab604c2cb8c2288d1ff2cd2b947ef6c`。本 Agent 从未写正式 journal。此前 `result.json` 的“原 journal 保持”描述的是静态演练时点；后续主 Agent 的正式追加单列于 `final-verification.json`，没有改写前一时点的记录。

正式服务包验证参数仍为：

```text
pnpm dsh plugin verify-service
  --candidate <集成树>/.context/checks/abc-local-candidate-20261008/candidate/candidate.json
  --evidence <只读主成果树>/.context/checks/first-purchase-source-packages-20261007/pair-r2/receipt.json
  --state-path <集成树>/.context/checks/abc-local-candidate-20261008/plugin-state.json
```

此处“集成树”为 `/Users/hutou/.codex/worktrees/shinemage-abc-integration/fuqing-crm-analytics`；“只读主成果树”为 `/Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics`。不传旧 `--target-evidence` / `--target-input`，不移植旧 journal 事件。

## 本机新组合实际执行范围

入口是现有 `backend/tests/test_analytics_first_purchase_official_host.py` 的唯一测试，设置 `B0_NATIVE_CRM_RECOVERY=terminal`；使用 Node 24.19.0、Python 3.14.4 和既有固定 wheelhouse。自己的 `input-v4.json` 只把原 input-v4 的 `candidate_path` / `candidate_sha256` 换成本次新候选，原 profile、service binding、CRM、query/save archive 和旧输入不变。该差异封存在 `input-delta.json`，完整命令和环境见 `local-command.json`。

测试在独有临时目录冷装既有 query/save archive，启动自己的 loopback mock model、合成 CRM、官方 Host 和合成查询/保存服务，不执行真实模型或业务数据。启动前核验 4335–4337 无监听；没有使用 HTML 线的 4328/4329。验证了登录/命令、查询、保存回执丢失后的重放、服务独立重启、取消、宿主重启后的重新认证、原生回退，以及在途 SIGKILL 的终态恢复。

新候选中断任务实际为 `FAILED / runtime_status=EXITED / execution_active=false / EXECUTION_UNKNOWN`，派发次数 1；这代表安全收敛到失败终态，不代表计算成功。50 条已提交会话前缀保持，恢复后原生对话回退通过，最终 1 个 query worker、1 条保存分析。测试记录 `package_integrity=PASS`。复核记录中的 8 个业务/Host PID 均已退出，query/save 清理收据正常，4335–4337 无监听；mock/IPC 生命周期由原测试 finally 与 Host observer 的 `cleanup_ok` 确认。

后置独立核验首轮误把 query 进程收据当成 service 收据，访问不存在的 `process_exited` 导致 KeyError；没有重跑业务。保留 `finalize.py` / `finalize-r1.log`，r2 按 query 的真实 `stopped.status=KERNEL_STOPPED`、`active_workers=0`、`integrity=PASS` 与 service 的 `process_exited` 分别核对后通过，原始收据未修改。

## 原始证据及未关闭项

原始证据根为专属树 `.context/checks/candidate-admission-20261008/`：

- `verify.mjs`、`verify.log`、`result.json`：当前服务验证器、幂等及旧回执拒绝；`journal-copy.json` 是专属演练副本。
- `input-v4.json`、`input-delta.json`、`local-command.json`、`local-v4.log`、`local-result.json`：新候选组合、命令与本次 1 PASS。
- `local-v4/test_official_host_crm_query_s0/`：`plugin-artifacts/packages.json`、`source-boundary.json`、`interrupted-run.json`、Host HTTP/recovery、query/save 进程原始记录。
- `final-verification.json`：20 份主要证据的逐文件 SHA-256、原输入保护、新旧 journal 写入责任、清理和剩余缺口。

**本次只关闭当前候选的固定服务包关联与本机合成终态组合子项。** 没有新的 WSL 目标 source-HTTP 回执；现有 terminal/browser 验证器要求同候选的目标父事件及固定 Linux/WSL runtime、控制器和原始包证据，本机 Darwin 结果不能替代。没有扩展 schema、包装成 WSL 封套或追加 Host 事件。目标 source-HTTP/terminal/browser、真实模型/身份/UAT/生产、正式 CI 仍未完成；SDK 分发 BLOCKED、release_ready=false。完整 B0、28 项服务专项、shell/tool、查询冷安装、十场更新与原 headed 25/25 均未重跑。没有访问杭州、6677、旧 CRM、WeKnora 或真实业务 DuckDB。
