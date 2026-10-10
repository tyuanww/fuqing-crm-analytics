# CRM 解耦提交前审核：2026-10-04

结论：对 `codex/plugin-boundary-review` 当前 CRM 解耦增量完成 OCR delegation 审核与提交前 `/review` 检查。发现并修复 1 项错误合同问题、2 项文档失真；最终范围内没有未关闭的已确认 P0/P1 问题。本地代码可以提交，T3/T15 和整体产品仍为 **PARTIAL**，不满足正式 Release 或杭州激活条件。

工作树：`/Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics`。审核基线为 `f55908df4627a000204d16f408a0a778b265e244`；本提交收拢其后已有的 CRM slot、主题/页面、HTTP 服务边界、独立应用包及本轮修复。最终提交号以 Git 历史为准；未改 VERSION、固定 DSH 或上游源码，未 push、发布或操作杭州。

“合成”描述测试数据来源：这些候选接口使用人工构造的小型 fixture 和公开知识定义，验证计算、错误处理及部署边界。它不表示已接入真实 CRM 数据，也不替换既有真实看板的登录/HTTP 适配；真实业务验收另行进行。

## 审核范围与覆盖

使用 `open-code-review-delegate`：OCR 只执行文件选择与规则解析，主 Agent 阅读源码、差异、调用方和测试。按 workflow、JSON、Python、JS/TS、package 与 fallback 规则分批检查；提交前另有一次宿主内对抗审查，未调用外部模型服务。对抗审查对测试使用摘要，主 Agent 已阅读测试与夹具本身。

| 范围 | total_files | reviewed_files | skipped_files | coverage_rate |
|---|---:|---:|---:|---:|
| OCR reviewable | 61 | 61 | 0 | 100% |
| OCR 默认排除，但人工补审的文档、生成物、测试和删除项 | 26 | 26 | 0 | 100% |
| 初始工作树增量合计 | 87 | 87 | 0 | 100% |

本报告为审核后新增的第 88 个路径，另作最终文档核对。生成物同时检查领域输入、生成器与实际生成差异；slot/theme 的双端副本一致。对已删除的 `src/run.mjs` 核对替代客户端与调用方，不把删除项默认为无须审核。

原始证据目录：`.context/checks/crm-ocr-delegate-20261004-153204/`，包含 `preview.json`、`rules.json`、逐个 `(path,status)` 的 `checklist.json`、`findings.json`、`summary.json` 和本次测试日志。本地证据不替代远端 CI、签名或部署回执。

## 发现与修复

| ID / 严重度 | 问题与影响 | 修复与验证 |
|---|---|---|
| OCR-CRM-01 / medium | 服务实际返回脱敏的 `status/code/message` 错误，OpenAPI/生成类型却仍声明 FastAPI 的 `HTTPValidationError/detail`，且漏掉 400/403/409；独立消费者会依赖错误合同 | `backend/crm_service_contracts.py` 在路由注册前发布严格 `ServiceError`，同步三个 OpenAPI、客户端类型及输入摘要；不改变实际错误响应、权限或 API 版本。新增三种 app/adapter 组合的真实 HTTP 回归：修复前 3 FAIL，修复后通过 |
| OCR-CRM-02 / low | CRM README 仍称服务未完成独立打包，与已有实现和证据矛盾 | 明确独立应用候选和隔离运行已完成；物理分仓、平台冷安装、精确宿主仍未完成 |
| OCR-CRM-03 / low | 验证入口文档写 Ruff 0.16.8，与实际锁定的 0.16.9 不符 | 按锁文件修正文档，不修改环境或依赖 |

所有上述发现均已修复，没有保留的 code finding。宿主内审查复核了 OCR-CRM-01；全局页面工具与 profile agent 作用域内工具按官方 SDK 的作用域机制组合，不重复记为注册冲突。

主要变更分组：

- 插件：`crm-knowledge` 的独立 HTTP 客户端、生成合同、原生 dock 与 profile 组合；`analytics-workbench` 的公开 `./page-tools` 和 cockpit slot；品牌领域的主题合同。
- 服务：指标/知识两个 ASGI app、领域输入与资源、独立软件包清单、受控打包/检查/运行入口及离线合同生成器。
- 验证：实际包解包与隔离双进程 HTTP、负测、SDK/页面组合、共享后端验证和 CI 接线。
- 账本：STATUS、TODOS、拆分计划、边界清单、操作文档和历史阶段证据；历史测试数字保留时间语境。

## 本次实际验证

固定环境：Node `24.19.0`、pnpm `11.7.0`；完整后端 Python `3.14.4` / FastAPI `0.141.1` / DuckDB `1.5.6` / Ruff `0.16.9`。B0 使用其独立锁定环境。以下各 suite 存在重叠，不能相加为独立覆盖数。

| 命令/范围 | 当前结果 | 本次证据 |
|---|---|---|
| `python -m pytest backend/tests/test_crm_service_contracts.py -k published_error_contract -q`，修复前 | 3 FAIL / 13 deselected，重现错误合同 | `error-contract-before.log` |
| `python -m pytest backend/tests/test_crm_service_contracts.py -q`，修复后 | 16 PASS | `error-contract-after.log` |
| `python scripts/run_backend_tests_bounded.py --report-dir .context/checks/crm-ocr-delegate-20261004-153204/backend-full` | 2939 PASS / 77 SKIP / 71 deselected；12 组 exit 0；含真实应用候选打包、解包和隔离 HTTP 测试 | `backend-full.log`、`backend-full/summary.json` |
| CRM 全部 `.test.mjs`（不含 browser journey）及 `host.integration.mjs`、`page-composition.integration.mjs`、`service-http.integration.mjs`，Node 串行测试 | 146 PASS / 0 SKIP | `crm.log` |
| `B0_BUILD_UPSTREAM=<固定 rc2 checkout> node scripts/dsh-b0/pipeline.mjs --check --python /tmp/dsh-b0-python314-0200/bin/python` | exit 0；Python 618 PASS；Node 各阶段合计 1435 PASS / 1 SKIP，含 clean 重跑 83 项；独立插件构建/打包及 7 份产物干净重建通过 | `b0.log` |
| `generate_contract.py --check`、`generate_types.mjs --check`、B0 内的边界/slot/theme drift 检查、受影响 Python Ruff | PASS | 本轮命令输出与 `summary.json` |

后端证据中的源码摘要为 `debf73136471b6d5fcb64630f3a01a4946bac9c6781db97a8f5d4c056782a753`，完成后核对源码未漂移。最终差异、文档本地链接、暂存范围和正常 Git hook 的结果由 `summary.json` 与 Git 提交输出记录；这些检查不复用历史测试结果。

保留预期失败过程：三个新增负测先失败；更新 OpenAPI 后、重生 TypeScript 前的 `--check` 正确提示生成物漂移，重生并复检后通过。未绕过工具链检查或 hooks。

首次 commit 被文档证据检查拦截；已将六处宽泛表述改成明确的模块加载、配置状态和待办文件名，保留 `commit-first.log` 与检查输出。代码未变化，未跳过 hook；最终提交结果见 `commit.log`。

后端 SKIP/deselect 来自既有 synthetic 测试选择，不代表真实数据库、设备或 slow 项通过。B0 的 1 个 SKIP 为未提供外部样例的 standalone HTML 案例。测试中已有警告记录保留；它们不作为真实浏览器通过的证据。

## 保留的边界与后续门禁

1. 当前仍是组合候选插件 `@shine-mage/dsh-crm-knowledge`；下一步按既定计划分别拆 CRM 与知识插件，保留公开 API、能力名、未安装/已禁用时的原因和原生回退。
2. 服务 authoring 源码仍在 workspace，尚未物理分仓。最小依赖 venv 从已有固定环境构造，未证明平台 wheelhouse 冷安装或 WSL 兼容。
3. 错误合同修复改变了包输入。此前服务打包阶段的 archive SHA 只属于历史阶段，正式候选必须从本次 reviewed commit 重新生成；本轮临时测试包不能作为正式 Release。
4. 精确 DSH 宿主生命周期/session/WAL、签名/SBOM/CVE/来源信任、远端 receive/reconcile、canary/原子回退以及真实 CRM 权限/容量验收仍未关闭。T3/T7 的 durable save、UNKNOWN/幂等回放与状态 forward-fix 不在本轮完成范围。
5. 真实模型、Chrome/6677、杭州 Windows/WSL、远端 CI 和真实业务数据均为本轮 **NOT_RUN**。未读取真实 DuckDB，没有生产数据迁移或服务切换；不能据此宣称项目全部收尾。
