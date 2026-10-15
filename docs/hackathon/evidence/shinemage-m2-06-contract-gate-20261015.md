# M2-06 CRM 保存、回读与权限合同复核（2026-10-15）

本文件先记录了本轮前置阻塞和第一次未知账号负测：旧的 Aside 历史页面在 candidate 停止后返回 `Failed to fetch`；随后按授权恢复了隔离 candidate `127.0.0.1:4332` 与独立 CRM storage `127.0.0.1:18099`，完成真实 CRM 快照、UI 保存/回读、未知账号分享拒绝和清理。第一次复核当时没有建立 grant，因此当时的 `NOT_RUN_NO_GRANT_CREATED` 只属于该次尝试。之后在同一隔离边界内注入临时 `admin1` 并完成成功分享、共享读取、owner 撤权、撤权后读取拒绝和持久化复核；当前真实 revoke 结论以[隔离 candidate 真实分享与撤权回执](shinemage-m2-06-real-revoke-20261015.md)为准。live `4328` 与共享 `18093` 全程未修改，候选进程、存储容器和本地隧道已在验收后停止。

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
CANDIDATE_REAL_REVOKE_NOT_RUN_NO_GRANT_CREATED_INITIAL_ATTEMPT
BLOCKED_SECOND_CRM_ACCOUNT_INITIAL_ATTEMPT
CANDIDATE_REAL_STORAGE_RECOVERY_PASS
REAL_CLEANUP_PASS
CANDIDATE_RUNTIME_STOPPED_AFTER_UAT
```

## 隔离 candidate 的真实 UI 补验

候选 CRM 会话显示“CRM分析（已连接）”后，使用当前账号的 CRM 工具创建了一条真实快照：`ok=true`、`data_kind=real`、筛选为 `2025-01-01` 至 `2025-03-14`、渠道“全店”、`exclude_low_price=false`，快照编号为 `crm_s_fc61a330e2e3437f85e9905342e345f7`，结果摘要以 UI 回执为准。没有调用 workspace、SQL、知识库、分享、激活或驾驶舱引用。

在“CRM 分析”面板点击“保存分析”，标题填写为 `M2-06-CANDIDATE-20261015`。切换到“已保存分析”后，页面显示该标题及同一快照编号，完成真实 UI 保存和回读。第一次尝试向不存在的账号 `m2-06-permission-negative-20261015` 分享，页面返回“找不到该 CRM 账号，未建立分享”，候选数据库 `grants` 表保持为空；这部分只保留为未知账号拒绝的负测，不代表成功分享后的撤权。

清理阶段仅删除本轮候选产生的一个 snapshot、一个 analysis 及对应 receipts；远端候选 SQLite 的 `assets`、`grants`、`receipts`、`command_receipts` 均回到 0。刷新候选 UI 的“已保存分析”列表后显示空列表，恢复核对通过。随后停止候选 DSH、18099 storage 和本地 4332/4336 SSH tunnel；复核确认 4328 与 18093 仍由原有 live/shared 进程监听。主仓 profile/journal、真实业务 DuckDB、凭据和生产数据未修改。

验收后的资源复核发现两条历史 candidate 目录 `m2-06-candidate-r4`、`m2-06-candidate-r4b` 和已退出的 `shinemage-m2-06-crm-storage-r1` 容器仍留在远端；确认没有 candidate 进程或 4332/4336/18099 监听后，按精确路径回收了这两个目录和容器。随后复核结果为：candidate 目录 `0`、storage 容器 `0`、远端 `4328=1`、`18093=1`、`4332=0`、`4336=0`、`18099=0`；本地 `4332/4336` 也为 `0`。另有两条扫描已删除 candidate 路径的旧 grep 进程已按精确 PID 结束。该补充清理不触碰 live/shared 进程或数据。

因此本文件的首次复核关闭了真实保存/回读、未知账号权限拒绝和候选存储恢复子项，但成功分享后的撤权链路由后续补验单独完成。当前 M2-06 的最终 disposition 为 `REAL_SHARE_READ_PASS / REAL_REVOKE_READ_DENIED_PASS / REAL_REVOKE_PERSISTED_PASS / REAL_CLEANUP_PASS`；后续回执使用隔离临时 `admin1`，不是生产账号，也没有修改 live/shared 配置。

## 后续真实分享与撤权补验

后续补验在独立 `18099` storage candidate 中完成：owner 分享给临时 `admin1` 后，reader 成功读取；owner 撤权后，reader 对同一分析 ID 返回 `404/NOT_FOUND`，共享列表不再出现，owner 查询 grants 仍为空。临时容器、状态目录、监听和账号均已回收，live `4328` 与共享 `18093` 保持不变。完整请求顺序、响应状态和清理复核见[隔离 candidate 真实分享与撤权回执](shinemage-m2-06-real-revoke-20261015.md)。
