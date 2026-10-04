# G0：插件候选、宿主回执与服务存储恢复

2026-10-04，`codex/plugin-boundary-review`；源码基线仍为 `1737adc3cffeb9db5fbbcee222fb044526324d40`。本页记录该提交之后的本地增量，未新增业务 commit、push、Release 或杭州操作。前一阶段宿主行为见[固定宿主证据](./dsh-g0-pinned-host-20261004.md)。

## 候选与真实宿主接线

本轮新增 `pnpm dsh plugin verify-host`。它复用 `scripts/release/state.mjs` 的锁、持久化与幂等记录，不建第二本账：

1. candidate 自带原字节 `profile.json`，snapshot digest 纳入 candidate digest。
2. 读取绝对路径的 candidate、`plugin-pack.json`、tarball 和 v2 host evidence；核对实际文件摘要、固定 DSH、当前验收源码、平台、十项 PASS、CRM 身份、双包 composition、安装入口和原生会话文件。
3. 核对既有 `CANDIDATE_PREPARED` 的 candidate/profile/pack digest，随后仅追加一次 `CANDIDATE_HOST_VERIFIED`。
4. 原 candidate 不改写；重复执行返回同一 journal 序号/摘要，`activation: NOT_RUN`、`service_state: NOT_RUN`、`release_ready: false`。

专用 profile 为 `config/dsh-profile.crm-knowledge.rc2.json`；默认七插件 release profile 不变。首期只认证所选候选在此次固定 CRM＋知识组合中的本机观测，不认证任意单域或其他组合。伴随包精确版本/摘要单列在回执中；profile allowlist 不等于所有包的版本锁。旧 v1 host receipt 或没有 profile snapshot 的旧 candidate 会拒绝。

这是受控本机 harness 的观测记录，**不是数字签名、完整 runtime 信任链、host 激活或生产放行**。v2 会校验当前 verifier/source 文件摘要；源码变更后旧证据不再能附加为当前通过。纯 verifier 单元夹具在临时目录使用，明确标记未运行宿主，未用来填下面的真实结果。

## 本次实际输入与结果

真实集成目录：`.context/checks/plugin-host-journal-20261004/`。只读共享 Git 对象建立本次拥有的隔离源码副本，按已提交 `1737adc3` 提取两个插件与 `.gitignore`；复用上一轮经摘要核验的构建文件，不在业务工作树 reset/stash/换分支，也不以新造 fixture commit 冒充源码身份。实际 `createPluginCandidate`/`packPlugin` 生成包后核对与上轮 tarball **逐字节相同**，再用官方 Web CLI 重新跑十项场景。

| 输入/结果 | 值 |
|---|---|
| Node / pnpm / 平台 | 24.19.0 / 11.7.0 / macOS arm64 |
| DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，官方 checkout 源码未修改 |
| CRM 包 | `0.0.0-crm.1` / `4be76b81f374b4cf354d783bb11c49bbe09df468b8c398186184f7066a11c968` |
| knowledge 包 | `0.0.0-candidate.1` / `fb1b4d9e1e626d8ba858bb0ea849d022eed29a3e5385da5a884a0397be96d7a0` |
| candidate digest | `588590c6913ee1841d4f827d8703f558b18acfdfbd6678ade054fec439e40136` |
| v2 host evidence SHA-256 | `124f4e01ef365e3cf380882648d0b73dde3ec30239eb5d0992d49446ad1dfe84` |
| 真实宿主结果 | **10/10 PASS**：实际加载/组合/工具、正常重启、原生会话、在途崩溃恢复、挂死回收、原生回退、恢复原组合 |
| CLI 接线 | **PASS**，`CANDIDATE_HOST_VERIFIED` 为第 3 条 journal；独立 CLI 重试返回相同回执，journal 与 candidate 字节未变 |

候选生成用当前适配器的实际 API（显式 root 指向隔离源码），核验和重试用 `scripts/dsh.mjs plugin verify-host` 的真实 CLI。可复跑步骤见[插件作者入口](../../operating/dsh-plugin-author-quickstart.md)。本机集成驱动保存在 `run-integration.mjs`；原始结果为 `integration-result.json`、`host-verification-receipt.json`、`candidate-state.json`、`host/evidence.json`。宿主 inputs 记录当前未提交脚本摘要，不能只用 `1737adc3` 描述验收器源码。

首次临时驱动存在相对 import 路径错误，在建候选/启动宿主前退出；修复后完整重跑通过，失败保留为 `integration-import-failure.log`，未覆盖或计为通过。

## T3/T7 的存储恢复子项

新增 `backend/tests/test_analytics_first_purchase_save_recovery.py`，调用现有 FirstPurchase RunStore、可信结果解析、保存 owner 与 SQLite 事务，无业务数据库访问或新状态机。真实子进程故障结果：

| 场景 | 实际结果 |
|---|---|
| 保存记录和幂等响应已写、COMMIT 前 SIGKILL | 新连接读到 0 条分析/幂等记录；新进程重试只落 1 条 |
| COMMIT 后、返回响应前 SIGKILL | 调用端无成功响应；库内 1 条；新进程相同请求/键恢复同一分析，重复重试不新增 |
| 丢失响应后更改请求或撤销保存权限 | 409 / 403；原记录和幂等表不变 |
| 保留服务状态并 forward-fix | 新连接发布 v2 标题，保留 v1 快照/事实；旧保存请求仍回放原 v1 回执 |
| 服务状态版本不兼容 | 初始化拒绝，不重建/删除既有记录、不自动降级 schema |

这里证明的是**当前 v1 存储实现的同版本恢复**。未用替换 profile 指针冒称数据回滚，未执行旧/新服务二进制的跨版本迁移。当前保存请求/响应合同仍缺候选 `candidate_digest`、`correlation_id` 与独立 UNKNOWN receipt/reconcile 绑定；原有成功保存测试不关闭 D15 v2 门禁。按已确认 D4-C，首个候选继续保留 `save: NOT_AVAILABLE`，直到服务合同与完整回放矩阵通过。

## 验证命令与证据

- `pnpm dsh test`：**142 PASS / 0 SKIP**，`release-suite.tap`。包含 verifier 的篡改/漏项/错 scope/错 journal、参数校验和重试负测。
- `node .context/checks/plugin-host-journal-20261004/run-integration.mjs`：**真实宿主 10/10 + CLI journal PASS**，`integration.log`；不会调用真实模型。
- `/tmp/fuqing-fastapi141-v2-venv/bin/python -m pytest backend/tests/test_analytics_first_purchase_save_recovery.py backend/tests/test_analytics_first_purchase_analysis.py backend/tests/test_analytics_first_purchase_native.py -q`：**31 PASS**（含新增 5 个场景），`service-save-tests.log`。
- `/tmp/dsh-b0-python314-0200/bin/python -m pytest --noconftest -W error::ResourceWarning -q backend/tests/test_analytics_first_purchase_save_recovery.py`：**5 PASS**，`service-save-b0-tests.log`。关闭隐藏 warning 后复核，唯一提示是固定 FastAPI/Starlette TestClient 的 httpx 弃用提示；没有资源未关闭失败，未改动锁定环境。
- 新测试 Ruff、源码边界检查、`git diff --check`：PASS；本轮 15 个修改/新增 Markdown 的 141 个本地链接存在，`document-links.json`。`final-integrity.json` 再次核对 5 份源码输入摘要、宿主证据 SHA 与第 3 条 journal 摘要，5 个自有宿主 PID 全部已回收、上游 tracked source 干净。
- 未修改 Pydantic/OpenAPI/前端合同。新 Python 目标和 verifier 目标已接入现有 B0 pipeline；本轮未以此宣称完整 B0、浏览器或远端 CI 重跑。

## 剩余项

- T3/T7：D15 public envelope、候选/关联 ID/幂等键/持久化 key 的完整回执与 UNKNOWN 查询；真实 CRM 兼容窗口和跨服务版本 forward-fix。
- T13/T21：生产 activation journal、远端 receive/reconcile、重启中断后的生产恢复；本次仅完成本机候选观测接线。
- T15：kit 固定 dev dependency 与独立仓根目录构建；不再依赖相邻 workspace 路径，然后按 G0/stop-go 推进 authoritative 物理分仓。
- 目标平台 runtime、WSL2、签名/SBOM/CVE、canary/灰度/真实 UAT 和远端授权仍按原计划，不因本机 PASS 放行。
