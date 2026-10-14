# M2-06 CRM 保存、回读与权限合同复核（2026-10-15）

本轮继续 M2-06，但当前隔离 candidate `127.0.0.1:4332` 已停止；Aside 历史页面打开“CRM 分析”后实际返回 `Failed to fetch`，因此没有把历史会话当作新的真实业务证据，也没有重新启动 live/shared 服务。

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
CANDIDATE_RUNTIME_CURRENTLY_NOT_RUNNING
REAL_CRM_ANALYSIS_SAVE_READBACK_NOT_RECONFIRMED
REAL_CRM_PERMISSION_NEGATIVE_NOT_RUN
```

仓库后端合同本身具备保存、回读、分享和撤权能力；当前阻塞来自 candidate runtime 不可达以及模型工具面只公开快照查询，不能把本地合同测试写成真实 CRM 业务验收。下一次真实补验需要恢复隔离 candidate 和独立 storage，在用户重新绑定当前 CRM 会话后，通过 CRM 分析 UI 完成一次标题保存、按 ID 回读和撤权后的读取拒绝，然后再次清理并核对 SQLite 为空。live `4328`、共享 `18093`、主仓 profile/journal 和生产数据均未修改。
