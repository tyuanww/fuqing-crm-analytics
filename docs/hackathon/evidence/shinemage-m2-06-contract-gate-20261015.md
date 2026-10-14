# M2-06 CRM 保存、回读与权限合同复核（2026-10-15）

本文件先记录了本轮前置阻塞：旧的 Aside 历史页面在 candidate 停止后返回 `Failed to fetch`。随后按授权恢复了隔离 candidate `127.0.0.1:4332` 与独立 CRM storage `127.0.0.1:18099`，完成一次真实 CRM 快照、UI 保存/回读、分享权限负测和清理；live `4328` 与共享 `18093` 全程未修改。候选进程、存储容器和本地隧道已在验收后停止。

## 本地合同复核

使用固定 DSH `0.1.7-rc.2` 上游和锁定的 Python 3.14.4，重新运行 CRM host、HTTP consumer 和后端状态存储测试：

```text
CRM_METRICS_PYTHON=/Users/hutou/homebrew/bin/python3.14 \
B0_BUILD_UPSTREAM=.context/dsh-b0/upstream-0.1.7-rc.2 \
node --test dsh-plugins/crm-knowledge/test/host.integration.mjs
22 tests / 22 pass / 0 fail / 0 skipped

B0_BUILD_UPSTREAM=.context/dsh-b0/upstream-0.1.7-rc.2 \
node --test dsh-plugins/crm-knowledge/test/crm-assets.test.mjs
8 tests / 8 pass / 0 fail / 0 skipped

/Users/hutou/homebrew/bin/python3.14 -m pytest backend/tests/test_crm_analysis.py -q
30 passed / 0 failed / 1 warning
```

这些检查覆盖：当前会话登录边界、快照生成、服务端保存分析、按 ID 回读、标题/说明更新、组板引用、明确用户分享、撤权后的回读拒绝、伪造事实/来源/校验和拒绝、断开连接和超时回收。测试使用本地 synthetic fixture/SQLite/ASGI，不读取真实 CRM 行，也不等价于候选页面的真实模型 UAT。

## 门禁结论

```text
CRM_CONTRACT_SAVE_READ_SHARE_REVOKE_PASS
CRM_SYNTHETIC_PERMISSION_NEGATIVE_PASS
CANDIDATE_REAL_SNAPSHOT_WRITE_PASS
CANDIDATE_REAL_ANALYSIS_SAVE_READBACK_PASS
CANDIDATE_REAL_SHARE_UNKNOWN_ACCOUNT_REJECTED
CANDIDATE_REAL_REVOKE_NOT_RUN_NO_GRANT_CREATED
CANDIDATE_REAL_STORAGE_RECOVERY_PASS
CANDIDATE_RUNTIME_STOPPED_AFTER_UAT
```

## 隔离 candidate 的真实 UI 补验

候选 CRM 会话显示“CRM分析（已连接）”后，使用当前账号的 CRM 工具创建了一条真实快照：`ok=true`、`data_kind=real`、筛选为 `2025-01-01` 至 `2025-03-14`、渠道“全店”、`exclude_low_price=false`，快照编号为 `crm_s_fc61a330e2e3437f85e9905342e345f7`，结果摘要以 UI 回执为准。没有调用 workspace、SQL、知识库、分享、激活或驾驶舱引用。

在“CRM 分析”面板点击“保存分析”，标题填写为 `M2-06-CANDIDATE-20261015`。切换到“已保存分析”后，页面显示该标题及同一快照编号，完成真实 UI 保存和回读。随后尝试向不存在的账号 `m2-06-permission-negative-20261015` 分享，页面返回“找不到该 CRM 账号，未建立分享”，候选数据库 `grants` 表保持为空；由于没有成功建立 grant，本轮不把真实撤权读取拒绝记为通过，真实 revoke 保持 `NOT_RUN_NO_GRANT_CREATED`。合成/ASGI 合同仍覆盖成功分享、撤权和撤权后读取拒绝。

清理阶段仅删除本轮候选产生的一个 snapshot、一个 analysis 及对应 receipts；远端候选 SQLite 的 `assets`、`grants`、`receipts`、`command_receipts` 均回到 0。刷新候选 UI 的“已保存分析”列表后显示空列表，恢复核对通过。随后停止候选 DSH、18099 storage 和本地 4333 redirect；复核确认 4328 与 18093 仍由原有 live/shared 进程监听。主仓 profile/journal、真实业务 DuckDB、凭据和生产数据未修改。

因此 M2-06 的真实保存/回读、未知账号权限拒绝和候选存储恢复已关闭；真实“成功分享后撤权再读取拒绝”仍需一个可用的第二 CRM 账号，不能用不存在账号替代。
