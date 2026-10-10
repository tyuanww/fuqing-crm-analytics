# CRM / 知识服务独立应用包：2026-10-04

> 本页保留打包阶段的输入、日志与 artifact SHA。后续 OCR 修复更新了错误合同，最新验证见[提交前审核](./dsh-g0-crm-review-20261004.md)；下列包不能冒充新提交的候选，正式 artifact 须按 reviewed SHA 重建。

结论：T15 的 **synthetic 服务应用独立打包/资源清单**子项完成本地验证。两个最终 tarball 与实际 HTTP 测试使用的 artifact SHA 一致，可以在没有主仓 PYTHONPATH 的目录中分别运行。T3/T15 总体仍 PARTIAL；这不是完整真实 CRM/知识库迁出或生产发布。

工作树：`/Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics`，分支 `codex/plugin-boundary-review`，Git 基线 `f55908df4627a000204d16f408a0a778b265e244`。承接上一阶段 71 个未提交路径，保留全部已有修改；本轮未 commit、push、创建 PR/Release 或操作杭州。产品 VERSION、固定 DSH 和上游源码不变。

原始日志、清单、最终包与安装核对：`.context/checks/crm-service-packaging-20261004/`。其中 `summary.json` 记录当前输入摘要和本轮文件增量；本地 `.context` 不替代 GitHub/发布签名证据。

## 实际实现

- `services/crm-metrics/package.json` 和 `services/crm-knowledge/package.json` 分别拥有软件版本、API、代码/资源 allowlist 与精确 Python 依赖；不通配复制主仓，不把 DSH/插件/真实数据放进服务包。
- `package-service.mjs` 使用现有 secret scanner 与 release packer；逐文件安全读取、限额、拒绝链接/越界、固定摘要、复查源文件未改变、拒绝已有输出目录。回执区分 Git 基线与 dirty 输入，恒定 `release_ready=false`。
- `service.py check` 只读验证 schema、来源格式、manifest 文件清单、资源范围、Python 与依赖版本；`serve` 才显式绑定本进程拥有的 loopback socket，必须使用隔离 Python。启动事件表示端口已绑定，HTTP 健康单独探测。
- 独立包的 `backend` 是私有应用命名空间，用无副作用 initializer 避免加载旧 CRM 聚合导出；两个服务不用同一安装目录或 venv。主仓领域代码仍是唯一实现来源，没有复制第二份业务算法。
- 知识解释主题归知识领域，消除对指标引擎的 import；指标包不包含知识包，知识包不包含 DuckDB/指标实现。历史验证 JSON 不再触发主仓文件读取，也不冒称当前实现已经验收。
- 新独立指标 OpenAPI 必须带合同 header，不含旧 explain；旧 factory/CLI 保留兼容 adapter。离线生成器、插件类型和边界清单同步。
- 共享后端测试调用实际 pack/receive/运行测试；CI Python job 配置 Node 24 与 zstd。未触发远端 CI。

## 当前最终 artifact

| 应用包 | 字节 | archive SHA-256 | manifest SHA-256 |
|---|---:|---|---|
| `shinemage-crm-metrics-service-0.1.0rc1.tar.zst` | 48761 | `8d56709bfa6846d18fab594f19242c07d7f69ae2fc457af34caa97150ad9d323` | `24e5cc81b82031fb9e7d9240c6448372024ab0e83f4de9f886eb926a3a919793` |
| `shinemage-crm-knowledge-service-0.1.0rc1.tar.zst` | 49484 | `2bc2ec7a28ebee4a73755b11b554700b091fa7bf21e55cdca9fc3e38f3221579` | `bcc7a5324385a5726195875fbb1455efce5516c70749d644701db131a9d7b44a` |

最终位置：证据目录下 `final/metrics/`、`final/knowledge/`；重新安全解包后的只读核对记录为 `final-artifact-checks.json`。`service-packages-artifact-proof.log` 直接输出实际双进程 HTTP 测试对应的两个 SHA，已逐一与上述最终文件比较。

软件版本初始为各自 `0.1.0rc1`；API 均为 `1.0.0`。这些是 dirty workspace 的本地候选，不是已审查 release。候选的静态回执保留部署 installation/activation `NOT_RUN`；上述隔离测试结果单独存为证据，不修改 artifact 或将临时安装冒充生产部署。

## 本次验证

固定环境：Node `24.19.0`、pnpm `11.7.0`；完整后端 Python `3.14.4` / FastAPI `0.141.1` / DuckDB `1.5.6`。B0 使用自身锁定的独立 Python 环境，未修改工具链。

| 入口/命令 | 实际结果 | 证据 |
|---|---|---|
| `CRM_SERVICE_PYTHON=/tmp/fuqing-fastapi141-v2-venv/bin/python node --test --test-concurrency=1 scripts/crm-calibration/service-package.test.mjs` | 4 PASS / 0 SKIP；2 个真实包、2 个最小依赖 venv、三种查询、知识解释、合同/OpenAPI、服务停止与负测 | `service-packages-artifact-proof.log` |
| `python scripts/run_backend_tests_bounded.py`，采用完整固定环境 | 2936 PASS / 77 SKIP / 71 deselect，12 组全部 exit 0，约 258 秒 | `backend-full.log`、`backend-full/summary.json` |
| 服务/知识/指标/只读适配/语义 11 个后端文件的定向验证 | 97 PASS；含旧 adapter 回归 | `backend-targeted.log` |
| 新包装测试 + API + workflow/LFS 4 文件 | 30 PASS | `ci-wiring.log` |
| CRM 所有 `.test.mjs`（不含 browser journey）+ `host.integration.mjs` + `page-composition.integration.mjs` + `service-http.integration.mjs` | 146 PASS / 0 SKIP | `crm-final.log` |
| `B0_BUILD_UPSTREAM=<固定 rc2 checkout> node scripts/dsh-b0/pipeline.mjs --check --python /tmp/dsh-b0-python314-0200/bin/python` | exit 0；Python 618 PASS；Node 阶段合计 1435 PASS / 1 SKIP，含 clean 重跑的 83 项；独立插件 build/test/pack、7 份 clean rebuild 通过 | `b0-after-inventory.log` |
| `generate_contract.py --check`、`generate_types.mjs --check`、`plugin-boundaries.mjs --check`、本轮 Python Ruff、`git diff --check` | PASS | `summary.json` |

数字按各命令自身统计，不能把重叠 suite 相加为独立覆盖。全量 backend 仍按既有 synthetic profile 跳过真实数据库、设备或其他未配置验收；B0 唯一 SKIP 是 `real standalone example keeps filters, chart and edited KPI label`，不是本次服务包验证。最小依赖 venv 从已有固定环境按精确声明复制运行文件；这证明依赖闭包和隔离运行，不等于 wheelhouse 冷安装、供应链审计或 WSL 现场验证。

失败记录完整保留：

- `service-packages-first.log`：真实数据标记已正确被服务以 `400/FORBIDDEN` 拒绝，新增测试误断言为 422；按既有 API 修正断言，并检查稳定错误码。没有放宽服务限制。
- `b0-final.log`：生成类型变化后边界 inventory 未同步，drift gate 正确阻断；更新真实清单并新增打包/运行 owner 后完整 B0 重跑通过。
- 中间候选和检查日志只作为过程证据；上述 `final/` 与最终日志是本次通过依据。

## 尚未关闭与下一步

1. **下一项：CRM / 知识插件最终拆包。** 当前插件仍是 `@shine-mage/dsh-crm-knowledge` 组合迁移包；先保持能力名与公开 API，再验证各自未安装/已禁用时的状态、profile 组合和原生回退。
2. 源码仍在 workspace；物理分仓按既定 stop/go 与 DAG 后续执行。真实 CRM 看板/权限/私有知识库没有被本轮 synthetic 包覆盖。
3. 平台 Python/wheelhouse 冷安装、干净 reviewed SHA、签名/SBOM/CVE、受信任接收、精确宿主/session/WAL、canary/回退尚未通过；**不满足正式 Release/杭州激活条件**。
4. T3/T7 的真实服务版本窗口、D15 durable save、UNKNOWN/幂等回放与状态 forward-fix 仍开放。本次只有只读合成查询，没有数据迁移或数据回滚承诺。

没有读取真实 DuckDB/原始业务资料，没有连接真实模型、Chrome、6677 或杭州服务。没有对当前远端部署状态作新的断言。

## 本轮文件增量

本轮修改/新增 34 个路径；不是整个工作树未提交成果的全部文件：

- `.github/workflows/lint.yml`
- `CHANGELOG.md`
- `STATUS.md`
- `backend/contracts/crm-metrics-service.openapi.json`
- `backend/crm_knowledge_app.py`
- `backend/crm_metrics_app.py`
- `backend/semantic/crm_metrics_v1.py`
- `backend/services/crm_knowledge.py`
- `backend/services/crm_knowledge_topics.py`
- `backend/services/crm_readonly/runtime.py`
- `backend/tests/test_crm_service_contracts.py`
- `backend/tests/test_crm_service_packages.py`
- `config/shinemage-plugin-boundaries.v1.json`
- `docs/architecture/shinemage-plugin-boundaries.json`
- `docs/architecture/shinemage-plugin-boundaries.md`
- `docs/architecture/shinemage-plugin-platform.md`
- `docs/hackathon/TODOS.md`
- `docs/hackathon/evidence/dsh-g0-crm-service-packaging-20261004.md`
- `docs/operating/crm-plugin-service-boundary.md`
- `docs/operating/crm-service-packages.md`
- `docs/operating/verification.md`
- `docs/plans/shinemage-plugin-platform-split.md`
- `dsh-plugins/crm-knowledge/src/http-contract.generated.d.ts`
- `dsh-plugins/crm-knowledge/src/service-contract.generated.mjs`
- `scripts/crm-calibration/generate_contract.py`
- `scripts/crm-calibration/generate_types.mjs`
- `scripts/crm-calibration/package-service.mjs`
- `scripts/crm-calibration/service-entry.py`
- `scripts/crm-calibration/service-namespace.py`
- `scripts/crm-calibration/service-package.test.mjs`
- `scripts/crm-calibration/service-runtime.fixture.py`
- `scripts/crm-calibration/verify.py`
- `services/crm-knowledge/package.json`
- `services/crm-metrics/package.json`
