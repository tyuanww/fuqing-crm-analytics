# T15/T3 CRM 插件与服务边界（2026-10-04）

结论：CRM 插件已去掉寻找主仓目录、Python 解释器和 CLI 子进程的运行依赖。合成查询与公开知识解释改为各自配置的 HTTP API 1.0.0。独立包与服务边界通过本地合成验证，整体拆分与产品仍 PARTIAL。

工作树为 `/Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics`，分支 `codex/plugin-boundary-review`，HEAD 仍为 `f55908df4627a000204d16f408a0a778b265e244`。在原有 45 个未提交文件上继续修改；未 reset/stash/换分支，未提交、推送、发布或操作杭州。DSH 仍固定 `0.1.7-rc.2 / 477b4f420553e8a52c2fbccc464d7561b239c443`，VERSION 未变。未读取真实 DuckDB、账号凭据或调用真实模型。

## 实际改动

- 查询客户端和公开知识解释客户端只接受显式 loopback origin；移除插件中的 `run.mjs`、`node:child_process`、`CRM_METRICS_PYTHON` 和主仓路径发现。缺服务返回 `NOT_AVAILABLE / SERVICE_NOT_CONFIGURED`，不影响原有真实 CRM 登录/看板能力，不回退到另一来源。
- 复用原计算器和知识实现，增加独立知识 ASGI app。合成指标与公开知识各有领域 owner、API 1.0.0、OpenAPI 和消费者类型；原 metrics/explain 保留为服务侧兼容 adapter。Python/知识资源仍在主仓服务侧，并未物理拆仓或打成独立镜像。
- 请求与响应逐次校验版本 header。OpenAPI 同步声明新知识接口必需 header、旧 metrics 兼容窗口的可选 header。版本标识不是认证；真实业务仍沿用既有账号/文档权限。
- 复用官方 DSH schema 校验器，检查数据来源、query 身份与公开合成标识。HTTP 读取上限 2 MiB、总超时 30 秒，禁止重定向、不自动重试；取消保留 AbortError，失败不回显服务正文或地址。HTTP 取消不宣称终止已经开始的服务端计算。
- profile v2 配置两个可选服务地址，记录 CONFIGURED_NOT_RUN/NOT_AVAILABLE；准备过程不联网、不启动服务、不写旧 profile。旧 `--python` 给出明确迁移错误。独立登录候选入口也不再要求解释器。
- 独立包测试新增最终 tarball 安全解包后加载，仅提供固定 SDK 依赖；在没有 backend、knowledge 和 Python 运行配置时，查询/知识工具能按合同降级，配置服务后可经实际 ToolRuntime 发起 HTTP 请求。

## 本轮实际验证

日志根：`.context/checks/crm-service-boundary-20261004/`。Node 24.19.0、pnpm 11.7.0；完整 backend Python 为已有的锁定 3.14.4（FastAPI 0.141.1、DuckDB 1.5.6），B0 另用自身锁定最小解释器。没有安装或升级依赖。

| 验证 | 结果 | 原始证据 |
|---|---|---|
| 后端领域/API/来源/兼容 adapter 与生成物漂移 | 67 PASS，2 warnings | `backend-final.log`、`backend-final/summary.json` |
| CRM 全部合成 Node/Host/UI 回归，排除真实浏览器旅程 | 146 PASS，0 SKIP；包含公开服务实际查询及原有登录/ACL/资产/图谱测试 | `crm-final-after-contract.log` |
| 服务双进程查询、停掉查询后知识仍可用；最终夹具清理复验 | 7 PASS | `service-fixture-final.log` |
| 解释器启动失败的夹具清理 | PASS，无等待遗留 | `fixture-startup-failure.log` |
| 固定 SDK 类型检查与构建 | PASS | `build-final.log` |
| brand/query/CRM 隔离 build/test/pack，CRM tarball 再解包并加载 | 3 PASS；CRM 包级 4 项测试由 B0 再验 | `packed-install.log`、`b0-final-after-contract.log` |
| 最终完整 B0 | 退出 0；Python 618 PASS；Node 阶段合计 1435 PASS / 1 SKIP；7 份 workbench 编译产物 clean rebuild 一致 | `b0-final-after-contract.log`、`build-evidence.json` |
| 边界漂移与负测 | 10 包、591 源文件、24 条跨包引用、13 条合同；9 项边界负测通过 | `boundaries.log` 与当前机器清单 |
| 实际 built plugin 生成有/无服务地址的 profile v2 | 两组均生成通过；有配置为 CONFIGURED_NOT_RUN，无配置为 NOT_AVAILABLE；未加载宿主 | `profile-with-services/manifest.json`、`profile-without-services/manifest.json` |
| 离线合同/类型、Ruff、差异格式与文档引用 | PASS | `ruff-final.log`、`final-checks.log` |

以上测试有重叠，不把各行相加成独立场景总数。B0 Node 合计含 clean 重跑 83 项；唯一 SKIP 是未提供的外部 standalone HTML 样例。不是实际 Chrome、完整原生 profile、真实模型或杭州验收。

关键复现命令：

```sh
/absolute/backend-python scripts/run_backend_tests_bounded.py \
  backend/tests/test_crm_service_contracts.py \
  backend/tests/test_crm_calibration_regressions.py \
  backend/tests/test_crm_calibration_integration.py \
  backend/tests/test_crm_metrics_v1.py backend/tests/test_crm_knowledge_pack.py

/absolute/backend-python scripts/crm-calibration/generate_contract.py --check
node scripts/crm-calibration/generate_types.mjs --check

CRM_METRICS_PYTHON=/absolute/backend-python \
  node --test dsh-plugins/crm-knowledge/test/tools.test.mjs \
  dsh-plugins/crm-knowledge/test/service-http.integration.mjs

B0_BUILD_UPSTREAM=/absolute/pinned-dsh \
  node scripts/dsh-b0/pipeline.mjs --check --python /absolute/b0-python
```

CRM 全套命令、源码与最终日志摘要见同一日志根的 `summary.json`；浏览器旅程明确排除，没有改名隐藏 skip。临时服务使用自己绑定的随机 loopback 端口、空 HOME/TMP、绝对 PYTHONPATH，结束只停本次子进程。

CRM fixture tarball 为 243637 bytes，SHA-256 `d31061eef69685036fbed19c959deb3af96730f5e577e63d93074ff0dc6c520e`；包身份仍为 `0.0.0-candidate`。这是临时 Git 夹具生成并校验的包，不是 clean reviewed 产品 SHA、正式插件版本或 Release。DSH profile 安装/激活仍 NOT_RUN。

## 失败与修复

1. 初次服务测试 1 PASS / 5 FAIL：测试 before hook 内注册的 after 被提前执行，服务在测试开始前已经关闭。把清理注册移到正确生命周期后 6/6 通过；保留 `services-first.log`。
2. 首次 Host 组合 23 PASS / 3 FAIL：两项子断言及父项仍假设未配置服务时自动运行 Python。将未配置路径改为断言 NOT_AVAILABLE，同时在显式配置路径继续验证原 GSV/知识定义和证据。保留 `host-service.log`；最终完整 CRM 146/146 通过。
3. 收尾核对发现 header 校验尚未出现在 OpenAPI，已用 FastAPI dependency 同步可选/必需和固定值，并补生成物/接口断言。最终后端 67/67、CRM 146/146 和 B0 重新通过；未用修改前结果替代。
4. 静态检查补齐测试夹具的解释器启动失败清理：没有 PID 时不再挂起等待 exit 事件；ENOENT 实际探针通过。

## 修改文件与归属

- 服务及合同：`backend/crm_metrics_app.py`、`backend/crm_knowledge_app.py`、`backend/crm_service_contracts.py`、`backend/contracts/crm_knowledge_v1.py`、两个 `crm-*-service.v1.json`、metrics/knowledge OpenAPI。
- 插件：`src/index.ts`、新增 `src/service-client.mjs` 与服务生成合同、知识/指标 HTTP 类型；删除旧 `src/run.mjs`。页面、品牌和真实登录实现沿用上一轮。
- 工具：`generate_contract.py`、`generate_types.mjs`、`prepare-profile.mjs`、`serve-login-candidate.mjs`、`verify.py`、B0 pipeline/独立包测试与边界 policy/inventory。
- 验证：`backend/tests/test_crm_service_contracts.py`；CRM service-client/service-http/fixture、tools/profile/package/host 测试。
- 文档：STATUS、CHANGELOG、计划、`docs/hackathon/TODOS.md`、架构边界、验证/插件 Quickstart、CRM README、图谱部署和新服务运行说明。本轮精确路径及文件摘要见日志根 `this-turn-files.json` 与 `summary.json`。

## 未关闭

- T15：服务代码/知识资源独立打包，CRM 和知识插件最终拆包，dev kit/versioned dependency 与物理分仓。
- T3/T7：真实 CRM API 兼容窗口、D15 public receipt/candidate/correlation/idempotency、UNKNOWN 重放与服务状态 forward-fix；本轮只读合成 API 不提供 durable save。
- T2/T17/T21：精确官方 profile、生命周期/WAL、进程级故障隔离、原子激活/回退、canary、签名/SBOM/CVE 和远端 receive/reconcile。
- 本轮代码未提交，旧 OCR 结论不覆盖新增服务接口。正式 candidate 必须在对应 reviewed commit 上重建；未达到新的 Release/杭州切换条件。
