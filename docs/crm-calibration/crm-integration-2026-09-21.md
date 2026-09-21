# CRM 三候选本地整合（2026-09-21）

基线公开仓库 main `64eb6e06`（#37 / v0.13.0.0）。整合工作树 `/Users/hutou/.codex/worktrees/crm-analysis-board/fuqing-crm-analytics`，分支 `codex/crm-analysis-board`。只读来源：`crm-metrics-closeout`、`crm-graph-acl`。产品仍 PARTIAL。未授权提交、push、PR、merge、VERSION 升级或 6677 reload。

开始前三树 HEAD 均为 `64eb6e06`。未跟踪 `docs/crm-calibration/deliveries/C/validation-result.json` 与已跟踪 `knowledge/crm/tests/validation-result.json` 字节相同（SHA256 `463f49c18411d91b4b89aea5420d95ac87959c6afa8f15a73a5d08e0179873ba`），属 C 线离线知识包校验产物，不是分析组板交付。已移存 `.context/checks/crm-integration-20260921T-integration/moved/`。专项测试会经 `knowledge/crm/tests/validate_pack.py` 再次写出该 docs 路径；已改为只写知识包内 `tests/validation-result.json`，`test_crm_knowledge_pack.py` 6 passed，docs/deliveries 不再出现。

私有备份：`.context/checks/crm-integration-20260921T-integration/`（三树必要源码/文档副本、对 HEAD 差异、指纹）。不含 `.context` 整树、凭据、数据库或真实数据。

## 已整合能力

| 来源 | 并入内容 |
|---|---|
| 分析组板 | 历史检索分页、标题/说明 PATCH、账号分享/撤销与幂等重放、独立 `crm-board/v1`、登录/取消/逐次鉴权、组板布局 ID 修复 |
| 指标收尾 | `dashboard-readiness` / `membership` / `net-gsv` 合同、服务、插件工具与测试；GSV/AOV/AUS 10 组既有真实只读复算记录 |
| 图谱 ACL | 关系质量账本、文档版本/分块哈希、审核过期、账号 grants、图查询/检索/引用展开中途撤权、原生 Host 卸载、候选 `weknora_search` 隔离 |
| 本轮接线 | 含知识引用的分析绑定可信查询来源；保存/分享/读取/列表/组板/驾驶舱加入按当前 grants 重查 |

纯销售指标分析没有知识引用时不检查教材权限。现役 preset 未改。

## 共同文件处理

| 文件 | 处理 |
|---|---|
| `dashboard-access.mjs` | 保留分析组板资产操作与较大请求体；并入指标 named 查询、图谱 `principal`、会话级可信引用账本 |
| `crm-dashboard.openapi.json` | 合并分析组板路径与指标路径后由 `generate_contract.py` 离线生成 |
| `dashboard-contract.generated.d.ts` | `generate_types.mjs` 离线生成，未手工拼接 |
| `verify.py` | 并入 closeout 测试与指标源码指纹/Ruff 路径，保留分析组板 ruff 目标 |
| STATUS / TODOS / CHANGELOG / 插件 README | 以整合工作树为唯一正文，吸收三份交付事实 |

独占文件从对应候选复制后未整文件覆盖分析组板已有实现。`finite_mock=true` 比赛 BoardSpec 未改。

## 权限接线

- 浏览器/模型：Host 拒绝 `knowledge_citations` / `citation_ids` / `citations` / `knowledge_ids` / `owner` / 金额字段。保存合同 `CrmSaveAnalysis` 不含引用。`bind_session_citations=true` 只用当前对话登录会话账本（图谱 query/retrieve/expand 的 OK 结果）；账本按 session 隔离，断开即清除。
- 直连 CRM HTTP：保存带引用字段 422；绑定带 `owner` 422；他号绑定 404；无 ACL 或无权文档 403。Host 保存后可用账本调用 `POST .../knowledge-citations`。持有 **owner token 且 ACL 已授权该文档** 时，直连绑定仍可写入引用元数据（CRM 与图谱分进程，本轮不新增共享密钥），不能借此读取无权文档。
- 读取/分享/列表/library/组板/驾驶舱/快照：有引用则每次按当前用户名重查 `FQ_CRM_GRAPH_ACL_FILE`。无引用不读 ACL。分享者能读不等于接收者能读。
- 幂等重放：save/pin/组板回执、PATCH、分享、绑定均再次检查当前文档 grants；文档撤权后不能靠旧 key 恢复。撤销分享本身不要求文档 grants，便于清理。
- 候选 `weknora_search`：图谱插件在自身 ctx 注册 `tools.guard`，卸载时释放。候选 persona 使用 `query_crm_knowledge_sources`。现役 6677 preset 未改。

覆盖入口：保存、绑定引用、分享、撤销、GET、搜索、library、pin、组板保存/读取/搜索/PATCH、快照非 owner 读取。

## 最终验证

CRM 专项：`scripts/crm-calibration/verify.py`（证据 `.context/checks/crm-candidate-20260921T055742Z/`）

| 命令 | 结果 |
|---|---|
| crm-assets-ruff | 通过 |
| backend 专项 | 181 passed |
| ruff | 通过 |
| generate_contract --check | 通过 |
| generate_types --check | 通过 |
| 插件构建 | 通过 |
| Node 源测试（含 Chrome 旅程） | 101 passed |
| 原生 Host | 22 passed |

Chrome 旅程（隔离临时端口、合成数据）：查询→保存→编辑→组板→分享 200→撤权 404→刷新重开；bob 读组板 404。金额 8001 为合成夹具。

仓库验证矩阵：`python3 scripts/ci/run_checks.py --files-from <changed>`，计划 `backend=full`，B0/Vue 未选。证据 `.context/checks/20260921T055921901988Z/`。合成 backend 全套 **2852 passed / 78 skipped / 71 deselected**，12 组，ruff 与 import 检查通过。skip 不计通过。不与专项 181 或 Node 101 相加。

### `validate_pack.py` 覆盖

| 轮次 | 覆盖 | 证据 |
|---|---|---|
| 原 `verify.py` / 全量 backend | 当时仍会把校验结果写到 `docs/crm-calibration/deliveries/C/`；知识包测试在该版本上通过，含在专项 181 与全量 2852 中 | `.context/checks/crm-candidate-20260921T055742Z/`、`.context/checks/20260921T055921901988Z/` |
| 增量 | 去掉 docs 写出，只写 `knowledge/crm/tests/validation-result.json`。`test_crm_knowledge_pack.py` 6 项：`test_c_pack_validate_and_honesty`、`test_acceptance_questions_do_not_claim_legacy_fixed`、`test_runtime_reads_confirmed_definitions_and_citations`、`test_runtime_preserves_capability_gaps_and_conflicts`、`test_runtime_never_authorizes_external_actions_or_claims_graph_server`、`test_verification_receipt_is_bound_to_current_files` | `.context/checks/crm-pack-validate-20260921T060515Z/`（6 passed）及收尾复测 `.context/checks/crm-review-regression-20260921T061200Z/` |
| 最终指纹 | `knowledge/crm/tests/validate_pack.py` SHA256 `1955747d3c11f3047c2ef92c6cb11d63a210e7f2a9d63bb98775be2b31f07081` | 收尾后未再改该文件 |

`test_verification_receipt_is_bound_to_current_files` 绑定的是知识包 `verification.json` 与实现文件哈希，不是 `validate_pack.py` 本身。docs/deliveries 在增量复测后不再出现。

### 源码指纹（收尾后）

| 路径 | SHA256 |
|---|---|
| `backend/services/crm_analysis.py` | `24009f3bb75910b30d10f3a05cc4a9d8ef94c5a0184d1d1079a98c9523ed8c1c` |
| `backend/services/crm_document_acl.py` | `e8b312dc347e9c6951d703c5b817ab68d361508f410ac366614ec6f9f3a4a61e` |
| `backend/contracts/crm_analysis.py` | `e0a0d759ec63fb9b98b4216361d5bf2c4d877844a6234d6b825b222d7dfff3c8` |
| `backend/contracts/crm-dashboard.openapi.json` | `527cbd240b8bd2adbc67f185edc1109b4e7b06ee2d311eca6a39e7297cc5652c` |
| `dsh-plugins/crm-knowledge/src/dashboard-access.mjs` | `90ad7c7c5c08418dc377a4c6d175aa71c80901b20122b7470719b58018958134` |
| `dsh-plugins/crm-knowledge/src/graph.mjs` | `9878da34de5bf49aec05c92365529222bbd9aba01491702da498e981e0a213d0` |
| `dsh-plugins/crm-knowledge/src/graph-tools.ts` | `e1066b4d8fad7d751d305f3228e6fcf66b696330e80a5de1f614a1504d25d5f8` |
| `knowledge/crm/tests/validate_pack.py` | `1955747d3c11f3047c2ef92c6cb11d63a210e7f2a9d63bb98775be2b31f07081` |

原 `verify.py` 的 `source_hashes` 对应审查前快照；收尾改动见上表与增量复测。完整专项指纹仍见 `crm-candidate-20260921T055742Z/summary.json`。

### 分层

- **合成**：上述专项、Host、Chrome 旅程、指标 closeout 夹具；收尾增量 29 passed（分析+知识包）与 Host/资产 28 passed。
- **既有真实证据**：GSV/AOV/AUS 10 组只读复算记录仍在指标候选 gitignore 目录；图谱部署账本 1163 条关系。本轮未新读归档、未付费抽取。
- **本轮未运行**：6677 reload、现役 preset、真实账号 MiniMax、本人 UAT、远端 CI、完整 B0 pipeline、Vue 构建。收尾未机械重跑全量 2852。

失败记录：Host 曾因重复注册 `weknora_search` 失败，改为 `tools.guard` 后通过；卸载后 `weknora_search` 恢复。`git diff --check` 曾报 `test_crm_analysis.py` 末尾空行，已修。不覆盖各候选历史失败证据。

## 审查结论与修复

| 项 | 结论 |
|---|---|
| 引用绑定 | 浏览器/模型不能提交来源。保存合同无引用字段。Host 只绑定当前登录会话账本。直连 owner+已授权文档仍可写引用元数据，无权文档不能读。 |
| 权限重查 | 读/分享/列表/library/组板/驾驶舱/非 owner 快照及 save/pin/组板/PATCH/分享/绑定回放均重查当前 grants。撤销分享不要求文档 grants。 |
| weknora guard | 随图谱插件 ctx 注册与卸载；卸载后共享检索恢复。候选 preset 内生效；现役 preset 未改。 |
| 旧数据 | 无 `knowledge_citations` 的旧 payload 可读，空引用不写入 SQLite。先 pin 后 bind 会更新已存驾驶舱嵌套分析。含引用的新记录，旧 extra=forbid 进程不能读。 |

## 仍需外部来源或后续授权

- 成交时会员身份或入会/退会事件；成功退款流水及父子订单归属；可按退款截止日重算的全店首购；派样资格；利润 ROI 另需成本。
- 图谱 1113 条待核对；抽取时未保存原文哈希，`extraction_content_hashes_saved=false`。
- Git 提交/PR/合入、6677 加载本候选、真实模型与本人 UAT。这些是发布阻断，不是本工作树代码收尾阻断。

## 未来部署与回退（不执行）

- 部署需同时更新 CRM 后端、插件 Host 与候选 profile；`FQ_CRM_ANALYSIS_STATE_DIR` / `FQ_CRM_ANALYSIS_DATA_KIND` 与 Host `dataKind` 一致；含引用分析另需 `FQ_CRM_GRAPH_ACL_FILE`（0600）。
- 只换 preset 不能给旧 Host 增加 snapshot/purchases/ACL。重启后用户需重新连接 CRM。
- 回退：停用本工作树候选、保持 6677 当前公开 #36 之后的 0.13.0.0；分析 SQLite 与图谱 ACL 文件留在私有目录。无引用字段的旧库可被新代码读取；含引用的新库不能被旧 extra=forbid 代码读取。
- 代码可降级不代表已保存分析/组板/引用数据可降级。

## 可提交结论

**工作树代码收尾可提交。** 产品仍 PARTIAL。未授权前保持 uncommitted。`git diff --check` 已干净。STATUS 42 行。

发布仍待：授权提交、push/PR/merge、6677 reload、真实来源、1113 条图谱审核、本人 UAT。

### 提交时暂存清单（勿 `git add -A`）

已跟踪修改：

- `CHANGELOG.md` `STATUS.md`
- `backend/contracts/crm-dashboard.openapi.json` `backend/contracts/crm_analysis.py` `backend/contracts/crm_dashboard.py`
- `backend/routers/crm_dashboard.py` `backend/routers/metrics.py`
- `backend/services/crm_analysis.py` `backend/services/metrics/dashboard_purchases.py`
- `backend/tests/test_crm_analysis.py`
- `docs/crm-calibration/graph-deployment.md` `docs/crm-calibration/metric-readiness.md`
- `docs/hackathon/README.md` `docs/hackathon/TODOS.md`
- `dsh-plugins/crm-knowledge/README.md`
- `dsh-plugins/crm-knowledge/src/client/crm-library.tsx`
- `dsh-plugins/crm-knowledge/src/crm-assets.mjs` `dashboard-access.mjs` `dashboard-contract.generated.d.ts` `dashboard.mjs` `graph-tools.ts` `graph.mjs` `index.ts`
- `dsh-plugins/crm-knowledge/test/contract.typecheck.ts` `crm-assets.fixture.mjs` `crm-assets.test.mjs` `graph.fixture.mjs` `graph.test.mjs` `host.integration.mjs` `login-ui.test.mjs`
- `knowledge/crm/tests/validate_pack.py`
- `scripts/crm-calibration/generate_contract.py` `prepare-profile.mjs` `verify.py`

未跟踪、应纳入：

- `backend/services/crm_document_acl.py`
- `backend/services/metrics/dashboard_membership.py` `dashboard_net_gsv.py` `dashboard_source.py`
- `backend/tests/test_crm_dashboard_closeout.py`
- `docs/crm-calibration/crm-analysis-board-2026-09-21.md` `crm-integration-2026-09-21.md` `metric-matrix.md`
- `dsh-plugins/crm-knowledge/src/client/crm-board-layout.mjs` `crm-board.tsx`
- `dsh-plugins/crm-knowledge/test/closeout.test.mjs` `crm-board-layout.test.mjs` `crm-journey-browser.test.mjs` `crm-journey-server.py`
- `scripts/crm-calibration/bounded_real_recompute.py` `graph-ledger.mjs`

不要纳入：`.context/`、凭据、数据库、`docs/crm-calibration/deliveries/`。
