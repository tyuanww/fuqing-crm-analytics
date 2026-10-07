# 原生请求恢复投影修复（2026-10-07）

**本机源码修复与官方 Host 验证通过；新 immutable candidate / 杭州复验仍 NOT_RUN，release_ready=false。** 上一批恢复演练及缺陷证据已通过正常 hooks 提交 `de89a527`。本页不改写旧候选 `861d6ef1…` 的 UNKNOWN 观测。

## 修复范围

- `nativeJournal.ready(session)` 使用固定官方 `sessionQuery.readSession()` 读取完整历史，包括不重发实时事件的恢复 seed。读失败、会话替换、序号断裂或重叠事件不一致时不暴露部分投影，后续观察可以重试。
- 异步读取期间缓冲实时事件，验证与快照的重叠部分，只折叠连续后缀；同会话并发读取共用一次初始化。会话销毁和官方 Cordis effect 卸载后，迟到读取不能复活投影。
- bridge、工具、Skill 与首购命令在使用请求相关性前等待该投影；各入口显式声明 `sessions/sessionQuery` 依赖。仍要求原生 driver idle、持久化 flush 与请求/turn 相关性，不能凭 PID 或超时释放名额。
- `B0_NATIVE_CRM_RECOVERY=terminal` 是修复后的终态断言入口。`=1` 保留对旧候选的 UNKNOWN 复现，两者在观测中明确区分；两种都不放行生产。

## 实际验证

原始日志位于 `.context/checks/native-journal-recovery-20261007/`；`command.json` 记录隔离环境和初始命令，最终同一命令只把 `--basetemp` 改为新目录 `host-r4`。本轮使用 Node 24.19.0、Python 3.14.4、官方固定 SHA `477b4f42`、本工作树构建的插件与合成 CRM/model/小型 SQLite，不使用真实业务库。

| 验证 | 实际结果 |
|---|---|
| workbench 正式 build / Host 和 client typecheck | PASS；使用已有 SDK 链接所指的固定、tracked clean 上游路径，无上游改动 |
| `native-*.test.mjs`、built、commands、model、initial-session、run-view | **66 PASS / 0 SKIP**，其中投影 16 项包含真实 Cordis 生命周期；`node-final-r2.log` |
| native/query/first-purchase runtime 和 CRM 身份相关五个后端文件 | **50 PASS / 0 SKIP / 1 warning**；`backend.log` |
| 官方 Host 源码 HTTP + 来源 HTTP + 在途 SIGKILL 恢复 | **1 PASS / 1 warning，4.44 秒**；`host-r4.log` |
| 中断业务任务 | `FAILED`、`runtime_status=EXITED`、`execution_active=false`、`error_code=EXECUTION_UNKNOWN`、`dispatch_attempts=1`、`result=null`；`host-r4/test_official_host_crm_query_s0/interrupted-run.json` |
| 重放与保存 | 同原请求不重复派发，原成功任务保持 SUCCEEDED，一个 worker、一条分析；`source-boundary.json` |
| 清理 | 本次 Host/模型关闭，4335/4336/4337 无监听；未操作杭州或生产服务 |

复现终态入口（上游必须为已有、tracked clean 且已编译的固定 rc2）：

```sh
B0_NATIVE_CRM_HOST_UPSTREAM=/absolute/pinned-built-rc2 \
B0_NATIVE_CRM_SOURCE_HTTP=1 B0_NATIVE_CRM_RECOVERY=terminal \
PYTHONPATH="$PWD" PYTHON_DOTENV_DISABLED=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
/absolute/python3.14 -m pytest --noconftest -q -W error::ResourceWarning \
  backend/tests/test_analytics_first_purchase_official_host.py \
  --basetemp /absolute/new-owned-evidence
```

## 调查与审核

纯投影单测首先暴露原实现没有异步恢复入口。正式构建第一次被既有 SDK 链接路径校验拒绝；核对 SHA/clean 状态后使用其实际固定路径，没有改链接或工具链。首次真实 Host 发现新读取依赖未在各插件入口声明，补齐后整链到达终态；另修正测试读取错误字段和官方 Session 夹具的 surfaceOp。`host.log`、`host-r2.log`、`host-r3.log` 和早期 Node 失败日志保留，不冒充最终通过。

提交前 OCR delegate 选中 10 个代码/测试文件；手工补审 Python 和 `.d.mts`，原始 **12/12** 覆盖。检查了异步竞态、失败重试、生命周期、显式依赖、所有调用方、严格终态断言和旧候选复现边界。另手工核对 7 个文档与 changelog，最终 total_files=19、reviewed_files=19、skipped_files=0、coverage_rate=100%；本批没有遗留的本地提交阻塞。

未执行：新 SHA 插件打包、原固定服务/runtime 与新插件的组合验收、杭州终态复验、新回执绑定。此前供应链、真实身份/模型/UAT、canary/生产切换、完整 UI 与物理分仓门禁继续开放。
