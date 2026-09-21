# CRM 分析管理与可编辑组板（2026-09-21）

基线为新公开仓库 main `64eb6e0`（#37）。工作树 `/Users/hutou/.codex/worktrees/crm-analysis-board/fuqing-crm-analytics`，分支 `codex/crm-analysis-board`。不沿用旧仓 `7c20bc4f`。未并入 `codex/cockpit-inline-edit`。产品仍 PARTIAL。事后：代码已随 v0.14.0.0 提交并推送；未合入 main、无 PR、6677 未 reload。

## 账号模型

CRM 登录账号来自 `FQ_CRM_PASSWORDS`（`backend/routers/auth.py` 的 `VALID_CREDENTIALS`），用户名 `[A-Za-z0-9_.@-]{1,64}`。分享只接受其中已有账号，不生成公开链接，不枚举用户列表。

## 行为

- 分析搜索：标题、说明或精确 ID；每页最多 20 条，`next_cursor` 续页。
- PATCH 分析：标题、说明、`base_revision`。金额、分母、口径、快照哈希不可写。
- 分享 / 撤销：owner 写入 `grants`；被授权者可读分析；撤权后同一 token GET 为 404。
- 组板：独立 `crm-board/v1`，组件含 analysis_id、snapshot_id、metric、layout、display。服务端填入 filters 与金额。比赛 BoardSpec / `finite_mock=true` 未改。

## 本工作树验证

- `scripts/crm-calibration/verify.py`：crm-assets-ruff、backend 专项、ruff、合同、类型、构建、cli-tools、host-tools 通过。证据 `.context/checks/crm-candidate-20260921T044516Z/`。
- 影响范围：backend=full，B0/Vue 未选。合成 backend 全套 2839 passed、77 skipped、71 deselected，12 组，证据 `.context/checks/20260921T044846926633Z/`。首次因 PATH 无 lsof 失败，补 `/usr/sbin` 后通过。
- Chrome：`crm-journey-browser.test.mjs` 对真实 FastAPI/SQLite 走查询→保存→编辑→组板→刷新重开，GSV 8001，另一账号 404。
- 编译后 React：保存确认/重试、搜索续页、PATCH 不含金额、组板保存不含 value。原生 Host 21 项通过。
- 未跑：本候选加载 6677、真实账号 MiniMax 重测、本人 UAT、远端 CI。
