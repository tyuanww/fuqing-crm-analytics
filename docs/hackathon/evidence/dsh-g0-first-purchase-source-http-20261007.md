# T3 查询/保存的只读来源 HTTP 边界（2026-10-07）

结论：**LOCAL SOURCE HTTP PASS / 整体 PARTIAL**。本批实现基于 `253cdbc7`；后续包必须记录自己的固定源码 SHA。没有生成 reviewed-SHA 新双包或生产 candidate；没有 push、Release、杭州操作或真实数据访问。

## 实现与责任

- 查询服务提供 `first-purchase-frozen-source/v1` / API `1.0.0`，只读取自己拥有的 RunStore；实际 source owner、run、SUCCEEDED 状态、冻结步骤、方法、请求与结果摘要由服务校验。
- 保存 factory 接受显式 `source_resolver`；HTTP 模式不传 RunStore/查询数据库路径。旧本机 adapter 保留，双重配置拒绝。原保存/回执/插件 HTTP schema 不变，新 source OpenAPI 由同一离线生成器维护。
- HTTP 只连显式字面 loopback：无 DNS、代理、redirect、Cookie、凭证缓存或自动重试；总网络时限、头/正文大小、严格 JSON/模型往返、owner/run/digest/请求结果绑定不满足即失败。CRM 身份 adapter 复用同一受限传输层，原错误语义保留。
- 新保存仍在本地事务内核验来源；远程 I/O 后再次核验账号、权限和策略。已提交相同请求先核对持久回执，查询断线不影响重放；来源断线的新保存、同键改标题、权限撤销均不能产生额外分析。没有跨服务事务、数据迁移或删除。

具体接口与限制见[保存准入说明](../../operating/first-purchase-save-admission.md#查询服务与保存服务的存储边界2026-10-07)。

## 本次实际验证

原始日志目录：`.context/checks/first-purchase-source-http-20261007/`。所有 pytest `--basetemp` 均使用新的独占目录；首次失败保留在 `new-http-initial.log`。下表属于本次执行，未借用旧包结果。

| 验证 | 结果 | 原始证据 |
|---|---|---|
| 受影响后端：来源、身份、保存准入/回执/恢复、原生查询与 CRM HTTP | **226 PASS / 0 SKIP** | `backend-final.log`，包括当时新增边界 24 项 |
| 两个真实 package allowlist 在独立目录、`python -I -B` 导入；禁止仓库回落/DB/联网 | **2 PASS** | `package-import-r2.log`；其余 24 项 deselected，不报全文件重跑 |
| 固定官方 rc2、新 source HTTP 的原生命令→worker→保存→ACK 核对→宿主重启 | **1 PASS** | `official-source-final.log`、该目录的 `source-boundary.json` / `official-host/http-observations.json` |
| 同一官方宿主的原有本机来源兼容模式 | **1 PASS** | `official-compat-final.log` / `http-observations.json` |
| 当前工作树保存服务实际 pack/安全解包/最小 runtime；时效开/关、重启、回执、forward-fix、CRM adapter | **2 PASS** | `package-regression.log`；工作树归档演练，非 clean release 包 |
| 离线 source OpenAPI + 原分析 API/插件 TypeScript 漂移检查 | **PASS** | `contract-check.log`；没有启动旧 CRM、打开库或访问网络 |
| Ruff、脚本语法、文档链接、Git 差异 | **PASS** | `static-checks.json` |

Python 测试为显式 B0 Python **3.14.4**（现有 FastAPI 0.136.1/Pydantic 2.13.2，不能称为生产依赖闭包）。实际服务归档测试使用已有 build venv 的 FastAPI **0.141.1**、Pydantic **2.13.5**、h11 **0.16.0**、uvicorn **0.47.0**，验证原 recipe 的 13 依赖最小 runtime。Node 为 **24.19.0**。本次没有升级解释器或安装新的环境。

关键重跑命令（仓库根；为 basetemp 选择新的专用目录）：

```bash
PATH=/Users/hutou/homebrew/opt/node@24/bin:/Users/hutou/homebrew/bin:$PATH \
  /tmp/dsh-b0-python.qW3lHO/venv/bin/python -m pytest --noconftest -q -W error::ResourceWarning \
  backend/tests/test_analytics_first_purchase_source_http.py \
  backend/tests/test_analytics_first_purchase_source.py \
  backend/tests/test_analytics_first_purchase_crm_identity.py \
  backend/tests/test_analytics_first_purchase_save_api.py \
  backend/tests/test_analytics_first_purchase_save_receipts.py \
  backend/tests/test_analytics_first_purchase_save_recovery.py \
  backend/tests/test_analytics_first_purchase_analysis.py \
  backend/tests/test_analytics_first_purchase_native.py \
  backend/tests/test_analytics_first_purchase_native_identity.py \
  backend/tests/test_analytics_first_purchase_native_crm_http.py

# 同一个宿主入口：设置 B0_NATIVE_CRM_SOURCE_HTTP=1 为新路径；去掉为原兼容模式。
# B0_NATIVE_CRM_HOST_UPSTREAM 指向已有、未修改、已构建的固定 rc2 checkout。
# 不设置 B0_NATIVE_CRM_ARTIFACT_MANIFEST 或浏览器变量。
B0_NATIVE_CRM_SOURCE_HTTP=1 B0_NATIVE_CRM_HOST_UPSTREAM=/absolute/built-pinned-rc2 \
  /tmp/dsh-b0-python.qW3lHO/venv/bin/python -m pytest --noconftest -q -W error::ResourceWarning \
  backend/tests/test_analytics_first_purchase_official_host.py

node scripts/dsh-b0/first-purchase-analysis-contract.mjs --check \
  --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python

CRM_SERVICE_PYTHON="$PWD/.context/checks/service-package-pair-20261005/build-venv/bin/python" \
  node --test --test-name-pattern='first-purchase archive saves' scripts/crm-calibration/service-package.test.mjs
```

运行上述 Node/Host 命令前均需相同 Node24 PATH。当前测试文件在 226 项执行后又加入 2 项 allowlist 回归并单独实跑，因此按当前文件重新收集会是 228 项；本证据不伪称已整组重跑 228 项。pytest 各有一项现有 warning，不称为零告警。

## 进程、证据与审修

独立保存子进程审计只允许 `first_purchase_analyses.sqlite3`，实际第一次保存后退出；查询服务关闭，第二个保存进程重新打开自有库并重放原回执，分析数保持 **1**。`backend-final/test_separate_save_process_ope0/save-process-*.json` 记录两次退出。官方 Host 新/旧模式分别记录加载与重启 PID；全部 6 个记录 PID 已退出，固定 4335/4336/4337 无监听。旧查询包及宿主证据的 13 份文件 SHA、原 journal SHA/seq 3 均保留，见 `final-integrity.json`。

发现并修复：测试守卫最初误把 SQLite `file://` URI 当普通路径；初始 lint 发现身份 helper 提取遗漏引用。审查补强了 HTTP 读取后的权限/策略重验，并增加三种撤销和实际写锁争用测试；同时补上查询包的 CRM 身份 adapter 文件，实际 allowlist 导入测试显式构造该 adapter，防止只在源码环境能启动。没有把这些失败标为 PASS；原失败日志保留。

OCR delegate 由当前 Agent 本机执行选文件/解析规则并审核；默认排除的测试和文档补审。覆盖、规则、文件摘要与最终结论见 `ocr-preview-final.json`、`ocr-rules.json`、`review-summary.json`。无需外部 LLM/reviewer。

## 用户要求的提交前复审（2026-10-07）

再次执行 `ocr delegate preview --format json` 与 `ocr delegate rule --format json`，当前 Agent 审核全部 **23/23** 文件：15 个工具选中项、8 个默认排除项补审，没有跳过，也没有确认新增阻塞缺陷。覆盖 `(path,status)`、规则及文件摘要保留在 `.context/checks/first-purchase-source-review-20261007/`。

本轮重新执行受影响十个后端文件，**228 PASS / 0 SKIP，53.56 秒**；新来源 HTTP 的固定官方 Host **1 PASS，3.60 秒**。两次 pytest 各有一项现有 warning。离线 OpenAPI/TypeScript、Ruff 与 `git diff --check` 通过。没有重跑上一阶段归档双模式、旧来源 Host 或 Chrome，不将那些历史结果计作本次实跑。尚未关闭项继续限制后续固定包与生产结论。

## 尚未关闭

- 新接口的 reviewed-SHA 双包、独立 runtime 冷安装/组合、candidate receipt、Linux/WSL 及恢复仍 **NOT_RUN**。现有 v3 包模式缺少本次接口，显式禁止与新源码模式混用；不改写旧包或旧 journal。
- 本次实际归档回归证明旧本机 source adapter 仍可用，不证明新 HTTP adapter 已在完整双包部署中通过。服务包仍保留兼容代码；源码依赖的进一步瘦身与物理分仓另行推进。
- Chrome/headed/移动端/无障碍、真实模型、生产 CRM 账号/准入及业务 UAT 本次 **NOT_RUN**。官方 Host 使用 mock model、合成 CRM 和 JSON，候选为合成 digest。
- 目前只支持同机 loopback；跨机器身份委托和传输保护未实现。保存基于来源读取时的已认证不可变快照，没有跨服务原子撤权保证。来源慢会占用有时限的保存写锁，争用者需要原标识重试。
- 签名/SBOM/供应链、生产 activation/journal/reconcile/canary，以及物理多仓 stop/go 保持开放。**不满足生产 release/激活条件**。
